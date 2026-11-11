import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMinutesModel from "@/lib/models/chama-minutes";
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

    const minutes = await ChamaMinutesModel.find({ groupId })
      .sort({ meetingDate: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      minutes: minutes.map((item) => ({
        id: String(item._id),
        title: item.title,
        meetingDate: item.meetingDate,
        summary: item.summary,
        actionItems: item.actionItems,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load meeting minutes." }, { status: 500 });
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
    const { title, meetingDate, summary, actionItems } = body as Record<string, string>;

    if (!title || !meetingDate) {
      return NextResponse.json(
        { error: "Title and meeting date are required." },
        { status: 400 }
      );
    }

    const minutes = await ChamaMinutesModel.create({
      groupId,
      title: title.trim(),
      meetingDate: new Date(meetingDate),
      summary: summary?.trim() ?? "",
      actionItems: actionItems?.trim() ?? "",
      createdBy: user.id,
    });

    return NextResponse.json({ id: String(minutes._id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to create minutes." }, { status: 500 });
  }
}
