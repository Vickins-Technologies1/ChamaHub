import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaRoundModel from "@/lib/models/chama-round";
import { toMinorUnits } from "@/lib/finance/money";
import {
  ensureFinanceIndexes,
  isDuplicateKeyError,
  runInFinancialTransaction,
  writeFinanceAudit,
} from "@/lib/finance/service";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !member) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    const canReview = isAdmin || hasGroupRole(member, ["admin", "treasurer"]);
    const query: Record<string, unknown> = { groupId: new Types.ObjectId(groupId), type: "payout" };
    if (!canReview) query.memberId = new Types.ObjectId(String(member?._id));
    const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get("limit")) || 50));
    const payouts = await ChamaFinancialTransactionModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    return NextResponse.json({ payouts });
  } catch {
    return NextResponse.json({ error: "Unable to load payouts." }, { status: 500 });
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
    const isAdmin = isSiteAdmin(user);
    const requester = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(requester, ["admin", "treasurer"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const group = await ChamaGroupModel.findOne({ _id: groupId, status: "active" }).lean();
    if (!group) return NextResponse.json({ error: "Active group not found." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const roundId = String(body.roundId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!Types.ObjectId.isValid(roundId) || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: "A valid round and idempotency key are required." }, { status: 400 });
    }
    const round = await ChamaRoundModel.findOne({ _id: roundId, groupId, status: "open" }).lean();
    if (!round) return NextResponse.json({ error: "Open round not found." }, { status: 404 });
    if (round.snapshotStatus !== "confirmed" || !round.expectedTotalMinor || !round.currencySnapshot) {
      return NextResponse.json({ error: "Treasury review is required before recording this payout." }, { status: 409 });
    }
    const recipientId = String(round.recipientMemberId);
    const recipientIncluded = round.eligibleMemberIds.some((id) => String(id) === recipientId);
    if (!recipientIncluded) return NextResponse.json({ error: "Payout recipient is outside the locked round roster." }, { status: 409 });

    const obligations = round.memberObligations.map((item) => ({ memberId: String(item.memberId), amountMinor: item.amountMinor }));
    const contributionRows = await ChamaFinancialTransactionModel.aggregate([
      {
        $match: {
          groupId: new Types.ObjectId(groupId),
          roundId: new Types.ObjectId(roundId),
          type: "contribution",
          status: "verified",
        },
      },
      { $group: { _id: "$memberId", totalMinor: { $sum: "$amountMinor" } } },
    ]);
    const verifiedByMember = new Map(contributionRows.map((item) => [String(item._id), item.totalMinor as number]));
    const outstanding = obligations.reduce((sum, obligation) =>
      sum + Math.max(0, obligation.amountMinor - (verifiedByMember.get(obligation.memberId) ?? 0)), 0);
    if (outstanding > 0) {
      return NextResponse.json({ error: "Verify all round contribution obligations before initiating the payout.", outstandingMinor: outstanding }, { status: 409 });
    }
    const verifiedTotal = contributionRows.reduce((sum, item) => sum + (item.totalMinor as number), 0);
    let amountMinor: number;
    try {
      amountMinor = toMinorUnits(body.amount, round.currencySnapshot);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid amount." }, { status: 400 });
    }
    if (amountMinor > verifiedTotal) {
      return NextResponse.json({ error: "Payout cannot exceed verified contributions for this round." }, { status: 400 });
    }
    const reference = String(body.reference ?? "").trim().slice(0, 120);
    const method = String(body.method ?? "").trim().slice(0, 50);
    if (!method) return NextResponse.json({ error: "Payment method is required." }, { status: 400 });

    const result = await runInFinancialTransaction(async (session) => {
      const existing = await ChamaFinancialTransactionModel.findOne({ groupId, idempotencyKey }).session(session).lean();
      if (existing) {
        if (
          existing.type !== "payout" || String(existing.roundId) !== roundId ||
          existing.amountMinor !== amountMinor || existing.memberId?.toString() !== recipientId ||
          existing.method !== method || existing.reference !== reference
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        return { id: String(existing._id), status: existing.status, replayed: true };
      }
      const currentRound = await ChamaRoundModel.findOne({
        _id: new Types.ObjectId(roundId), groupId: new Types.ObjectId(groupId), status: "open",
        snapshotStatus: "confirmed", currencySnapshot: round.currencySnapshot,
      }).session(session).lean();
      if (!currentRound || String(currentRound.recipientMemberId) !== recipientId) throw new Error("ROUND_NOT_OPEN");
      const currentVerifiedRows = await ChamaFinancialTransactionModel.aggregate([
        {
          $match: {
            groupId: new Types.ObjectId(groupId), roundId: new Types.ObjectId(roundId),
            type: "contribution", status: "verified",
          },
        },
        { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
      ]).session(session);
      const currentVerifiedTotal = currentVerifiedRows[0]?.totalMinor ?? 0;
      if (amountMinor > currentVerifiedTotal) throw new Error("PAYOUT_EXCEEDS_VERIFIED");
      const [payout] = await ChamaFinancialTransactionModel.create([{
        groupId: new Types.ObjectId(groupId),
        type: "payout",
        direction: "out",
        amountMinor,
        currency: round.currencySnapshot,
        memberId: new Types.ObjectId(recipientId),
        roundId: new Types.ObjectId(roundId),
        recordedBy: user.id,
        method,
        reference,
        transactionDate: new Date(),
        status: "pending_transfer",
        idempotencyKey,
        description: String(body.description ?? "").trim().slice(0, 500),
        evidenceReference: String(body.evidenceReference ?? "").trim().slice(0, 500),
      }], { session });
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: "payout.initiated",
        entityType: "financial_transaction",
        entityId: String(payout._id),
        newValues: { amountMinor, currency: round.currencySnapshot, memberId: recipientId, status: payout.status },
      }, session);
      return { id: String(payout._id), status: payout.status, replayed: false };
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
      return NextResponse.json({ error: "This idempotency key was already used for a different payout." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ROUND_NOT_OPEN") {
      return NextResponse.json({ error: "The round has closed or its payout recipient changed." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PAYOUT_EXCEEDS_VERIFIED") {
      return NextResponse.json({ error: "Payout exceeds verified collections for this round." }, { status: 409 });
    }
    if (isDuplicateKeyError(error)) return NextResponse.json({ error: "A payout has already been recorded for this round." }, { status: 409 });
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Financial writes require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to record payout." }, { status: 500 });
  }
}
