import { randomUUID } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaPaymentModel from "@/lib/models/chama-payment";
import ChamaPaymentReceiptModel from "@/lib/models/chama-payment-receipt";
import { refreshRoundRecordedTotal, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";
import { fromMinorUnits } from "@/lib/finance/money";
import { canEditMemberPayment, canReviewMemberPayment, ledgerPaymentIdempotencyKey, paymentReferenceSearchPattern } from "@/lib/payments/payment-rules";

export type PaymentReceiptInput = {
  id: Types.ObjectId;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  size: number;
  sha256: string;
  data: Buffer;
};

export type ManualPaymentInput = {
  groupId: Types.ObjectId;
  memberId: Types.ObjectId;
  roundId: Types.ObjectId;
  amountMinor: number;
  currency: string;
  paymentDate: Date;
  method: "mpesa" | "bank" | "cash" | "other";
  methodLabel: string;
  reference: string;
  normalizedReference: string | null;
  notes: string;
  idempotencyKey: string;
  submittedBy: string;
  receipt?: PaymentReceiptInput | null;
};

export class PaymentWorkflowError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = "PAYMENT_WORKFLOW_ERROR") {
    super(message);
    this.name = "PaymentWorkflowError";
  }
}

const paymentSnapshot = (payment: Record<string, unknown>) => ({
  groupId: String(payment.groupId),
  memberId: String(payment.memberId),
  roundId: String(payment.roundId),
  amountMinor: payment.amountMinor,
  currency: payment.currency,
  paymentDate: payment.paymentDate,
  method: payment.method,
  methodLabel: payment.methodLabel,
  reference: payment.reference,
  normalizedReference: payment.normalizedReference,
  notes: payment.notes,
  source: payment.source,
  status: payment.status,
  submittedBy: payment.submittedBy,
  submittedAt: payment.submittedAt,
  potentialDuplicate: payment.potentialDuplicate,
  receiptId: payment.receiptId ? String(payment.receiptId) : null,
  ledgerTransactionId: payment.ledgerTransactionId ? String(payment.ledgerTransactionId) : null,
  reviewedBy: payment.reviewedBy,
  reviewStartedAt: payment.reviewStartedAt,
  reviewedAt: payment.reviewedAt,
  confirmedBy: payment.confirmedBy,
  confirmedAt: payment.confirmedAt,
  rejectionReason: payment.rejectionReason,
  lastRejectionReason: payment.lastRejectionReason,
});

const duplicateDateRange = (paymentDate: Date) => ({
  $gte: new Date(paymentDate.getTime() - 24 * 60 * 60 * 1000),
  $lte: new Date(paymentDate.getTime() + 24 * 60 * 60 * 1000),
});

async function hasExistingLedgerReference(groupId: Types.ObjectId, normalizedReference: string, session: ClientSession, excludePaymentId?: Types.ObjectId) {
  return ChamaFinancialTransactionModel.exists({
    groupId,
    type: "contribution",
    status: { $nin: ["failed", "reversed"] },
    reference: paymentReferenceSearchPattern(normalizedReference),
    ...(excludePaymentId ? { sourcePaymentId: { $ne: excludePaymentId } } : {}),
  }).session(session);
}

async function hasPossibleDuplicate(input: Pick<ManualPaymentInput, "groupId" | "memberId" | "amountMinor" | "paymentDate" | "method" | "methodLabel">, session: ClientSession, excludeId?: Types.ObjectId) {
  const paymentFilter: Record<string, unknown> = {
    groupId: input.groupId,
    memberId: input.memberId,
    amountMinor: input.amountMinor,
    paymentDate: duplicateDateRange(input.paymentDate),
    method: { $in: [...new Set([input.method, input.methodLabel])] },
    status: { $ne: "rejected" },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };
  const existingSubmission = await ChamaPaymentModel.exists(paymentFilter).session(session);
  if (existingSubmission) return true;
  const existingLedgerEntry = await ChamaFinancialTransactionModel.exists({
    groupId: input.groupId,
    memberId: input.memberId,
    amountMinor: input.amountMinor,
    transactionDate: duplicateDateRange(input.paymentDate),
    method: input.method,
    type: "contribution",
    status: { $in: ["verified", "confirmed", "pending_verification"] },
  }).session(session);
  return Boolean(existingLedgerEntry);
}

