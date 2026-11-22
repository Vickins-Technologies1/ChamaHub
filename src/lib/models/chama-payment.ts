import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PaymentSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", required: true },
    roundId: { type: Schema.Types.ObjectId, ref: "ChamaRound", required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    paymentDate: { type: Date, required: true },
    method: { type: String, enum: ["mpesa", "bank", "cash", "other"], required: true },
    methodLabel: { type: String, trim: true, maxlength: 50, default: "" },
    reference: { type: String, trim: true, maxlength: 120, default: "" },
    normalizedReference: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    source: { type: String, enum: ["manual", "mpesa_daraja"], required: true, default: "manual" },
    provider: { type: String, trim: true, default: null },
    providerTransactionCode: { type: String, trim: true, default: null },
    checkoutRequestId: { type: String, trim: true, default: null },
    merchantRequestId: { type: String, trim: true, default: null },
    providerPhoneNumber: { type: String, trim: true, default: null },
    providerCallbackAt: { type: Date, default: null },
    providerStatus: { type: String, trim: true, default: null },
    providerMetadataHash: { type: String, trim: true, default: null },
    submittedBy: { type: String, required: true },
    submittedAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["pending", "under_review", "confirmed", "rejected"], required: true, default: "pending" },
    idempotencyKey: { type: String, required: true, trim: true },
    potentialDuplicate: { type: Boolean, default: false },
    receiptId: { type: Schema.Types.ObjectId, ref: "ChamaPaymentReceipt", default: null },
    reviewedBy: { type: String, default: null },
    reviewStartedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: "" },
    lastRejectionReason: { type: String, trim: true, maxlength: 500, default: "" },
    confirmedBy: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
    ledgerTransactionId: { type: Schema.Types.ObjectId, ref: "ChamaFinancialTransaction", default: null },
  },
  { timestamps: true, autoIndex: false, collection: "chama_payments" }
);

PaymentSchema.index({ groupId: 1, status: 1, submittedAt: -1, _id: -1 });
PaymentSchema.index({ groupId: 1, memberId: 1, submittedAt: -1, _id: -1 });
PaymentSchema.index(
  { groupId: 1, normalizedReference: 1 },
  { unique: true, partialFilterExpression: { normalizedReference: { $type: "string" } } }
);
PaymentSchema.index(
  { groupId: 1, memberId: 1, idempotencyKey: 1 },
  { unique: true }
);
PaymentSchema.index(
  { ledgerTransactionId: 1 },
  { unique: true, partialFilterExpression: { ledgerTransactionId: { $type: "objectId" } } }
);
PaymentSchema.index(
  { provider: 1, providerTransactionCode: 1 },
  { unique: true, partialFilterExpression: { providerTransactionCode: { $type: "string" } } }
);

export type ChamaPayment = InferSchemaType<typeof PaymentSchema>;

const ChamaPaymentModel =
  (models.ChamaPayment as Model<ChamaPayment> | undefined) || model<ChamaPayment>("ChamaPayment", PaymentSchema);

export default ChamaPaymentModel;
