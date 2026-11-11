import { Schema, model, models, type InferSchemaType } from "mongoose";

const MemberSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    userId: { type: String },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ["admin", "treasurer", "secretary", "member"],
      default: "member",
    },
    status: {
      type: String,
      enum: ["active", "pending", "rejected"],
      default: "pending",
    },
    invitedBy: { type: String },
    joinedAt: { type: Date },
  },
  { timestamps: true }
);

MemberSchema.index({ groupId: 1, userId: 1 });
MemberSchema.index({ groupId: 1, email: 1 });

export type ChamaMember = InferSchemaType<typeof MemberSchema>;

const ChamaMemberModel = models.ChamaMember || model("ChamaMember", MemberSchema);

export default ChamaMemberModel;