async function createReceipt(input: {
  receipt: PaymentReceiptInput;
  paymentId: Types.ObjectId;
  groupId: Types.ObjectId;
  memberId: Types.ObjectId;
  ownerUserId: string;
}, session: ClientSession) {
  const { receipt } = input;
  await ChamaPaymentReceiptModel.create([{
    _id: receipt.id,
    paymentId: input.paymentId,
    groupId: input.groupId,
    memberId: input.memberId,
    ownerUserId: input.ownerUserId,
    filename: receipt.filename,
    contentType: receipt.contentType,
    size: receipt.size,
    sha256: receipt.sha256,
    data: receipt.data,
  }], { session });
}

async function notifyUsers(input: { recipients: string[]; notificationId: string; title: string; message: string }) {
  const recipients = [...new Set(input.recipients.filter(Boolean))];
  if (!recipients.length) return;
  try {
    const database = await connectToDatabase();
    const now = new Date();
    await database.collection("user_notifications").bulkWrite(recipients.map((userId) => ({
      updateOne: {
        filter: { notificationId: input.notificationId, userId },
        update: { $setOnInsert: {
          notificationId: input.notificationId,
          userId,
          title: input.title,
          message: input.message,
          type: "account",
          createdAt: now,
          readAt: null,
          inAppStatus: "delivered",
          emailStatus: "not_requested",
        } },
        upsert: true,
      },
    })), { ordered: false });
  } catch (error) {
    console.error("Unable to create payment workflow notifications", error);
  }
}

const treasurerUserIds = async (groupId: Types.ObjectId) =>
  ChamaMemberModel.find({ groupId, status: "active", role: { $in: ["admin", "treasurer"] }, userId: { $type: "string" } })
    .distinct("userId") as Promise<string[]>;

export async function submitManualPayment(input: ManualPaymentInput) {
  const now = new Date();
  const paymentId = new Types.ObjectId();
  const result = await runInFinancialTransaction(async (session) => {
    const prior = await ChamaPaymentModel.findOne({
      groupId: input.groupId,
      memberId: input.memberId,
      idempotencyKey: input.idempotencyKey,
    }).session(session).lean();
    if (prior) {
      const same = prior.amountMinor === input.amountMinor && String(prior.roundId) === String(input.roundId)
        && String(prior.paymentDate) === String(input.paymentDate) && prior.normalizedReference === input.normalizedReference
        && prior.method === input.method && prior.currency === input.currency && (prior.notes ?? "") === input.notes;
      if (!same) throw new PaymentWorkflowError("This submission key was already used for a different payment.", 409, "IDEMPOTENCY_KEY_REUSED");
      return { id: String(prior._id), status: prior.status, replayed: true, potentialDuplicate: Boolean(prior.potentialDuplicate) };
    }
    if (input.normalizedReference && await ChamaPaymentModel.exists({
      groupId: input.groupId,
      normalizedReference: input.normalizedReference,
    }).session(session)) {
      throw new PaymentWorkflowError("A payment with this transaction reference has already been submitted for this group.", 409, "DUPLICATE_REFERENCE");
    }
    if (input.normalizedReference && await hasExistingLedgerReference(input.groupId, input.normalizedReference, session)) {
      throw new PaymentWorkflowError("A payment with this transaction reference is already recorded in the group ledger.", 409, "DUPLICATE_REFERENCE");
    }

    const potentialDuplicate = await hasPossibleDuplicate(input, session);
    const { receipt, ...paymentInput } = input;
    const payment = new ChamaPaymentModel({
      _id: paymentId,
      ...paymentInput,
      source: "manual",
      status: "pending",
      potentialDuplicate,
      receiptId: receipt?.id ?? null,
      submittedAt: now,
    });
    await payment.save({ session });
    if (receipt) await createReceipt({
      receipt,
      paymentId,
      groupId: input.groupId,
      memberId: input.memberId,
      ownerUserId: input.submittedBy,
    }, session);
    await writeFinanceAudit({
      groupId: input.groupId,
      actorId: input.submittedBy,
      action: "payment.submitted",
      entityType: "payment_submission",
      entityId: String(paymentId),
      idempotencyKey: `payment:${paymentId}:submitted`,
      newValues: paymentSnapshot(payment.toObject() as Record<string, unknown>),
    }, session);
    return { id: String(paymentId), status: "pending", replayed: false, potentialDuplicate };
  });

  if (!result.replayed) {
    const recipients = await treasurerUserIds(input.groupId);
    await notifyUsers({
      recipients,
      notificationId: `payment-${result.id}-submitted`,
      title: "Payment awaiting review",
      message: `A member submitted a ${input.currency} ${fromMinorUnits(input.amountMinor, input.currency).toLocaleString()} payment for Treasurer verification.`,
    });
  }
  return result;
}

