import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const FinancialTransactionSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true, index: true },
    type: {
      type: String,
      enum: ["contribution", "payout", "refund", "adjustment", "reversal"],
      required: true,
    },
    direction: { type: String, enum: ["in", "out"], required: true },
    amountMinor: { type: Number, min: 1, default: null },
    legacyAmountMajor: { type: Number, default: null },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    memberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", default: null },
    roundId: { type: Schema.Types.ObjectId, ref: "ChamaRound", default: null },
    recordedBy: { type: String, required: true },
    reference: { type: String, trim: true, default: "" },
    method: { type: String, trim: true, default: "manual" },
    transactionDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "pending_verification", "verified", "pending_transfer", "transferred", "confirmed",
        "failed", "reversed", "legacy_unverified",
      ],
      required: true,
    },
    idempotencyKey: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: "" },
    evidenceReference: { type: String, trim: true, default: "" },
    verifiedBy: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    verificationNote: { type: String, trim: true, default: "" },
    confirmedBy: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
    reversalOf: { type: Schema.Types.ObjectId, ref: "ChamaFinancialTransaction", default: null },
    correctionReason: { type: String, trim: true, default: "" },
    legacy: { type: Boolean, default: false },
    legacyContributionId: { type: Schema.Types.ObjectId, default: null },
    legacyRoundId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, autoIndex: false }
);

FinancialTransactionSchema.index(
  { groupId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

const immutableFields = new Set([
  "groupId", "type", "direction", "amountMinor", "legacyAmountMajor", "currency", "memberId",
  "roundId", "recordedBy", "idempotencyKey", "legacyContributionId", "legacyRoundId", "createdAt",
]);

FinancialTransactionSchema.pre("save", function () {
  if (!this.isNew && this.modifiedPaths().some((path) => immutableFields.has(path))) {
    throw new Error("Financial transaction facts are immutable; create a correction or reversal entry.");
  }
});
FinancialTransactionSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"],
  function () {
    throw new Error("Financial transactions cannot be updated or deleted through query operations.");
  }
);
FinancialTransactionSchema.index(
  { legacyContributionId: 1 },
  { unique: true, partialFilterExpression: { legacyContributionId: { $type: "objectId" } } }
);
FinancialTransactionSchema.index(
  { legacyRoundId: 1, type: 1 },
  { unique: true, partialFilterExpression: { legacyRoundId: { $type: "objectId" } } }
);
FinancialTransactionSchema.index({ groupId: 1, transactionDate: -1, _id: -1 });
FinancialTransactionSchema.index({ groupId: 1, roundId: 1, type: 1, status: 1 });
FinancialTransactionSchema.index(
  { roundId: 1 },
  { unique: true, partialFilterExpression: { type: "payout", legacy: false } }
);
FinancialTransactionSchema.index(
  { reversalOf: 1 },
  { unique: true, partialFilterExpression: { reversalOf: { $type: "objectId" } } }
);

export type ChamaFinancialTransaction = InferSchemaType<typeof FinancialTransactionSchema>;

const ChamaFinancialTransactionModel =
  (models.ChamaFinancialTransaction as Model<ChamaFinancialTransaction> | undefined) ||
  model<ChamaFinancialTransaction>("ChamaFinancialTransaction", FinancialTransactionSchema);

export default ChamaFinancialTransactionModel;
