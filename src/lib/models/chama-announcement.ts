import { Schema, model, models, type InferSchemaType } from "mongoose";

const ChamaAnnouncementSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    title: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    deliveryChannels: {
      type: [String],
      default: ["in-app"],
    },
    scheduledFor: { type: Date },
    createdBy: { type: String },
  },
  { timestamps: true }
);

ChamaAnnouncementSchema.index({ groupId: 1, createdAt: -1 });

export type ChamaAnnouncement = InferSchemaType<typeof ChamaAnnouncementSchema>;

const ChamaAnnouncementModel =
  models.ChamaAnnouncement || model("ChamaAnnouncement", ChamaAnnouncementSchema);

export default ChamaAnnouncementModel;
