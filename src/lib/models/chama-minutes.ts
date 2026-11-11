import { Schema, model, models, type InferSchemaType } from "mongoose";

const ChamaMinutesSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    title: { type: String, trim: true, required: true },
    meetingDate: { type: Date, required: true },
    summary: { type: String, trim: true },
    actionItems: { type: String, trim: true },
    createdBy: { type: String },
  },
  { timestamps: true }
);

ChamaMinutesSchema.index({ groupId: 1, meetingDate: -1 });

export type ChamaMinutes = InferSchemaType<typeof ChamaMinutesSchema>;

const ChamaMinutesModel =
  models.ChamaMinutes || model("ChamaMinutes", ChamaMinutesSchema);

export default ChamaMinutesModel;
