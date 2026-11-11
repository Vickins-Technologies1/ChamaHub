import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaCallModel from "@/lib/models/chama-call";
import ChamaCallAttendanceModel from "@/lib/models/chama-call-attendance";
import type { ChamaCall } from "@/lib/models/chama-call";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isModerator,
  isSiteAdmin,
} from "@/lib/chama-access";
import {
  listParticipants,
  listParticipantSessions,
  pickConferenceRecordForSpace,
} from "@/lib/google-meet";

type Params = { params: Promise<{ groupId: string; callId: string }> };

const toDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

export async function POST(request: NextRequest, { params }: Params) {
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
    const canSync = isAdmin || moderator || hasGroupRole(member, ["admin", "secretary"]);
    if (!canSync) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const call = (await ChamaCallModel.findOne({ _id: callId, groupId }).lean()) as
      | (ChamaCall & { _id: unknown })
      | null;
    if (!call) {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }

    const meetingSpaceName = (call.meetingSpaceName as string | undefined) || "";
    if (!meetingSpaceName) {
      return NextResponse.json(
        { error: "Missing meetingSpaceName for this call." },
        { status: 400 }
      );
    }

    const conference = await pickConferenceRecordForSpace({
      spaceName: meetingSpaceName,
      scheduledFor: call.scheduledFor ? new Date(call.scheduledFor) : undefined,
    });

    if (!conference?.name) {
      return NextResponse.json(
        { error: "No conference records found for this Meet space yet." },
        { status: 404 }
      );
    }

    const participants = await listParticipants(conference.name);

    const capturedAt = new Date();
    const capturedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const participantName = participant.name || "";
        const sessions = participantName ? await listParticipantSessions(participantName) : [];

        const normalizedSessions = sessions
          .map((s) => ({
            startTime: toDate(s.startTime),
            endTime: toDate(s.endTime),
          }))
          .filter((s) => s.startTime);

        const totalSeconds = normalizedSessions.reduce((acc, session) => {
          if (!session.startTime || !session.endTime) return acc;
          const diff = Math.max(0, session.endTime.getTime() - session.startTime.getTime());
          return acc + Math.floor(diff / 1000);
        }, 0);

        const signedin = participant.signedinUser || participant.signedInUser;
        const displayName =
          signedin?.displayName ||
          participant.anonymousUser?.displayName ||
          participant.phoneUser?.displayName ||
          "";

        return {
          participantName,
          displayName,
          user: signedin?.user || "",
          email: "",
          phone: "",
          earliestStartTime: toDate(participant.earliestStartTime),
          latestEndTime: toDate(participant.latestEndTime),
          totalSeconds,
          sessions: normalizedSessions
            .filter((s) => s.startTime && s.endTime)
            .map((s) => ({ startTime: s.startTime!, endTime: s.endTime! })),
        };
      })
    );

    const recordStartTime = toDate(conference.startTime);
    const recordEndTime = toDate(conference.endTime);

    await ChamaCallAttendanceModel.updateOne(
      { callId: call._id },
      {
        $set: {
          callId: call._id,
          groupId: new Types.ObjectId(groupId),
          conferenceRecordName: conference.name,
          conferenceRecordStartTime: recordStartTime,
          conferenceRecordEndTime: recordEndTime,
          capturedAt,
          participantCount: capturedParticipants.length,
          participants: capturedParticipants,
        },
      },
      { upsert: true }
    );

    await ChamaCallModel.updateOne(
      { _id: call._id },
      {
        $set: {
          attendanceCapturedAt: capturedAt,
          attendanceParticipantCount: capturedParticipants.length,
          conferenceRecordName: conference.name,
          conferenceRecordStartTime: recordStartTime,
          conferenceRecordEndTime: recordEndTime,
        },
      }
    );

    return NextResponse.json({
      callId: String(call._id),
      conferenceRecordName: conference.name,
      participantCount: capturedParticipants.length,
      capturedAt: capturedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to sync attendance." },
      { status: 500 }
    );
  }
}
