import { Schema, model, models, type InferSchemaType } from "mongoose";

const ChamaCallSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    title: { type: String, trim: true, required: true },
    meetingSpaceName: { type: String, trim: true },
    meetingUri: { type: String, trim: true },
    scheduledFor: { type: Date },
    accessType: { type: String, default: "OPEN" },
    autoRecording: { type: Boolean, default: false },
    autoTranscription: { type: Boolean, default: false },
    autoSmartNotes: { type: Boolean, default: false },
    scheduledNotifiedAt: { type: Date },
    startingNotifiedAt: { type: Date },
    attendanceCapturedAt: { type: Date },
    attendanceParticipantCount: { type: Number, min: 0 },
    conferenceRecordName: { type: String, trim: true },
    conferenceRecordStartTime: { type: Date },
    conferenceRecordEndTime: { type: Date },
    createdBy: { type: String },
  },
  { timestamps: true }
);

ChamaCallSchema.index({ groupId: 1, scheduledFor: -1 });

export type ChamaCall = InferSchemaType<typeof ChamaCallSchema>;

const ChamaCallModel = models.ChamaCall || model("ChamaCall", ChamaCallSchema);

export default ChamaCallModel;
