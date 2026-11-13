import { NextResponse, type NextRequest } from "next/server";
import { Types, type ClientSession } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaReconciliationModel from "@/lib/models/chama-reconciliation";
import ChamaRoundModel from "@/lib/models/chama-round";
import { toNonNegativeMinorUnits } from "@/lib/finance/money";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";
import { ensureFinanceIndexes, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";

type Params = { params: Promise<{ groupId: string }> };

const canReconcile = (user: Awaited<ReturnType<typeof getSessionUser>>, member: Awaited<ReturnType<typeof getGroupMember>>) =>
  isSiteAdmin(user) || hasGroupRole(member, ["admin", "treasurer"]);

const summarizePeriod = async (groupId: Types.ObjectId, currency: string, start: Date, end: Date, session?: ClientSession) => {
  let aggregate = ChamaFinancialTransactionModel.aggregate([
    {
      $match: {
        groupId,
        currency,
        transactionDate: { $gte: start, $lte: end },
        amountMinor: { $type: "number" },
      },
    },
    { $group: { _id: { type: "$type", status: "$status", direction: "$direction" }, totalMinor: { $sum: "$amountMinor" } } },
  ]);
  if (session) aggregate = aggregate.session(session);
  const rows = await aggregate;
  const total = (predicate: (row: (typeof rows)[number]) => boolean) =>
    rows.filter(predicate).reduce((sum, row) => sum + row.totalMinor, 0);
  const recordedContributionsMinor = total((row) => row._id.type === "contribution" && !["reversed", "failed"].includes(row._id.status));
  const verifiedContributionsMinor = total((row) => row._id.type === "contribution" && row._id.status === "verified");
  const recordedPayoutsMinor = total((row) => row._id.type === "payout" && ["pending_transfer", "transferred", "confirmed"].includes(row._id.status));
  const confirmedPayoutsMinor = total((row) => row._id.type === "payout" && row._id.status === "confirmed");
  const otherInMinor = total((row) =>
    ["refund", "adjustment", "reversal"].includes(row._id.type) && ["verified", "confirmed"].includes(row._id.status) && row._id.direction === "in"
  );
  const otherOutMinor = total((row) =>
    ["refund", "adjustment", "reversal"].includes(row._id.type) && ["verified", "confirmed"].includes(row._id.status) && row._id.direction === "out"
  );
  let outstandingObligationsMinor = 0;
  let openRoundQuery = ChamaRoundModel.findOne({ groupId, status: "open" });
  if (session) openRoundQuery = openRoundQuery.session(session);
  const openRound = await openRoundQuery.lean();
  if (openRound?.memberObligations?.length) {
    let paidAggregate = ChamaFinancialTransactionModel.aggregate([
      {
        $match: {
          groupId,
          roundId: openRound._id,
          currency,
          type: "contribution",
          status: "verified",
        },
      },
      { $group: { _id: "$memberId", totalMinor: { $sum: "$amountMinor" } } },
    ]);
    if (session) paidAggregate = paidAggregate.session(session);
    const paid = await paidAggregate;
    const paidMap = new Map(paid.map((row) => [String(row._id), row.totalMinor as number]));
    outstandingObligationsMinor = openRound.memberObligations.reduce((sum, item) =>
      sum + Math.max(0, item.amountMinor - (paidMap.get(String(item.memberId)) ?? 0)), 0);
  }

  return {
    recordedContributionsMinor,
    verifiedContributionsMinor,
    recordedPayoutsMinor,
    confirmedPayoutsMinor,
    outstandingObligationsMinor,
    netVerifiedMovementMinor: verifiedContributionsMinor - confirmedPayoutsMinor + otherInMinor - otherOutMinor,
  };
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    const member = await getGroupMember(groupId, user);
    if (!canReconcile(user, member)) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    const reconciliations = await ChamaReconciliationModel.find({ groupId }).sort({ periodEnd: -1, createdAt: -1 }).limit(50).lean();
    const group = await ChamaGroupModel.findById(groupId).lean();
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const summary = await summarizePeriod(new Types.ObjectId(groupId), group?.currency ?? "KES", periodStart, now);
    return NextResponse.json({
      summary: { currency: group?.currency ?? "KES", periodStart, periodEnd: now, ...summary },
      reconciliations,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load reconciliation data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    await ensureFinanceIndexes();
    const member = await getGroupMember(groupId, user);
    if (!canReconcile(user, member)) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    const group = await ChamaGroupModel.findOne({ _id: groupId, status: "active" }).lean();
    if (!group) return NextResponse.json({ error: "Active group not found." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const periodStart = new Date(body.periodStart);
    const rawPeriodEnd = String(body.periodEnd ?? "");
    const periodEnd = new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawPeriodEnd) ? `${rawPeriodEnd}T23:59:59.999Z` : rawPeriodEnd);
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart > periodEnd) {
      return NextResponse.json({ error: "Choose a valid reconciliation period." }, { status: 400 });
    }
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
    }
    const notes = String(body.notes ?? "").trim().slice(0, 2000);
    const statementReference = String(body.statementReference ?? "").trim().slice(0, 120);

    const reconciliation = await runInFinancialTransaction(async (session) => {
      const existing = await ChamaReconciliationModel.findOne({ groupId: new Types.ObjectId(groupId), idempotencyKey }).session(session).lean();
      if (existing) {
        const sameRequest =
          new Date(existing.periodStart).getTime() === periodStart.getTime() &&
          new Date(existing.periodEnd).getTime() === periodEnd.getTime() &&
          existing.openingBalanceMinor === toNonNegativeMinorUnits(body.openingBalance, group.currency) &&
          existing.reportedClosingBalanceMinor === toNonNegativeMinorUnits(body.reportedClosingBalance, group.currency) &&
          existing.notes === notes && existing.statementReference === statementReference;
        if (!sameRequest) throw new Error("IDEMPOTENCY_KEY_REUSED");
        return { reconciliation: existing, replayed: true };
      }
      const summary = await summarizePeriod(new Types.ObjectId(groupId), group.currency, periodStart, periodEnd, session);
      let openingBalanceMinor: number;
      let reportedClosingBalanceMinor: number;
      try {
        openingBalanceMinor = toNonNegativeMinorUnits(body.openingBalance, group.currency);
        reportedClosingBalanceMinor = toNonNegativeMinorUnits(body.reportedClosingBalance, group.currency);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Invalid reconciliation balance.");
      }
      const expectedClosingBalanceMinor = openingBalanceMinor + summary.netVerifiedMovementMinor;
      const discrepancyMinor = reportedClosingBalanceMinor - expectedClosingBalanceMinor;
    const [record] = await ChamaReconciliationModel.create([{
        groupId: new Types.ObjectId(groupId),
        periodStart,
        periodEnd,
        currency: group.currency,
        ...summary,
        openingBalanceMinor,
        reportedClosingBalanceMinor,
        expectedClosingBalanceMinor,
        discrepancyMinor,
        status: discrepancyMinor === 0 ? "matched" : "discrepancy",
        notes,
        statementReference,
        recordedBy: user.id,
        idempotencyKey,
        confirmedAt: new Date(),
      }], { session });
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: "reconciliation.recorded",
        entityType: "reconciliation",
        entityId: String(record._id),
        reason: notes,
        newValues: {
          periodStart,
          periodEnd,
          status: record.status,
          discrepancyMinor,
          statementReference,
        },
      }, session);
      return { reconciliation: record.toObject(), replayed: false };
    });
    return NextResponse.json(reconciliation, { status: reconciliation.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
      return NextResponse.json({ error: "This idempotency key was already used for a different reconciliation." }, { status: 409 });
    }
    if (error instanceof Error && /Amount|Currency|decimal places|range/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Reconciliation writes require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to record reconciliation." }, { status: 500 });
  }
}