export async function updateMemberPayment(input: ManualPaymentInput & { paymentId: Types.ObjectId }) {
  const now = new Date();
  const result = await runInFinancialTransaction(async (session) => {
    const payment = await ChamaPaymentModel.findOne({
      _id: input.paymentId,
      groupId: input.groupId,
      memberId: input.memberId,
    }).session(session);
    if (!payment) throw new PaymentWorkflowError("Payment submission not found.", 404, "PAYMENT_NOT_FOUND");
    if (payment.idempotencyKey === input.idempotencyKey) {
      const same = payment.amountMinor === input.amountMinor && String(payment.roundId) === String(input.roundId)
        && String(payment.paymentDate) === String(input.paymentDate) && payment.normalizedReference === input.normalizedReference
        && payment.method === input.method && payment.currency === input.currency && (payment.notes ?? "") === input.notes;
      if (!same) throw new PaymentWorkflowError("This submission key was already used for different payment details.", 409, "IDEMPOTENCY_KEY_REUSED");
      return { id: String(payment._id), status: payment.status, potentialDuplicate: Boolean(payment.potentialDuplicate), replayed: true };
    }
    if (!canEditMemberPayment(payment.status)) throw new PaymentWorkflowError("This payment can no longer be edited.", 409, "PAYMENT_NOT_EDITABLE");
    if (input.normalizedReference && await ChamaPaymentModel.exists({
      groupId: input.groupId,
      normalizedReference: input.normalizedReference,
      _id: { $ne: payment._id },
    }).session(session)) {
      throw new PaymentWorkflowError("A payment with this transaction reference has already been submitted for this group.", 409, "DUPLICATE_REFERENCE");
    }
    if (input.normalizedReference && await hasExistingLedgerReference(input.groupId, input.normalizedReference, session, payment._id)) {
      throw new PaymentWorkflowError("A payment with this transaction reference is already recorded in the group ledger.", 409, "DUPLICATE_REFERENCE");
    }

    const previousValues = paymentSnapshot(payment.toObject() as Record<string, unknown>);
    const potentialDuplicate = await hasPossibleDuplicate(input, session, payment._id);
    if (input.receipt) await createReceipt({
      receipt: input.receipt,
      paymentId: payment._id,
      groupId: input.groupId,
      memberId: input.memberId,
      ownerUserId: input.submittedBy,
    }, session);
    payment.roundId = input.roundId;
    payment.amountMinor = input.amountMinor;
    payment.currency = input.currency;
    payment.paymentDate = input.paymentDate;
    payment.method = input.method;
    payment.methodLabel = input.methodLabel;
    payment.reference = input.reference;
    payment.normalizedReference = input.normalizedReference;
    payment.notes = input.notes;
    payment.idempotencyKey = input.idempotencyKey;
    if (input.receipt) payment.receiptId = input.receipt.id;
    if (payment.rejectionReason) payment.lastRejectionReason = payment.rejectionReason;
    payment.rejectionReason = "";
    payment.status = "pending";
    payment.submittedAt = now;
    payment.potentialDuplicate = potentialDuplicate;
    payment.reviewedBy = null;
    payment.reviewStartedAt = null;
    payment.reviewedAt = null;
    await payment.save({ session });
    await writeFinanceAudit({
      groupId: input.groupId,
      actorId: input.submittedBy,
      action: "payment.corrected_and_resubmitted",
      entityType: "payment_submission",
      entityId: String(payment._id),
      previousValues,
      newValues: paymentSnapshot(payment.toObject() as Record<string, unknown>),
    }, session);
    return { id: String(payment._id), status: payment.status, potentialDuplicate, replayed: false };
  });

  const recipients = await treasurerUserIds(input.groupId);
  await notifyUsers({
    recipients,
    notificationId: `payment-${result.id}-resubmitted-${randomUUID()}`,
    title: "Corrected payment awaiting review",
    message: "A member corrected and resubmitted a payment for Treasurer verification.",
  });
  return result;
}

