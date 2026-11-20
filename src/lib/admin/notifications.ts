import { ObjectId } from "mongodb";
import connectToDatabase from "@/lib/mongodb";
import transporter from "@/lib/nodemailer";
import { ensureAdminIndexes } from "@/lib/admin/access";

export type PlatformAudienceType = "all_users" | "selected_users" | "selected_groups" | "group_admins" | "moderators" | "administrators";
export type PlatformAudience = { type: PlatformAudienceType; userIds?: string[]; groupIds?: string[] };
export type PlatformChannel = "in_app" | "email";
const MAX_RECIPIENTS = 50_000;
const BATCH_SIZE = 100;

export function normalizeAudienceIds(values: unknown) {
  return Array.isArray(values)
    ? Array.from(new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)))
    : [];
}

export function classifyEmailDelivery(input: { transportAvailable: boolean; addressAvailable: boolean; recipientAccepted: boolean }) {
  if (!input.transportAvailable) return "unavailable" as const;
  if (!input.addressAvailable || !input.recipientAccepted) return "failed" as const;
  return "accepted_by_smtp" as const;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export async function resolveNotificationAudience(audience: PlatformAudience) {
  const db = await connectToDatabase();
  const people = new Map<string, { userId: string; name: string | null; email: string | null }>();
  if (audience.type === "all_users") {
    const users = await db.collection("user").find({ banned: { $ne: true }, status: { $ne: "suspended" } }, { projection: { id: 1, name: 1, email: 1 } }).limit(MAX_RECIPIENTS + 1).toArray();
    if (users.length > MAX_RECIPIENTS) throw new Error("This audience exceeds the 50,000-recipient limit. Select smaller user or group audiences.");
    for (const user of users) if (typeof user.id === "string") people.set(user.id, { userId: user.id, name: user.name ?? null, email: user.email ?? null });
  } else if (audience.type === "selected_users") {
    const ids = normalizeAudienceIds(audience.userIds);
    if (ids.length === 0) throw new Error("Select at least one user.");
    if (ids.length > 500) throw new Error("Select no more than 500 individual users at a time.");
    const users = await db.collection("user").find({ id: { $in: ids }, banned: { $ne: true }, status: { $ne: "suspended" } }, { projection: { id: 1, name: 1, email: 1 } }).toArray();
    if (users.length !== ids.length) throw new Error("One or more selected users were not found or are suspended.");
    for (const user of users) people.set(String(user.id), { userId: String(user.id), name: user.name ?? null, email: user.email ?? null });
  } else if (audience.type === "selected_groups" || audience.type === "group_admins") {
    const requestedGroupIds = normalizeAudienceIds(audience.groupIds);
    const groupIds = requestedGroupIds.filter((id) => ObjectId.isValid(id));
    if (groupIds.length !== requestedGroupIds.length) throw new Error("One or more selected group IDs are invalid.");
    if (audience.type === "selected_groups" && groupIds.length === 0) throw new Error("Select at least one valid group.");
    if (groupIds.length > 250) throw new Error("Select no more than 250 groups at a time.");
    const groupFilter = groupIds.length ? { _id: { $in: groupIds.map((id) => new ObjectId(id)) } } : {};
    const groups = await db.collection("chamagroups").find(groupFilter, { projection: { _id: 1, status: 1 } }).toArray();
    if (audience.type === "selected_groups" && groups.length !== groupIds.length) throw new Error("One or more selected groups were not found.");
    const activeGroupIds = groups.filter((group) => group.status !== "archived").map((group) => group._id);
    const memberships = await db.collection("chamamembers").aggregate([
      { $match: {
        groupId: { $in: activeGroupIds },
        status: "active",
        ...(audience.type === "group_admins" ? { role: "admin" } : {}),
        userId: { $type: "string" },
      } },
      { $group: { _id: "$userId" } },
      { $limit: MAX_RECIPIENTS + 1 },
    ]).toArray();
    const ids = memberships.map((member) => String(member._id));
    if (ids.length > MAX_RECIPIENTS) throw new Error("This group audience exceeds the 50,000-recipient limit. Select fewer groups.");
    const users = await db.collection("user").find({ id: { $in: ids }, banned: { $ne: true }, status: { $ne: "suspended" } }, { projection: { id: 1, name: 1, email: 1 } }).toArray();
    for (const user of users) people.set(String(user.id), { userId: String(user.id), name: user.name ?? null, email: user.email ?? null });
  } else if (audience.type === "moderators") {
    const users = await db.collection("user").find({
      banned: { $ne: true }, status: { $ne: "suspended" },
      role: { $regex: "(^|,)\\s*moderator\\s*(,|$)", $options: "i" },
    }, { projection: { id: 1, name: 1, email: 1 } }).limit(MAX_RECIPIENTS + 1).toArray();
    if (users.length > MAX_RECIPIENTS) throw new Error("This moderator audience exceeds the 50,000-recipient limit.");
    for (const user of users) if (typeof user.id === "string") people.set(user.id, { userId: user.id, name: user.name ?? null, email: user.email ?? null });
  } else if (audience.type === "administrators") {
    const grants = await db.collection("admin_access").find({ status: "active", $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }, { projection: { userId: 1 } }).limit(MAX_RECIPIENTS + 1).toArray();
    if (grants.length > MAX_RECIPIENTS) throw new Error("This administrator audience exceeds the 50,000-recipient limit.");
    const ids = Array.from(new Set(grants.map((grant) => String(grant.userId))));
    const users = await db.collection("user").find({ id: { $in: ids }, banned: { $ne: true }, status: { $ne: "suspended" } }, { projection: { id: 1, name: 1, email: 1 } }).toArray();
    for (const user of users) if (typeof user.id === "string") people.set(user.id, { userId: user.id, name: user.name ?? null, email: user.email ?? null });
  }
  if (people.size > MAX_RECIPIENTS) throw new Error("This audience exceeds the 50,000-recipient limit. Select a smaller audience.");
  return Array.from(people.values());
}

async function prepareNotification(notificationId: string) {
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  if (!ObjectId.isValid(notificationId)) throw new Error("Invalid notification ID.");
  const notification = await db.collection("admin_notifications").findOne({ _id: new ObjectId(notificationId), status: "published" });
  if (!notification) throw new Error("Published notification not found.");
  if (notification.recipientsPrepared === true) return Number(notification.recipientCount ?? 0);
  const recipients = await resolveNotificationAudience(notification.audience as PlatformAudience);
  const queue = db.collection("admin_notification_recipients");
  for (let start = 0; start < recipients.length; start += 500) {
    const batch = recipients.slice(start, start + 500);
    try {
      await queue.bulkWrite(batch.map((recipient) => ({
        updateOne: {
          filter: { notificationId, userId: recipient.userId },
          update: { $setOnInsert: { notificationId, userId: recipient.userId, status: "pending", inAppStatus: "pending", emailStatus: (notification.channels as PlatformChannel[]).includes("email") ? "pending" : "not_requested", createdAt: new Date() } },
          upsert: true,
        },
      })), { ordered: false });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  await db.collection("admin_notifications").updateOne(
    { _id: notification._id, status: "published", recipientsPrepared: { $ne: true } },
    { $set: { recipientsPrepared: true, recipientCount: recipients.length, deliveryComplete: recipients.length === 0, recipientsPreparedAt: new Date() } },
  );
  return recipients.length;
}

async function updateDeliverySummary(notificationId: string, recipientCount: number) {
  const db = await connectToDatabase();
  const [counts] = await db.collection("admin_notification_recipients").aggregate([
    { $match: { notificationId } },
    { $group: {
      _id: null,
      inAppInserted: { $sum: { $cond: [{ $eq: ["$inAppStatus", "delivered"] }, 1, 0] } },
      emailAcceptedBySmtp: { $sum: { $cond: [{ $eq: ["$emailStatus", "accepted_by_smtp"] }, 1, 0] } },
      emailFailed: { $sum: { $cond: [{ $eq: ["$emailStatus", "failed"] }, 1, 0] } },
      emailUnavailable: { $sum: { $cond: [{ $eq: ["$emailStatus", "unavailable"] }, 1, 0] } },
      emailUnknown: { $sum: { $cond: [{ $eq: ["$emailStatus", "outcome_unknown"] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
      processing: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
    } },
  ]).toArray();
  const summary = { recipients: recipientCount, inAppInserted: counts?.inAppInserted ?? 0, emailAcceptedBySmtp: counts?.emailAcceptedBySmtp ?? 0, emailFailed: counts?.emailFailed ?? 0, emailUnavailable: counts?.emailUnavailable ?? 0, emailOutcomeUnknown: counts?.emailUnknown ?? 0, pending: counts?.pending ?? 0, processing: counts?.processing ?? 0, attemptedAt: new Date() };
  const deliveryComplete = summary.pending === 0 && summary.processing === 0;
  await db.collection("admin_notifications").updateOne({ _id: new ObjectId(notificationId) }, { $set: { deliverySummary: summary, deliveryComplete, lastDeliveryAt: new Date() } });
  return { ...summary, deliveryComplete };
}

export async function deliverPlatformNotification(notificationId: string) {
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const recipientCount = await prepareNotification(notificationId);
  const id = new ObjectId(notificationId);
  const notification = await db.collection("admin_notifications").findOne({ _id: id, status: "published" });
  if (!notification) throw new Error("Published notification not found.");
  const recipients = db.collection("admin_notification_recipients");
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const stale = await recipients.find({ notificationId, status: "processing", claimedAt: { $lt: staleBefore } }).limit(BATCH_SIZE).toArray();
  for (const item of stale) {
    await recipients.updateOne({ _id: item._id, status: "processing", claimedAt: item.claimedAt }, { $set: { status: "unknown", emailStatus: item.emailStatus === "pending" ? "outcome_unknown" : item.emailStatus, finishedAt: new Date(), failureReason: "Delivery worker stopped before the provider result was recorded." } });
    await db.collection("user_notifications").updateOne({ notificationId, userId: item.userId, emailStatus: "pending" }, { $set: { emailStatus: "outcome_unknown" } });
  }
  const batch = await recipients.find({ notificationId, status: "pending" }).sort({ _id: 1 }).limit(BATCH_SIZE).toArray();
  const userIds = batch.map((item) => item.userId).filter((value): value is string => typeof value === "string");
  const users = userIds.length ? await db.collection("user").find({ id: { $in: userIds } }, { projection: { id: 1, email: 1 } }).toArray() : [];
  const emailByUser = new Map(users.map((user) => [String(user.id), typeof user.email === "string" ? user.email : null]));
  const channels = notification.channels as PlatformChannel[];

  for (const recipient of batch) {
    const claim = await recipients.updateOne({ _id: recipient._id, status: "pending" }, { $set: { status: "processing", claimedAt: new Date() } });
    if (claim.modifiedCount !== 1) continue;
    const deliveryKey = { notificationId, userId: recipient.userId };
    let emailStatus: string = "not_requested";
    let emailError: string | undefined;
    let emailResponse: string | undefined;
    const userNotification = await db.collection("user_notifications").updateOne(
      deliveryKey,
      { $setOnInsert: {
        notificationId,
        userId: recipient.userId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        createdAt: new Date(),
        readAt: null,
        inAppStatus: "delivered",
        emailStatus: channels.includes("email") ? "pending" : "not_requested",
      } },
      { upsert: true },
    );
    if (userNotification.upsertedCount === 0) {
      const existing = await db.collection("user_notifications").findOne(deliveryKey, { projection: { inAppStatus: 1, emailStatus: 1 } });
      if (existing?.inAppStatus !== "delivered") await db.collection("user_notifications").updateOne(deliveryKey, { $set: { inAppStatus: "delivered" } });
    }

    if (channels.includes("email")) {
      const email = emailByUser.get(String(recipient.userId));
      if (!transporter) emailStatus = classifyEmailDelivery({ transportAvailable: false, addressAvailable: Boolean(email), recipientAccepted: false });
      else if (!email) { emailStatus = classifyEmailDelivery({ transportAvailable: true, addressAvailable: false, recipientAccepted: false }); emailError = "No account email recorded."; }
      else {
        try {
          const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "ChamaPulse: " + String(notification.title),
            html: "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#172033\"><h2>" + escapeHtml(String(notification.title)) + "</h2><p>" + escapeHtml(String(notification.message)).replace(/\n/g, "<br />") + "</p><p style=\"font-size:12px;color:#5a6882\">ChamaPulse platform notification</p></div>",
          });
          const accepted = Array.isArray(info.accepted) && info.accepted.includes(email);
          emailStatus = classifyEmailDelivery({ transportAvailable: true, addressAvailable: true, recipientAccepted: accepted });
          emailResponse = String(info.response ?? "").slice(0, 300);
          if (!accepted) emailError = "SMTP did not accept the recipient.";
        } catch (error) {
          emailStatus = "outcome_unknown";
          emailError = error instanceof Error ? error.message.slice(0, 300) : "SMTP outcome could not be confirmed.";
        }
      }
      await db.collection("user_notifications").updateOne(deliveryKey, { $set: { emailStatus, emailAttemptedAt: new Date(), ...(emailError ? { emailError } : {}), ...(emailResponse ? { emailResponse } : {}) } });
    }
    await recipients.updateOne({ _id: recipient._id, status: "processing" }, { $set: { status: "complete", inAppStatus: "delivered", emailStatus, ...(emailError ? { failureReason: emailError } : {}), finishedAt: new Date() } });
  }
  return updateDeliverySummary(notificationId, recipientCount);
}

export async function deliverScheduledPlatformNotifications() {
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const now = new Date();
  const due = await db.collection("admin_notifications").find({ status: "scheduled", scheduledFor: { $lte: now } }).sort({ scheduledFor: 1 }).limit(20).toArray();
  let published = 0;
  for (const item of due) {
    const update = await db.collection("admin_notifications").updateOne(
      { _id: item._id, status: "scheduled", scheduledFor: { $lte: now } },
      { $set: { status: "published", publishedAt: now, updatedAt: now } },
    );
    if (update.modifiedCount === 1) published += 1;
  }
  const pending = await db.collection("admin_notifications").find({ status: "published", deliveryComplete: { $ne: true } }).sort({ createdAt: 1 }).limit(20).toArray();
  let batchesProcessed = 0;
  for (const item of pending) {
    await deliverPlatformNotification(String(item._id));
    batchesProcessed += 1;
  }
  return { due: due.length, published, batchesProcessed };
}
