import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaCallModel from "@/lib/models/chama-call";
import { createMeetSpace } from "@/lib/google-meet";
import { notifyGroupCallMembers } from "@/lib/chama-call-notifications";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isModerator,
  isSiteAdmin,
} from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const moderator = isModerator(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !moderator && !member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const calls = await ChamaCallModel.find({ groupId })
      .sort({ scheduledFor: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      calls: calls.map((call) => ({
        id: String(call._id),
        title: call.title,
        meetingUri: call.meetingUri,
        scheduledFor: call.scheduledFor,
        accessType: call.accessType,
        autoRecording: call.autoRecording,
        autoTranscription: call.autoTranscription,
        autoSmartNotes: call.autoSmartNotes,
        attendanceCapturedAt: call.attendanceCapturedAt,
        attendanceParticipantCount: call.attendanceParticipantCount,
        createdAt: call.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load calls." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const moderator = isModerator(user);
    const member = await getGroupMember(groupId, user);
    const canCreate = isAdmin || moderator || hasGroupRole(member, ["admin", "secretary"]);
    if (!canCreate) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      title,
      scheduledFor,
      accessType,
      autoRecording,
      autoTranscription,
      autoSmartNotes,
    } = body as Record<string, unknown>;

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: "Call title is required." }, { status: 400 });
    }

    let scheduleDate: Date | undefined;
    if (scheduledFor) {
      const parsed = new Date(String(scheduledFor));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid scheduled time." }, { status: 400 });
      }
      scheduleDate = parsed;
    }

    const meetSpace = await createMeetSpace({
      accessType:
        accessType === "TRUSTED" || accessType === "RESTRICTED" ? accessType : "OPEN",
      autoRecording: Boolean(autoRecording),
      autoTranscription: Boolean(autoTranscription),
      autoSmartNotes: Boolean(autoSmartNotes),
    });

    const meetingUri = meetSpace.meetingUri;
    const meetingSpaceName = meetSpace.name;

    const call = await ChamaCallModel.create({
      groupId,
      title: String(title).trim(),
      meetingSpaceName,
      meetingUri,
      scheduledFor: scheduleDate,
      accessType:
        accessType === "TRUSTED" || accessType === "RESTRICTED" ? accessType : "OPEN",
      autoRecording: Boolean(autoRecording),
      autoTranscription: Boolean(autoTranscription),
      autoSmartNotes: Boolean(autoSmartNotes),
      createdBy: user.id,
    });

    const now = new Date();
    const isScheduled =
      scheduleDate && scheduleDate.getTime() - now.getTime() > 60 * 1000;

    try {
      const kind = isScheduled ? "scheduled" : "starting";
      const result = await notifyGroupCallMembers({
        groupId,
        title: String(title).trim(),
        scheduledFor: scheduleDate,
        meetingUri: meetingUri || null,
        kind,
      });

      if (result.emailed + result.sms > 0) {
        await ChamaCallModel.updateOne(
          { _id: call._id },
          {
            $set: isScheduled
              ? { scheduledNotifiedAt: now }
              : { startingNotifiedAt: now },
          }
        );
      }
    } catch {
      // Don't fail call creation if notifications fail.
    }

    return NextResponse.json(
      {
        id: String(call._id),
        meetingUri,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Unable to create call." }, { status: 500 });
  }
}
