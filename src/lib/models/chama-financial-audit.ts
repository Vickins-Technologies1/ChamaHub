import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const FinancialAuditSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    occurredAt: { type: Date, required: true, default: Date.now },
    idempotencyKey: { type: String, default: null },
    reason: { type: String, trim: true, default: "" },
    previousValues: { type: Schema.Types.Mixed, default: null },
    newValues: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

FinancialAuditSchema.index({ groupId: 1, occurredAt: -1 });
FinancialAuditSchema.index({ entityType: 1, entityId: 1, occurredAt: 1 });
FinancialAuditSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

FinancialAuditSchema.pre("save", function () {
  if (!this.isNew) throw new Error("Financial audit events are immutable.");
});
FinancialAuditSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"],
  function () {
    throw new Error("Financial audit events cannot be updated or deleted.");
  }
);

export type ChamaFinancialAudit = InferSchemaType<typeof FinancialAuditSchema>;

const ChamaFinancialAuditModel =
  (models.ChamaFinancialAudit as Model<ChamaFinancialAudit> | undefined) ||
  model<ChamaFinancialAudit>("ChamaFinancialAudit", FinancialAuditSchema);

export default ChamaFinancialAuditModel;
