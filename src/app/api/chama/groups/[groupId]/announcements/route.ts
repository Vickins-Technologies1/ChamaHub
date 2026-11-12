import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaAnnouncementModel from "@/lib/models/chama-announcement";
import { deliverAnnouncement } from "@/lib/chama-announcement-notifications";
import transporter from "@/lib/nodemailer";
import { canSendSms } from "@/lib/sms";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
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
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const announcements = await ChamaAnnouncementModel.find({ groupId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      announcements: announcements.map((item) => ({
        id: String(item._id),
        title: item.title,
        message: item.message,
        deliveryChannels: item.deliveryChannels ?? ["in-app"],
        scheduledFor: item.scheduledFor,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load announcements." }, { status: 500 });
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
    const member = await getGroupMember(groupId, user);
    const canCreate = isAdmin || hasGroupRole(member, ["admin", "secretary"]);
    if (!canCreate) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { title, message, deliveryChannels, scheduledFor } = body as Record<string, unknown>;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Title and message are required." },
        { status: 400 }
      );
    }

    const allowedChannels = ["in-app", "email", "sms"];
    const normalizedChannels = Array.isArray(deliveryChannels)
      ? deliveryChannels
          .map((item) => String(item).toLowerCase().trim())
          .filter((item) => allowedChannels.includes(item))
      : [];
    const uniqueChannels = Array.from(new Set(["in-app", ...normalizedChannels]));

    if (uniqueChannels.includes("email") && !transporter) {
      return NextResponse.json({ error: "Email delivery is unavailable until email settings are configured." }, { status: 400 });
    }
    if (uniqueChannels.includes("sms") && !canSendSms()) {
      return NextResponse.json({ error: "SMS delivery is unavailable until Twilio settings are configured." }, { status: 400 });
    }

    let scheduleDate: Date | undefined;
    if (scheduledFor) {
      const parsed = new Date(String(scheduledFor));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid scheduled time." }, { status: 400 });
      }
      scheduleDate = parsed;
    }

    const announcement = await ChamaAnnouncementModel.create({
      groupId,
      title: String(title).trim(),
      message: String(message).trim(),
      deliveryChannels: uniqueChannels,
      scheduledFor: scheduleDate,
      createdBy: user.id,
    });

    if (!scheduleDate || scheduleDate.getTime() <= Date.now()) {
      const delivery = await deliverAnnouncement({
        groupId,
        title: announcement.title,
        message: announcement.message,
        deliveryChannels: uniqueChannels as Array<"in-app" | "email" | "sms">,
      });
      announcement.deliveredAt = new Date();
      announcement.deliverySummary = delivery;
      await announcement.save();
    }

    return NextResponse.json({ id: String(announcement._id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to publish announcement." }, { status: 500 });
  }
}
