import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import { fromMinorUnits } from "@/lib/finance/money";
import { ensureFinanceIndexes } from "@/lib/finance/service";
import {
  getGroupMember,
  getSessionUser,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";
import { normalizePaymentMethod, normalizePaymentNotes, normalizePaymentReference, parsePaymentAmount, parsePaymentDate } from "@/lib/payments/payment-rules";
import { PaymentWorkflowError, submitManualPayment } from "@/lib/payments/payment-service";

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
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });

    await connectMongoose();
    await ensureFinanceIndexes();
    const group = await ChamaGroupModel.findOne({ _id: groupId, status: "active" }).lean();
    if (!group) return NextResponse.json({ error: "Active group not found." }, { status: 404 });
    const requester = await getGroupMember(groupId, user);
    const isAdmin = isSiteAdmin(user);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
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
      _id: new Types.ObjectId(memberId),
      groupId: new Types.ObjectId(groupId),
      status: "active",
    }).lean();
    if (!member) return NextResponse.json({ error: "Active member not found in this group." }, { status: 404 });
    const isSelf = member.userId === user.id;
    if (!isAdmin && !hasGroupRole(requester, ["admin", "treasurer"]) && !isSelf) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const round = await ChamaRoundModel.findOne({
      _id: new Types.ObjectId(roundId),
      groupId: new Types.ObjectId(groupId),
      status: "open",
    }).lean();
    if (!round) return NextResponse.json({ error: "Open round not found in this group." }, { status: 404 });
    if (round.snapshotStatus !== "confirmed" || !round.currencySnapshot || !round.memberObligations?.length) {
      return NextResponse.json({ error: "Treasury review is required before recording payments for this round." }, { status: 409 });
    }
    if (!round.eligibleMemberIds.some((id) => String(id) === memberId)) {
      return NextResponse.json({ error: "This member is not part of the round's locked contribution roster." }, { status: 409 });
    }

    const amountMinor = parsePaymentAmount(body.amount, round.currencySnapshot);
    const paymentDate = parsePaymentDate(typeof body.paidAt === "string" ? body.paidAt : new Date().toISOString());
    const normalizedMethod = normalizePaymentMethod(body.method);
    const { reference, normalized: normalizedReference } = normalizePaymentReference(body.reference, normalizedMethod.method);
    if (["mpesa", "bank"].includes(normalizedMethod.method) && !normalizedReference) {
      return NextResponse.json({ error: "Enter the transaction or bank reference for this payment method." }, { status: 400 });
    }
    const notes = normalizePaymentNotes(body.description);
    const result = await submitManualPayment({
      groupId: new Types.ObjectId(groupId),
      memberId: new Types.ObjectId(memberId),
      roundId: new Types.ObjectId(roundId),
      amountMinor,
      currency: round.currencySnapshot,
      paymentDate,
      method: normalizedMethod.method,
      methodLabel: normalizedMethod.label,
      reference,
      normalizedReference,
      notes,
      idempotencyKey,
      submittedBy: user.id,
    });
    return NextResponse.json({ ...result, message: "Payment submitted and awaiting Treasurer verification." }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof PaymentWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Financial writes require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    if (error instanceof Error && /payment date|amount|reference|payment notes/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "That transaction reference or submission has already been recorded." }, { status: 409 });
    }
    console.error("Unable to submit contribution payment", error);
    return NextResponse.json({ error: "Unable to submit this payment for verification." }, { status: 500 });
  }
}
