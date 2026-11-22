import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaPaymentModel from "@/lib/models/chama-payment";
import ChamaPaymentReceiptModel from "@/lib/models/chama-payment-receipt";
import ChamaRoundModel from "@/lib/models/chama-round";
import { ensureFinanceIndexes } from "@/lib/finance/service";
import { fromMinorUnits } from "@/lib/finance/money";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";
import { normalizePaymentMethod, normalizePaymentNotes, normalizePaymentReference, parsePaymentAmount, parsePaymentDate } from "@/lib/payments/payment-rules";
import { PaymentWorkflowError, submitManualPayment } from "@/lib/payments/payment-service";
import { parsePaymentReceipt } from "@/lib/payments/receipt";

type Params = { params: Promise<{ groupId: string }> };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseFilterDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return date.toISOString().slice(0, 10) === value ? date : undefined;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to view payment records." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    const canReview = isAdmin || hasGroupRole(member, ["admin", "treasurer"]);
    if (!member && !isAdmin) return NextResponse.json({ error: "You do not have access to this group." }, { status: 403 });
    const group = await ChamaGroupModel.findById(groupId).select("name currency").lean();
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Math.min(100000, Number(searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit")) || 20));
    const filter: Record<string, unknown> = { groupId: new Types.ObjectId(groupId) };
    if (!canReview) filter.memberId = member!._id;
    const status = searchParams.get("status") ?? "all";
    if (status !== "all") {
      if (!["pending", "under_review", "confirmed", "rejected"].includes(status)) return NextResponse.json({ error: "Invalid payment status filter." }, { status: 400 });
      filter.status = status;
    }
    const method = searchParams.get("method") ?? "all";
    if (method !== "all") {
      if (!["mpesa", "bank", "cash", "other"].includes(method)) return NextResponse.json({ error: "Invalid payment method filter." }, { status: 400 });
      filter.method = method;
    }
    if (canReview && searchParams.get("memberId")) {
      const memberId = searchParams.get("memberId")!;
      if (!Types.ObjectId.isValid(memberId)) return NextResponse.json({ error: "Invalid member filter." }, { status: 400 });
      filter.memberId = new Types.ObjectId(memberId);
    }
    const dateFrom = parseFilterDate(searchParams.get("dateFrom"));
    const dateTo = parseFilterDate(searchParams.get("dateTo"), true);
    if (dateFrom === undefined || dateTo === undefined) return NextResponse.json({ error: "Enter valid date filters." }, { status: 400 });
    if (dateFrom && dateTo && dateFrom > dateTo) return NextResponse.json({ error: "The start date must be on or before the end date." }, { status: 400 });
    if (dateFrom || dateTo) filter.paymentDate = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };
    const search = (searchParams.get("search") ?? "").trim().slice(0, 100);
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      const searchClauses: Record<string, unknown>[] = [
        { reference: regex }, { methodLabel: regex }, { notes: regex }, { providerTransactionCode: regex },
      ];
      if (canReview) {
        const matchingMembers = await ChamaMemberModel.find({
          groupId: new Types.ObjectId(groupId),
          $or: [{ name: regex }, { email: regex }, { phone: regex }],
        }).distinct("_id");
        if (matchingMembers.length) searchClauses.push({ memberId: { $in: matchingMembers } });
      }
      filter.$or = searchClauses;
    }

    const [payments, total, members] = await Promise.all([
      ChamaPaymentModel.find(filter).sort({ submittedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ChamaPaymentModel.countDocuments(filter),
      ChamaMemberModel.find({ groupId: new Types.ObjectId(groupId) }).select("name email userId").lean(),
    ]);
    const receiptMetadata = await ChamaPaymentReceiptModel.find({ paymentId: { $in: payments.map((payment) => payment._id) } })
      .select("paymentId filename contentType size").lean();
    const memberMap = new Map(members.map((item) => [String(item._id), item]));
    const receiptMap = new Map(receiptMetadata.map((item) => [String(item.paymentId), item]));
    const summaryPromise = canReview
      ? ChamaPaymentModel.aggregate([
          { $match: { groupId: new Types.ObjectId(groupId) } },
          { $group: { _id: "$status", count: { $sum: 1 }, totalMinor: { $sum: "$amountMinor" } } },
        ])
      : Promise.resolve([]);
    const summaryRows = await summaryPromise;
    const summary = { pending: 0, underReview: 0, confirmed: 0, rejected: 0, confirmedAmountMinor: 0 };
    for (const row of summaryRows) {
      if (row._id === "pending") summary.pending = row.count;
      if (row._id === "under_review") summary.underReview = row.count;
      if (row._id === "confirmed") { summary.confirmed = row.count; summary.confirmedAmountMinor = row.totalMinor; }
      if (row._id === "rejected") summary.rejected = row.count;
    }
    return NextResponse.json({
      group: { id: groupId, name: group.name, currency: group.currency ?? "KES" },
      payments: payments.map((payment) => {
        const memberInfo = memberMap.get(String(payment.memberId));
        const receipt = receiptMap.get(String(payment._id));
        return {
          id: String(payment._id),
          memberId: String(payment.memberId),
          memberName: canReview ? memberInfo?.name || memberInfo?.email || "Member" : "You",
          memberEmail: canReview ? memberInfo?.email ?? "" : "",
          roundId: String(payment.roundId),
          amountMinor: payment.amountMinor,
          amount: fromMinorUnits(payment.amountMinor, payment.currency),
          currency: payment.currency,
          paymentDate: payment.paymentDate,
          method: payment.method,
          methodLabel: payment.methodLabel || payment.method,
          reference: payment.reference,
          notes: payment.notes,
          source: payment.source,
          provider: payment.provider,
          providerTransactionCode: payment.providerTransactionCode,
          checkoutRequestId: canReview ? payment.checkoutRequestId : null,
          merchantRequestId: canReview ? payment.merchantRequestId : null,
          providerPhoneNumber: canReview ? payment.providerPhoneNumber : null,
          providerCallbackAt: payment.providerCallbackAt,
          providerStatus: payment.providerStatus,
          status: payment.status,
          potentialDuplicate: Boolean(payment.potentialDuplicate),
          receipt: receipt ? {
            url: `/api/chama/groups/${groupId}/payments/${String(payment._id)}/receipt`,
            filename: receipt.filename,
            contentType: receipt.contentType,
            size: receipt.size,
          } : null,
          submittedBy: canReview ? payment.submittedBy : null,
          submittedAt: payment.submittedAt,
          reviewedBy: payment.reviewedBy,
          reviewedAt: payment.reviewedAt,
          confirmedBy: payment.confirmedBy,
          confirmedAt: payment.confirmedAt,
          rejectionReason: payment.rejectionReason,
          lastRejectionReason: payment.lastRejectionReason,
          ledgerTransactionId: payment.ledgerTransactionId ? String(payment.ledgerTransactionId) : null,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      summary,
      canReview,
    });
  } catch (error) {
    console.error("Unable to load group payments", error);
    return NextResponse.json({ error: "Unable to load payment records." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 6 * 1024 * 1024) return NextResponse.json({ error: "The payment form and receipt must be smaller than 6 MB." }, { status: 413 });
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to submit a payment." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    await ensureFinanceIndexes();
    const [group, member, round] = await Promise.all([
      ChamaGroupModel.findOne({ _id: groupId, status: "active" }).lean(),
      getGroupMember(groupId, user),
      ChamaRoundModel.findOne({ groupId, status: "open" }).lean(),
    ]);
    if (!group) return NextResponse.json({ error: "This group is not accepting payments." }, { status: 404 });
    if (!member || member.status !== "active") return NextResponse.json({ error: "Only an active group member can submit a payment." }, { status: 403 });
    if (!round || round.snapshotStatus !== "confirmed" || !round.currencySnapshot || !round.memberObligations?.length) {
      return NextResponse.json({ error: "The Treasurer must confirm the current round before members can submit payments." }, { status: 409 });
    }
    if (!round.eligibleMemberIds.some((id) => String(id) === String(member._id))) {
      return NextResponse.json({ error: "You are not on the current round's contribution roster." }, { status: 409 });
    }

    const form = await request.formData();
    const amountMinor = parsePaymentAmount(form.get("amount"), round.currencySnapshot);
    const paymentDate = parsePaymentDate(form.get("paymentDate"));
    const { method, label: methodLabel } = normalizePaymentMethod(form.get("method"));
    const { reference, normalized: normalizedReference } = normalizePaymentReference(form.get("reference"), method);
    if (["mpesa", "bank"].includes(method) && !normalizedReference) {
      return NextResponse.json({ error: "Enter the transaction or bank reference for this payment method." }, { status: 400 });
    }
    const notes = normalizePaymentNotes(form.get("notes"));
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "Refresh the form and try submitting again." }, { status: 400 });
    const receipt = await parsePaymentReceipt(form.get("receipt"));
    const result = await submitManualPayment({
      groupId: new Types.ObjectId(groupId),
      memberId: new Types.ObjectId(String(member._id)),
      roundId: new Types.ObjectId(String(round._id)),
      amountMinor,
      currency: round.currencySnapshot,
      paymentDate,
      method,
      methodLabel,
      reference,
      normalizedReference,
      notes,
      idempotencyKey,
      submittedBy: user.id,
      receipt,
    });
    return NextResponse.json({ ...result, message: "Payment submitted and awaiting Treasurer verification." }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof PaymentWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    if (error instanceof Error && /receipt|file|upload|payment date|amount|reference|payment method|payment notes/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "That transaction reference or submission has already been recorded." }, { status: 409 });
    }
    console.error("Unable to submit member payment", error);
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Payment submission is temporarily unavailable. Please try again later." }, { status: 503 });
    }
    return NextResponse.json({ error: "We couldn't submit your payment. Please try again later." }, { status: 500 });
  }
}
