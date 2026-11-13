import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const RoundSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    roundNumber: { type: Number, required: true },
    recipientMemberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", required: true },
    status: { type: String, enum: ["open", "completed"], default: "open" },
    potAmount: { type: Number, required: true },
    potAmountMinor: { type: Number, min: 1, default: null },
    totalContributions: { type: Number, default: 0 },
    dueDate: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    receivedAt: { type: Date },
    payoutTransactionId: { type: Schema.Types.ObjectId, ref: "ChamaFinancialTransaction", default: null },
    currencySnapshot: { type: String, uppercase: true, default: null },
    contributionAmountMinor: { type: Number, min: 1, default: null },
    expectedTotalMinor: { type: Number, min: 1, default: null },
    eligibleMemberIds: [{ type: Schema.Types.ObjectId, ref: "ChamaMember" }],
    memberObligations: [
      {
        memberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", required: true },
        amountMinor: { type: Number, min: 1, required: true },
      },
    ],
    snapshotAt: { type: Date, default: null },
    snapshotStatus: {
      type: String,
      enum: ["confirmed", "legacy_review_required"],
      default: "legacy_review_required",
    },
    snapshotConfirmedBy: { type: String, default: null },
    snapshotConfirmedAt: { type: Date, default: null },
  },
  { timestamps: true, autoIndex: false }
);

RoundSchema.index({ groupId: 1, roundNumber: 1 }, { unique: true });
RoundSchema.index(
  { groupId: 1 },
  { unique: true, partialFilterExpression: { status: "open" } }
);

export type ChamaRound = InferSchemaType<typeof RoundSchema>;

const ChamaRoundModel = (models.ChamaRound as Model<ChamaRound> | undefined) || model<ChamaRound>("ChamaRound", RoundSchema);

export default ChamaRoundModel;
