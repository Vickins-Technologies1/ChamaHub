import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance/money";
import {
  ensureFinanceIndexes,
  isDuplicateKeyError,
  refreshRoundRecordedTotal,
  runInFinancialTransaction,
  writeFinanceAudit,
} from "@/lib/finance/service";
import {
  getGroupMember,
  getSessionUser,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };
type Cursor = { createdAt: string; id: string };

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
const decodeCursor = (value: string | null): Cursor | null => {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!cursor.createdAt || !Types.ObjectId.isValid(cursor.id) || Number.isNaN(Date.parse(cursor.createdAt))) {
      return null;
    }
    return cursor;
  } catch {
    return null;
  }
};

const sameContribution = (
  existing: { roundId?: unknown; memberId?: unknown; amountMinor?: number | null; reference?: string; method?: string },
  requested: { roundId: string; memberId: string; amountMinor: number; reference: string; method: string }
) =>
  String(existing.roundId) === requested.roundId &&
  String(existing.memberId) === requested.memberId &&
  existing.amountMinor === requested.amountMinor &&
  (existing.reference ?? "") === requested.reference &&
  (existing.method ?? "manual") === requested.method;

const contributionDto = (item: {
  _id: unknown;
  roundId?: unknown | null;
  memberId?: unknown | null;
  amountMinor?: number | null;
  amount?: number;
  currency: string;
  status: string;
  method?: string;
  reference?: string;
  transactionDate?: Date;
  paidAt?: Date;
  createdAt?: Date;
  recordedBy?: string;
}) => ({
  id: String(item._id),
  roundId: item.roundId ? String(item.roundId) : "",
  memberId: item.memberId ? String(item.memberId) : "",
  amountMinor: item.amountMinor ?? null,
  amount: item.amountMinor != null ? fromMinorUnits(item.amountMinor, item.currency) : item.amount ?? 0,
  currency: item.currency,
  status: item.status,
  method: item.method ?? "manual",
  reference: item.reference ?? "",
  paidAt: item.transactionDate ?? item.paidAt ?? item.createdAt ?? null,
  recordedBy: item.recordedBy ?? null,
  createdAt: item.createdAt ?? null,
});

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    }

    await connectMongoose();
    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !member) return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const group = await ChamaGroupModel.findById(groupId).lean();
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const cursorText = searchParams.get("cursor");
    const cursor = decodeCursor(cursorText);
    if (cursorText && !cursor) return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit")) || 50));
    const roundId = searchParams.get("roundId");
    const requestedMemberId = searchParams.get("memberId");
    if (roundId && !Types.ObjectId.isValid(roundId)) {
      return NextResponse.json({ error: "Invalid round id." }, { status: 400 });
    }
    if (requestedMemberId && !Types.ObjectId.isValid(requestedMemberId)) {
      return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    }

    const canReview = isAdmin || hasGroupRole(member, ["admin", "treasurer"]);
    const memberId = canReview ? requestedMemberId : String(member?._id);
    const from = searchParams.get("dateFrom");
    const to = searchParams.get("dateTo");
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
      return NextResponse.json({ error: "Invalid date filter." }, { status: 400 });
    }

    const baseQuery: Record<string, unknown> = { groupId: new Types.ObjectId(groupId), type: "contribution" };
    const legacyQuery: Record<string, unknown> = {
      groupId: new Types.ObjectId(groupId),
      $or: [{ financialTransactionId: null }, { financialTransactionId: { $exists: false } }],
    };
    if (roundId) {
      baseQuery.roundId = new Types.ObjectId(roundId);
      legacyQuery.roundId = new Types.ObjectId(roundId);
    }
    if (memberId) {
      baseQuery.memberId = new Types.ObjectId(memberId);
      legacyQuery.memberId = new Types.ObjectId(memberId);
    }
    if (fromDate || toDate) {
      const range = { ...(fromDate ? { $gte: fromDate } : {}), ...(toDate ? { $lte: toDate } : {}) };
      baseQuery.transactionDate = range;
      legacyQuery.paidAt = range;
    }
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt);
      const cursorId = new Types.ObjectId(cursor.id);
      const after = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursorId } },
      ];
      baseQuery.$or = after;
      legacyQuery.$and = [...(legacyQuery.$and as unknown[] ?? []), { $or: after }];
    }

    const [transactions, oldContributions] = await Promise.all([
      ChamaFinancialTransactionModel.find(baseQuery).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
      ChamaContributionModel.find(legacyQuery).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
    ]);
    const mappedTransactions = transactions.map((item) => ({ ...item, currency: item.currency ?? group.currency ?? "KES" }));
    const mappedLegacy = oldContributions.map((item) => ({
      ...item,
      currency: group.currency ?? "KES",
      status: item.status === "pending" ? "pending_verification" : "legacy_unverified",
      recordedBy: undefined,
    }));
    const combined = [...mappedTransactions, ...mappedLegacy].sort((a, b) => {
      const dateDifference = new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      return dateDifference || String(b._id).localeCompare(String(a._id));
    });
    const page = combined.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const entries = page.slice(0, limit).map((item) => contributionDto(item));
    const last = page.length > limit ? page[limit - 1] : null;
    return NextResponse.json({
      contributions: entries,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: new Date(last.createdAt ?? Date.now()).toISOString(), id: String(last._id) }) : null,
      hasMore,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load contributions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    }

    await connectMongoose();
    await ensureFinanceIndexes();
    const group = await ChamaGroupModel.findById(groupId).lean();
    if (!group || group.status !== "active") {
      return NextResponse.json({ error: "Active group not found." }, { status: 404 });
    }

    const requester = await getGroupMember(groupId, user);
    const isAdmin = isSiteAdmin(user);
    const body = await request.json().catch(() => ({}));
    const roundId = String(body.roundId ?? "");
    const memberId = String(body.memberId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!Types.ObjectId.isValid(roundId) || !Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "A valid round and member are required." }, { status: 400 });
    }
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
    }

    const member = await ChamaMemberModel.findOne({
      _id: new Types.ObjectId(memberId), groupId: new Types.ObjectId(groupId), status: "active",
    }).lean();
    if (!member) return NextResponse.json({ error: "Active member not found in this group." }, { status: 404 });
    const isSelf = member.userId === user.id || Boolean(user.email && member.email === user.email.toLowerCase());
    if (!isAdmin && !hasGroupRole(requester, ["admin", "treasurer"]) && !isSelf) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const round = await ChamaRoundModel.findOne({ _id: roundId, groupId, status: "open" }).lean();
    if (!round) return NextResponse.json({ error: "Open round not found in this group." }, { status: 404 });
    if (round.snapshotStatus !== "confirmed" || !round.currencySnapshot || !round.memberObligations?.length) {
      return NextResponse.json({ error: "Treasury review is required before recording payments for this round." }, { status: 409 });
    }
    const currencySnapshot = round.currencySnapshot;
    if (!round.eligibleMemberIds.some((id) => String(id) === memberId)) {
      return NextResponse.json({ error: "This member is not part of the round's locked contribution roster." }, { status: 409 });
    }

    let amountMinor: number;
    try {
      amountMinor = toMinorUnits(body.amount, currencySnapshot);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid amount." }, { status: 400 });
    }
    const transactionDate = body.paidAt ? new Date(body.paidAt) : new Date();
    if (Number.isNaN(transactionDate.getTime())) {
      return NextResponse.json({ error: "Invalid payment date." }, { status: 400 });
    }
    const method = String(body.method ?? "manual").trim().slice(0, 50) || "manual";
    const reference = String(body.reference ?? "").trim().slice(0, 120);
    const requested = { roundId, memberId, amountMinor, method, reference };

    try {
      const result = await runInFinancialTransaction(async (session) => {
        const existing = await ChamaFinancialTransactionModel.findOne({
          groupId: new Types.ObjectId(groupId), idempotencyKey,
        }).session(session).lean();
        if (existing) {
          if (!sameContribution(existing, requested)) throw new Error("IDEMPOTENCY_KEY_REUSED");
          return { id: String(existing._id), status: existing.status, replayed: true };
        }

        const currentRound = await ChamaRoundModel.findOne({
          _id: new Types.ObjectId(roundId),
          groupId: new Types.ObjectId(groupId),
          status: "open",
          snapshotStatus: "confirmed",
          currencySnapshot,
        }).session(session).lean();
        if (!currentRound || !currentRound.eligibleMemberIds.some((id) => String(id) === memberId)) {
          throw new Error("ROUND_NOT_OPEN");
        }

        const [transaction] = await ChamaFinancialTransactionModel.create([{
          groupId: new Types.ObjectId(groupId),
          type: "contribution",
          direction: "in",
          amountMinor,
          currency: currencySnapshot,
          memberId: new Types.ObjectId(memberId),
          roundId: new Types.ObjectId(roundId),
          recordedBy: user.id,
          reference,
          method,
          transactionDate,
          status: "pending_verification",
          idempotencyKey,
          description: String(body.description ?? "").trim().slice(0, 500),
          evidenceReference: String(body.evidenceReference ?? "").trim().slice(0, 500),
        }], { session });

        await ChamaContributionModel.create([{
          groupId: new Types.ObjectId(groupId),
          roundId: new Types.ObjectId(roundId),
          memberId: new Types.ObjectId(memberId),
          amount: fromMinorUnits(amountMinor, currencySnapshot),
          status: "pending",
          method,
          reference,
          paidAt: transactionDate,
          financialTransactionId: transaction._id,
        }], { session });
        await writeFinanceAudit({
          groupId,
          actorId: user.id,
          action: "contribution.recorded",
          entityType: "financial_transaction",
          entityId: String(transaction._id),
          newValues: { type: "contribution", amountMinor, currency: currencySnapshot, status: transaction.status },
        }, session);
        await refreshRoundRecordedTotal(new Types.ObjectId(roundId), session);
        return { id: String(transaction._id), status: transaction.status, replayed: false };
      });
      return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "ROUND_NOT_OPEN") {
        return NextResponse.json({ error: "This round has closed or its roster changed. Reload and try again." }, { status: 409 });
      }
      if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
        return NextResponse.json({ error: "This idempotency key was already used for a different payment." }, { status: 409 });
      }
      if (isDuplicateKeyError(error)) {
        const existing = await ChamaFinancialTransactionModel.findOne({ groupId, idempotencyKey }).lean();
        if (existing && sameContribution(existing, requested)) {
          return NextResponse.json({ id: String(existing._id), status: existing.status, replayed: true }, { status: 200 });
        }
        return NextResponse.json({ error: "This idempotency key has already been used." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Financial writes require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to record contribution." }, { status: 500 });
  }
}