export async function startPaymentReview(input: { groupId: Types.ObjectId; paymentId: Types.ObjectId; reviewerId: string }) {
  return runInFinancialTransaction(async (session) => {
    const payment = await ChamaPaymentModel.findOne({ _id: input.paymentId, groupId: input.groupId }).session(session);
    if (!payment) throw new PaymentWorkflowError("Payment submission not found.", 404, "PAYMENT_NOT_FOUND");
    if (payment.status === "under_review") return { id: String(payment._id), status: payment.status, alreadyApplied: true };
    if (!canReviewMemberPayment(payment.status)) throw new PaymentWorkflowError("This payment is no longer awaiting review.", 409, "PAYMENT_NOT_REVIEWABLE");
    const previousValues = paymentSnapshot(payment.toObject() as Record<string, unknown>);
    payment.status = "under_review";
    payment.reviewedBy = input.reviewerId;
    payment.reviewStartedAt = new Date();
    await payment.save({ session });
    await writeFinanceAudit({
      groupId: input.groupId,
      actorId: input.reviewerId,
      action: "payment.review_started",
      entityType: "payment_submission",
      entityId: String(payment._id),
      previousValues,
      newValues: paymentSnapshot(payment.toObject() as Record<string, unknown>),
    }, session);
    return { id: String(payment._id), status: payment.status, alreadyApplied: false };
  });
}

