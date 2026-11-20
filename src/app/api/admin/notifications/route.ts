import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { deliverPlatformNotification, resolveNotificationAudience, type PlatformAudience, type PlatformAudienceType, type PlatformChannel } from "@/lib/admin/notifications";
import { checkSameOrigin, enforceAdminRateLimit, parsePageParams, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";
const types = ["general", "maintenance", "security", "feature", "account", "group"] as const;
const audienceTypes: PlatformAudienceType[] = ["all_users", "selected_users", "selected_groups", "group_admins", "moderators", "administrators"];

export async function GET(request: Request) {
  const access = await requireAdminPermission("notifications.read");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "admin-notifications-read", limit: 60 });
  if (limited) return limited;
  const url = new URL(request.url);
  const { page, pageSize, skip } = parsePageParams(url.searchParams, 20);
  const status = url.searchParams.get("status");
  const filter = status && ["draft", "scheduled", "published", "archived"].includes(status) ? { status } : {};
  const db = await connectToDatabase();
  const [total, rows] = await Promise.all([
    db.collection("admin_notifications").countDocuments(filter),
    db.collection("admin_notifications").find(filter, { projection: { title: 1, message: 1, type: 1, audience: 1, channels: 1, status: 1, scheduledFor: 1, publishedAt: 1, archivedAt: 1, createdBy: 1, createdAt: 1, updatedAt: 1, deliverySummary: 1, deliveryComplete: 1 } }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return NextResponse.json({ items: rows.map((item) => ({ ...item, id: String(item._id), _id: undefined })), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("notifications.write");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "admin-notifications", limit: 30 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  const db = await connectToDatabase();

  if (action === "preview" || action === "create-draft" || action === "publish") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const type = typeof body.type === "string" ? body.type : "general";
    const audience = body.audience as PlatformAudience | undefined;
    const channels = Array.isArray(body.channels) ? Array.from(new Set(body.channels.map(String))) as PlatformChannel[] : ["in_app" as const];
    if (title.length < 3 || title.length > 160 || message.length < 5 || message.length > 10_000 || !types.includes(type as typeof types[number]) || !audience || !audienceTypes.includes(audience.type) || channels.some((channel) => !["in_app", "email"].includes(channel))) {
      return NextResponse.json({ error: "Provide a valid title, message, notification type, audience and delivery channel." }, { status: 400 });
    }
    if (!channels.includes("in_app")) return NextResponse.json({ error: "In-app delivery is required for platform announcements." }, { status: 400 });
    let recipients;
    try { recipients = await resolveNotificationAudience(audience); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "The audience could not be validated." }, { status: 400 }); }
    if (action === "preview") return NextResponse.json({ recipientCount: recipients.length, emailEligible: recipients.filter((recipient) => Boolean(recipient.email)).length, sample: recipients.slice(0, 5).map(({ userId, name, email }) => ({ userId, name, email })) });

    let scheduledFor: Date | null = null;
    if (action === "publish" && body.scheduledFor) {
      scheduledFor = new Date(String(body.scheduledFor));
      if (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date()) return NextResponse.json({ error: "Scheduled notifications must have a valid future send time." }, { status: 400 });
    }
    const now = new Date();
    const status = scheduledFor ? "scheduled" : action === "create-draft" ? "draft" : "published";
    const doc = { title, message, type, audience, channels, status, scheduledFor, publishedAt: status === "published" ? now : null, createdBy: access.session.user.id, createdAt: now, updatedAt: now, deliverySummary: null };
    const created = await db.collection("admin_notifications").insertOne(doc);
    await writeAdminAudit({ actor: access.session, action: status === "draft" ? "notification.draft.created" : status === "scheduled" ? "notification.scheduled" : "notification.published", entityType: "notification", entityId: String(created.insertedId), request, after: { title, type, audience, channels, status, scheduledFor } });
    const delivery = status === "published" ? await deliverPlatformNotification(String(created.insertedId)) : null;
    return NextResponse.json({ ok: true, id: String(created.insertedId), status, delivery }, { status: 201 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "A valid notification ID is required." }, { status: 400 });
  const current = await db.collection("admin_notifications").findOne({ _id: new ObjectId(id) });
  if (!current) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  if (action === "archive") {
    if (current.status === "published" && current.deliveryComplete !== true) return NextResponse.json({ error: "Wait for all recipient batches to finish before archiving this announcement." }, { status: 409 });
    await db.collection("admin_notifications").updateOne({ _id: current._id }, { $set: { status: "archived", archivedAt: new Date(), updatedAt: new Date() } });
    await writeAdminAudit({ actor: access.session, action: "notification.archived", entityType: "notification", entityId: id, request, before: { status: current.status }, after: { status: "archived" } });
    return NextResponse.json({ ok: true });
  }
  if (action !== "update-draft" || current.status !== "draft") return NextResponse.json({ error: "Only drafts can be edited." }, { status: 409 });
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const audience = body.audience as PlatformAudience | undefined;
  const channels = Array.isArray(body.channels) ? Array.from(new Set(body.channels.map(String))) : [];
  const type = typeof body.type === "string" ? body.type : "";
  if (title.length < 3 || title.length > 160 || message.length < 5 || message.length > 10_000 || !types.includes(type as typeof types[number]) || !audience || !audienceTypes.includes(audience.type) || channels.length === 0 || channels.some((channel) => !["in_app", "email"].includes(channel))) return NextResponse.json({ error: "Provide valid draft content and delivery settings." }, { status: 400 });
  if (!channels.includes("in_app")) return NextResponse.json({ error: "In-app delivery is required for platform announcements." }, { status: 400 });
  try { await resolveNotificationAudience(audience); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "The audience could not be validated." }, { status: 400 }); }
  const next = { title, message, type, audience, channels, updatedAt: new Date() };
  await db.collection("admin_notifications").updateOne({ _id: current._id, status: "draft" }, { $set: next });
  await writeAdminAudit({ actor: access.session, action: "notification.draft.updated", entityType: "notification", entityId: id, request, before: { title: current.title, status: current.status }, after: next });
  return NextResponse.json({ ok: true });
}
