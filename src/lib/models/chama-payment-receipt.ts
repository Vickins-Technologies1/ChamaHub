import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PaymentReceiptSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: "ChamaPayment", required: true },
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", required: true },
    ownerUserId: { type: String, required: true },
    filename: { type: String, required: true, maxlength: 120 },
    contentType: { type: String, enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"], required: true },
    size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
    sha256: { type: String, required: true, minlength: 64, maxlength: 64 },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true, autoIndex: false, collection: "chama_payment_receipts" }
);

PaymentReceiptSchema.index({ paymentId: 1, createdAt: -1 });
PaymentReceiptSchema.index({ groupId: 1, memberId: 1 });

export type ChamaPaymentReceipt = InferSchemaType<typeof PaymentReceiptSchema>;

const ChamaPaymentReceiptModel =
  (models.ChamaPaymentReceipt as Model<ChamaPaymentReceipt> | undefined) ||
  model<ChamaPaymentReceipt>("ChamaPaymentReceipt", PaymentReceiptSchema);

export default ChamaPaymentReceiptModel;
