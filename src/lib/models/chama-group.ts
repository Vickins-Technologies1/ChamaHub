import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const GroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    contributionAmount: { type: Number, required: true, min: 1 },
    frequency: {
      type: String,
      enum: ["weekly", "bi-weekly", "monthly"],
      required: true,
    },
    numberOfMembers: { type: Number, default: 0, min: 1 },
    expectedMemberCount: { type: Number, default: 1, min: 1 },
    startDate: { type: Date, required: true },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: "KES" },
    createdBy: { type: String, required: true },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    rotationType: { type: String, enum: ["manual", "random"], default: "manual" },
    rotationOrder: [{ type: Schema.Types.ObjectId, ref: "ChamaMember" }],
    currentRound: { type: Number, default: 1 },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export type ChamaGroup = InferSchemaType<typeof GroupSchema>;

const ChamaGroupModel = (models.ChamaGroup as Model<ChamaGroup> | undefined) || model<ChamaGroup>("ChamaGroup", GroupSchema);

export default ChamaGroupModel;
