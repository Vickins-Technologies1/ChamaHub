import { Schema, model, models, type InferSchemaType } from "mongoose";

const SessionSchema = new Schema(
  {
    startTime: { type: Date },
    endTime: { type: Date },
  },
  { _id: false }
);

const ParticipantSchema = new Schema(
  {
    participantName: { type: String, trim: true },
    displayName: { type: String, trim: true },
    user: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    earliestStartTime: { type: Date },
    latestEndTime: { type: Date },
    totalSeconds: { type: Number, min: 0 },
    sessions: { type: [SessionSchema], default: [] },
  },
  { _id: false }
);

const ChamaCallAttendanceSchema = new Schema(
  {
    callId: { type: Schema.Types.ObjectId, ref: "ChamaCall", required: true, unique: true },
    groupId: { type: Schema.Types.ObjectId, ref: "ChamaGroup", required: true },
    conferenceRecordName: { type: String, trim: true },
    conferenceRecordStartTime: { type: Date },
    conferenceRecordEndTime: { type: Date },
    capturedAt: { type: Date, required: true },
    participantCount: { type: Number, min: 0, default: 0 },
    participants: { type: [ParticipantSchema], default: [] },
  },
  { timestamps: true }
);

ChamaCallAttendanceSchema.index({ groupId: 1, capturedAt: -1 });

export type ChamaCallAttendance = InferSchemaType<typeof ChamaCallAttendanceSchema>;

const ChamaCallAttendanceModel =
  models.ChamaCallAttendance || model("ChamaCallAttendance", ChamaCallAttendanceSchema);

export default ChamaCallAttendanceModel;

