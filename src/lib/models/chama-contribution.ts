import { Schema, model, models, type InferSchemaType } from "mongoose";

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
  },
  { timestamps: true }
);

ContributionSchema.index({ groupId: 1, roundId: 1, memberId: 1 });

export type ChamaContribution = InferSchemaType<typeof ContributionSchema>;

const ChamaContributionModel =
  models.ChamaContribution || model("ChamaContribution", ContributionSchema);

export default ChamaContributionModel;
