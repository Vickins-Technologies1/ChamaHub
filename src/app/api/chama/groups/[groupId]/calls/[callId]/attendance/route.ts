import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import {
  getSessionUser,
  getGroupMember,
  isModerator,
  isSiteAdmin,
} from "@/lib/chama-access";
import ChamaCallAttendanceModel from "@/lib/models/chama-call-attendance";
import type { ChamaCallAttendance } from "@/lib/models/chama-call-attendance";

type Params = { params: Promise<{ groupId: string; callId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId, callId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(callId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const moderator = isModerator(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !moderator && !member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const attendance = (await ChamaCallAttendanceModel.findOne({
      callId: new Types.ObjectId(callId),
      groupId: new Types.ObjectId(groupId),
    }).lean()) as ChamaCallAttendance | null;

    if (!attendance) {
      return NextResponse.json({ error: "Attendance not found." }, { status: 404 });
    }

    return NextResponse.json({
      callId: String(attendance.callId),
      capturedAt: attendance.capturedAt,
      participantCount: attendance.participantCount,
      conferenceRecordName: attendance.conferenceRecordName,
      conferenceRecordStartTime: attendance.conferenceRecordStartTime,
      conferenceRecordEndTime: attendance.conferenceRecordEndTime,
      participants: (attendance.participants || []).map((p) => ({
        participantName: p.participantName,
        displayName: p.displayName,
        user: p.user,
        earliestStartTime: p.earliestStartTime,
        latestEndTime: p.latestEndTime,
        totalSeconds: p.totalSeconds,
        sessions: (p.sessions || []).map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load attendance." }, { status: 500 });
  }
}
