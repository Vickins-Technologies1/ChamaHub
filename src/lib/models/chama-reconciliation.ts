import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ReconciliationSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    currency: { type: String, required: true, uppercase: true },
    recordedContributionsMinor: { type: Number, required: true, default: 0 },
    verifiedContributionsMinor: { type: Number, required: true, default: 0 },
    recordedPayoutsMinor: { type: Number, required: true, default: 0 },
    confirmedPayoutsMinor: { type: Number, required: true, default: 0 },
    outstandingObligationsMinor: { type: Number, required: true, default: 0 },
    openingBalanceMinor: { type: Number, default: null },
    reportedClosingBalanceMinor: { type: Number, default: null },
    expectedClosingBalanceMinor: { type: Number, default: null },
    discrepancyMinor: { type: Number, default: null },
    status: { type: String, enum: ["draft", "matched", "discrepancy"], default: "draft" },
    notes: { type: String, trim: true, default: "" },
    statementReference: { type: String, trim: true, default: "" },
    recordedBy: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ReconciliationSchema.index({ groupId:  1, periodStart: -1, periodEnd: -1 });
ReconciliationSchema.index({ groupId: 1, idempotencyKey: 1 }, { unique: true });
ReconciliationSchema.pre("save", function () {
  if (!this.isNew) throw new Error("Reconciliation records are immutable; create a new reconciliation to correct one.");
});
ReconciliationSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"],
  function () {
    throw new Error("Reconciliation records cannot be updated or deleted.");
  }
);

export type ChamaReconciliation = InferSchemaType<typeof ReconciliationSchema>;

const ChamaReconciliationModel =
  (models.ChamaReconciliation as Model<ChamaReconciliation> | undefined) ||
  model<ChamaReconciliation>("ChamaReconciliation", ReconciliationSchema);

export default ChamaReconciliationModel;
