import { NextResponse, type NextRequest } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import ChamaCallModel from "@/lib/models/chama-call";
import ChamaAnnouncementModel from "@/lib/models/chama-announcement";
import { notifyGroupCallMembers } from "@/lib/chama-call-notifications";
import { deliverAnnouncement } from "@/lib/chama-announcement-notifications";

const getAuthToken = (request: NextRequest) => {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const direct = request.headers.get("x-jobs-token");
  if (direct) return direct.trim();
  const url = new URL(request.url);
  const query = url.searchParams.get("token");
  return query ? query.trim() : null;
};

export async function GET(request: NextRequest) {
  const expected = process.env.JOBS_TOKEN;
  const provided = getAuthToken(request);
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectMongoose();

  const now = new Date();
  const startingCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const scheduledBackfill = await ChamaCallModel.find({
    scheduledFor: { $gt: now },
    scheduledNotifiedAt: { $exists: false },
  })
    .sort({ scheduledFor: 1 })
    .limit(25)
    .lean();

  const startingDue = await ChamaCallModel.find({
    scheduledFor: { $lte: now, $gte: startingCutoff },
    startingNotifiedAt: { $exists: false },
  })
    .sort({ scheduledFor: -1 })
    .limit(25)
    .lean();

  let scheduledProcessed = 0;
  let startingProcessed = 0;
  let scheduledDelivered = 0;
  let startingDelivered = 0;
  let announcementsDelivered = 0;

  for (const call of scheduledBackfill) {
    scheduledProcessed += 1;
    try {
      const result = await notifyGroupCallMembers({
        groupId: String(call.groupId),
        title: String(call.title || "Group call"),
        scheduledFor: call.scheduledFor ? new Date(call.scheduledFor) : undefined,
        meetingUri: (call.meetingUri as string | undefined) || null,
        kind: "scheduled",
      });

      if (result.emailed + result.sms > 0) {
        scheduledDelivered += 1;
        await ChamaCallModel.updateOne(
          { _id: call._id },
          { $set: { scheduledNotifiedAt: now } }
        );
      }
    } catch {
      // Skip failures; cron can retry later.
    }
  }

  for (const call of startingDue) {
    startingProcessed += 1;
    try {
      const result = await notifyGroupCallMembers({
        groupId: String(call.groupId),
        title: String(call.title || "Group call"),
        scheduledFor: call.scheduledFor ? new Date(call.scheduledFor) : undefined,
        meetingUri: (call.meetingUri as string | undefined) || null,
        kind: "starting",
      });

      if (result.emailed + result.sms > 0) {
        startingDelivered += 1;
        await ChamaCallModel.updateOne(
          { _id: call._id },
          { $set: { startingNotifiedAt: now } }
        );
      }
    } catch {
      // Skip failures; cron can retry later.
    }
  }

  const scheduledAnnouncements = await ChamaAnnouncementModel.find({
    scheduledFor: { $lte: now },
    deliveredAt: { $exists: false },
  })
    .sort({ scheduledFor: 1 })
    .limit(25);

  for (const announcement of scheduledAnnouncements) {
    try {
      const delivery = await deliverAnnouncement({
        groupId: String(announcement.groupId),
        title: announcement.title,
        message: announcement.message,
        deliveryChannels: announcement.deliveryChannels as Array<"in-app" | "email" | "sms">,
      });
      announcement.deliveredAt = now;
      announcement.deliverySummary = delivery;
      await announcement.save();
      announcementsDelivered += 1;
    } catch {
      // Leave it pending so a later job run can retry delivery.
    }
  }

  return NextResponse.json({
    scheduled: {
      processed: scheduledProcessed,
      delivered: scheduledDelivered,
    },
    starting: {
      processed: startingProcessed,
      delivered: startingDelivered,
    },
    announcements: {
      processed: scheduledAnnouncements.length,
      delivered: announcementsDelivered,
    },
    ranAt: now.toISOString(),
  });
}