export async function confirmAndPostPayment(input: { groupId: Types.ObjectId; paymentId: Types.ObjectId; reviewerId: string; reason?: string }) {
  let result: { id: string; status: string; ledgerTransactionId: string; alreadyApplied: boolean; memberUserId: string | null };
  try {
    result = await runInFinancialTransaction(async (session) => {
      const payment = await ChamaPaymentModel.findOne({ _id: input.paymentId, groupId: input.groupId }).session(session);
      if (!payment) throw new PaymentWorkflowError("Payment submission not found.", 404, "PAYMENT_NOT_FOUND");
      if (payment.status === "confirmed" && payment.ledgerTransactionId) {
        const member = await ChamaMemberModel.findById(payment.memberId).select("userId").session(session).lean();
        return { id: String(payment._id), status: payment.status, ledgerTransactionId: String(payment.ledgerTransactionId), alreadyApplied: true, memberUserId: member?.userId ?? null };
      }
      if (!canReviewMemberPayment(payment.status)) throw new PaymentWorkflowError("This payment is no longer awaiting review.", 409, "PAYMENT_NOT_REVIEWABLE");

      const previousValues = paymentSnapshot(payment.toObject() as Record<string, unknown>);
      let transaction = await ChamaFinancialTransactionModel.findOne({ sourcePaymentId: payment._id }).session(session);
      if (payment.normalizedReference && await hasExistingLedgerReference(input.groupId, payment.normalizedReference, session, payment._id)) {
        throw new PaymentWorkflowError("Another ledger entry already uses this payment reference.", 409, "DUPLICATE_REFERENCE");
      }
      if (!transaction) {
        const [created] = await ChamaFinancialTransactionModel.create([{
          groupId: payment.groupId,
          type: "contribution",
          direction: "in",
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          memberId: payment.memberId,
          roundId: payment.roundId,
          sourcePaymentId: payment._id,
          paymentSource: payment.source,
          recordedBy: payment.submittedBy,
          reference: payment.reference,
          normalizedPaymentReference: payment.normalizedReference ?? (payment.providerTransactionCode ? payment.providerTransactionCode.trim().toUpperCase() : null),
          method: payment.methodLabel || payment.method,
          transactionDate: payment.paymentDate,
          status: "verified",
          idempotencyKey: ledgerPaymentIdempotencyKey(String(payment._id)),
          description: payment.notes,
          evidenceReference: payment.receiptId ? String(payment.receiptId) : "",
          verifiedBy: input.reviewerId,
          verifiedAt: new Date(),
          verificationNote: input.reason ?? "Payment verified by the Treasurer.",
          confirmedBy: input.reviewerId,
          confirmedAt: new Date(),
        }], { session });
        transaction = created;
      }
      if (transaction.status !== "verified" && transaction.status !== "confirmed") {
        throw new PaymentWorkflowError("The linked ledger record is not in a confirmable state.", 409, "LEDGER_RECORD_CONFLICT");
      }

      const existingContribution = await ChamaContributionModel.findOne({ financialTransactionId: transaction._id }).session(session);
      if (!existingContribution) {
        await ChamaContributionModel.create([{
          groupId: payment.groupId,
          roundId: payment.roundId,
          memberId: payment.memberId,
          amount: fromMinorUnits(payment.amountMinor, payment.currency),
          status: "paid",
          method: payment.methodLabel || payment.method,
          reference: payment.reference,
          paidAt: payment.paymentDate,
          financialTransactionId: transaction._id,
        }], { session });
      }

      payment.status = "confirmed";
      payment.reviewedBy = input.reviewerId;
      payment.reviewedAt = new Date();
      payment.confirmedBy = input.reviewerId;
      payment.confirmedAt = payment.confirmedAt ?? new Date();
      payment.ledgerTransactionId = transaction._id;
      payment.rejectionReason = "";
      await payment.save({ session });
      await writeFinanceAudit({
        groupId: input.groupId,
        actorId: input.reviewerId,
        action: "payment.confirmed_and_posted",
        entityType: "payment_submission",
        entityId: String(payment._id),
        reason: input.reason,
        previousValues,
        newValues: { ...paymentSnapshot(payment.toObject() as Record<string, unknown>), ledgerTransactionId: String(transaction._id) },
      }, session);
      await refreshRoundRecordedTotal(payment.roundId, session);
      const member = await ChamaMemberModel.findById(payment.memberId).select("userId").session(session).lean();
      return { id: String(payment._id), status: payment.status, ledgerTransactionId: String(transaction._id), alreadyApplied: false, memberUserId: member?.userId ?? null };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      const current = await ChamaPaymentModel.findOne({ _id: input.paymentId, groupId: input.groupId, status: "confirmed" }).lean();
      if (current?.ledgerTransactionId) {
        return { id: String(current._id), status: "confirmed", ledgerTransactionId: String(current.ledgerTransactionId), alreadyApplied: true, memberUserId: null };
      }
    }
    throw error;
  }
  if (!result.alreadyApplied && result.memberUserId) {
    await notifyUsers({
      recipients: [result.memberUserId],
      notificationId: `payment-${result.id}-confirmed`,
      title: "Payment confirmed",
      message: "Your payment was verified by the Treasurer and added to the group ledger.",
    });
  }
  return { id: result.id, status: result.status, ledgerTransactionId: result.ledgerTransactionId, alreadyApplied: result.alreadyApplied };
}

export async function rejectMemberPayment(input: { groupId: Types.ObjectId; paymentId: Types.ObjectId; reviewerId: string; reason: string }) {
  const result = await runInFinancialTransaction(async (session) => {
    const payment = await ChamaPaymentModel.findOne({ _id: input.paymentId, groupId: input.groupId }).session(session);
    if (!payment) throw new PaymentWorkflowError("Payment submission not found.", 404, "PAYMENT_NOT_FOUND");
    if (payment.status === "rejected" && payment.rejectionReason === input.reason) return { id: String(payment._id), status: payment.status, alreadyApplied: true, memberUserId: payment.submittedBy };
    if (!canReviewMemberPayment(payment.status)) throw new PaymentWorkflowError("This payment is no longer awaiting review.", 409, "PAYMENT_NOT_REVIEWABLE");
    const previousValues = paymentSnapshot(payment.toObject() as Record<string, unknown>);
    payment.status = "rejected";
    payment.reviewedBy = input.reviewerId;
    payment.reviewedAt = new Date();
    payment.rejectionReason = input.reason;
    payment.lastRejectionReason = input.reason;
    await payment.save({ session });
    await writeFinanceAudit({
      groupId: input.groupId,
      actorId: input.reviewerId,
      action: "payment.rejected",
      entityType: "payment_submission",
      entityId: String(payment._id),
      reason: input.reason,
      previousValues,
      newValues: paymentSnapshot(payment.toObject() as Record<string, unknown>),
    }, session);
    const member = await ChamaMemberModel.findById(payment.memberId).select("userId").session(session).lean();
    return { id: String(payment._id), status: payment.status, alreadyApplied: false, memberUserId: member?.userId ?? null };
  });
  if (!result.alreadyApplied && result.memberUserId) {
    await notifyUsers({
      recipients: [result.memberUserId],
      notificationId: `payment-${result.id}-rejected-${randomUUID()}`,
      title: "Payment needs attention",
      message: `Your payment could not be verified: ${input.reason}`,
    });
  }
  return { id: result.id, status: result.status, alreadyApplied: result.alreadyApplied };
}
