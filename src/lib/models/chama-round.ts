import { Schema, model, models, type InferSchemaType } from "mongoose";

const RoundSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    roundNumber: { type: Number, required: true },
    recipientMemberId: { type: Schema.Types.ObjectId, ref: "ChamaMember", required: true },
    status: { type: String, enum: ["open", "completed"], default: "open" },
    potAmount: { type: Number, required: true },
    totalContributions: { type: Number, default: 0 },
    dueDate: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    receivedAt: { type: Date },
  },
  { timestamps: true }
);

RoundSchema.index({ groupId: 1, roundNumber: -1 });

export type ChamaRound = InferSchemaType<typeof RoundSchema>;

const ChamaRoundModel = models.ChamaRound || model("ChamaRound", RoundSchema);

export default ChamaRoundModel;
