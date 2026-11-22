import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaPaymentModel from "@/lib/models/chama-payment";
import ChamaRoundModel from "@/lib/models/chama-round";
import { ensureFinanceIndexes } from "@/lib/finance/service";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";
import { normalizePaymentMethod, normalizePaymentNotes, normalizePaymentReference, parsePaymentAmount, parsePaymentDate } from "@/lib/payments/payment-rules";
import { confirmAndPostPayment, PaymentWorkflowError, rejectMemberPayment, startPaymentReview, updateMemberPayment } from "@/lib/payments/payment-service";
import { parsePaymentReceipt } from "@/lib/payments/receipt";

type Params = { params: Promise<{ groupId: string; paymentId: string }> };

const rejectionReasons = [
  "Invalid transaction reference",
  "Incorrect amount",
  "Duplicate payment",
  "Receipt does not match",
  "Payment could not be verified",
  "Wrong group",
];

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, paymentId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to update this payment." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(paymentId)) return NextResponse.json({ error: "Invalid payment id." }, { status: 400 });
    await connectMongoose();
    await ensureFinanceIndexes();
    const groupMember = await getGroupMember(groupId, user);
    const isAdmin = isSiteAdmin(user);
    const canReview = isAdmin || hasGroupRole(groupMember, ["admin", "treasurer"]);
    if (!groupMember && !isAdmin) return NextResponse.json({ error: "You do not have access to this group." }, { status: 403 });

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (Number.isFinite(contentLength) && contentLength > 6 * 1024 * 1024) return NextResponse.json({ error: "The payment form and receipt must be smaller than 6 MB." }, { status: 413 });
      if (!groupMember) return NextResponse.json({ error: "An active group membership is required." }, { status: 403 });
      const form = await request.formData();
      const action = String(form.get("action") ?? "");
      if (action !== "edit") return NextResponse.json({ error: "Unsupported payment edit action." }, { status: 400 });
      const payment = await ChamaPaymentModel.findOne({ _id: paymentId, groupId }).lean();
      if (!payment || String(payment.memberId) !== String(groupMember._id)) return NextResponse.json({ error: "Payment submission not found." }, { status: 404 });
      const round = await ChamaRoundModel.findOne({ _id: payment.roundId, groupId }).lean();
      if (!round?.currencySnapshot) return NextResponse.json({ error: "The payment currency could not be verified. Contact your Treasurer." }, { status: 409 });
      const amountMinor = parsePaymentAmount(form.get("amount"), round.currencySnapshot);
      const paymentDate = parsePaymentDate(form.get("paymentDate"));
      const { method, label: methodLabel } = normalizePaymentMethod(form.get("method"));
      const { reference, normalized: normalizedReference } = normalizePaymentReference(form.get("reference"), method);
      if (["mpesa", "bank"].includes(method) && !normalizedReference) return NextResponse.json({ error: "Enter the transaction or bank reference for this payment method." }, { status: 400 });
      const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "Refresh the form and try saving again." }, { status: 400 });
      const result = await updateMemberPayment({
        paymentId: new Types.ObjectId(paymentId),
        groupId: new Types.ObjectId(groupId),
        memberId: new Types.ObjectId(String(groupMember._id)),
        roundId: new Types.ObjectId(String(payment.roundId)),
        amountMinor,
        currency: round.currencySnapshot,
        paymentDate,
        method,
        methodLabel,
        reference,
        normalizedReference,
        notes: normalizePaymentNotes(form.get("notes")),
        idempotencyKey,
        submittedBy: user.id,
        receipt: await parsePaymentReceipt(form.get("receipt")),
      });
      return NextResponse.json({ ...result, message: "Your correction was saved and is awaiting Treasurer verification." });
    }

    if (!canReview) return NextResponse.json({ error: "Only the Treasurer or group administrator can review payments." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const base = { groupId: new Types.ObjectId(groupId), paymentId: new Types.ObjectId(paymentId), reviewerId: user.id };
    if (action === "start_review") return NextResponse.json(await startPaymentReview(base));
    if (action === "confirm") {
      const result = await confirmAndPostPayment({ ...base, reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : undefined });
      return NextResponse.json({ ...result, message: result.alreadyApplied ? "This payment was already confirmed." : "Payment confirmed and added to the group ledger." });
    }
    if (action === "reject") {
      const selectedReason = typeof body.reason === "string" ? body.reason.trim() : "";
      const otherDetails = typeof body.otherDetails === "string" ? body.otherDetails.trim().slice(0, 350) : "";
      const reason = selectedReason === "Other" ? otherDetails : selectedReason;
      if ((!rejectionReasons.includes(reason) && selectedReason !== "Other") || reason.length < 5) {
        return NextResponse.json({ error: "Choose a rejection reason and provide details when selecting Other." }, { status: 400 });
      }
      return NextResponse.json(await rejectMemberPayment({ ...base, reason }));
    }
    return NextResponse.json({ error: "Choose review, confirm, or reject for this payment." }, { status: 400 });
  } catch (error) {
    if (error instanceof PaymentWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    if (error instanceof Error && /payment date|amount|reference|payment notes|receipt|file/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return NextResponse.json({ error: "That transaction reference has already been submitted." }, { status: 409 });
    console.error("Unable to update member payment", error);
    return NextResponse.json({ error: "Unable to update this payment. Please try again." }, { status: 500 });
  }
}
