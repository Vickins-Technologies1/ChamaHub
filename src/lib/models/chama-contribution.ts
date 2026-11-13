import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ContributionSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    roundId: { type: Schema.Types.ObjectId, ref: "ChamaRound", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["pending", "paid"], default: "paid" },
    method: { type: String, default: "manual" },
    reference: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
    financialTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "ChamaFinancialTransaction",
      default: null,
    },
  },
  { timestamps: true }
);

ContributionSchema.index({ groupId: 1, roundId: 1, memberId: 1 });
ContributionSchema.index(
  { financialTransactionId: 1 },
  { unique: true, partialFilterExpression: { financialTransactionId: { $type: "objectId" } } }
);

export type ChamaContribution = InferSchemaType<typeof ContributionSchema>;

const ChamaContributionModel =
  (models.ChamaContribution as Model<ChamaContribution> | undefined) ||
  model<ChamaContribution>("ChamaContribution", ContributionSchema);

export default ChamaContributionModel;
