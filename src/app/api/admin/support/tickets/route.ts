import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { checkSameOrigin, enforceAdminRateLimit, ensureAdminIndexes, parsePageParams, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";
const statuses = ["OPEN", "IN_PROGRESS", "PENDING", "ESCALATED", "RESOLVED", "CLOSED"];
const priorities = ["low", "normal", "high", "urgent"];

export async function GET(request: Request) {
  const access = await requireAdminPermission("support.tickets.read");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "admin-support-read", limit: 60 });
  if (limited) return limited;
  const url = new URL(request.url);
  const { page, pageSize, skip } = parsePageParams(url.searchParams, 25);
  const query: Record<string, unknown> = {};
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const search = url.searchParams.get("search")?.trim().slice(0, 120);
  if (status && statuses.includes(status)) query.status = status;
  if (priority && priorities.includes(priority)) query.priority = priority;
  if (search) {
    const safe = search.replace(/[.*+?^$\u007b}()|[\]\\]/g, "\\$&");
    query.$or = [{ reference: { $regex: safe, $options: "i" } }, { subject: { $regex: safe, $options: "i" } }, { createdBy: { $regex: safe } }, { createdByName: { $regex: safe, $options: "i" } }, { ledgerReference: { $regex: safe, $options: "i" } }];
  }
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const [total, tickets] = await Promise.all([
    db.collection("admin_support_tickets").countDocuments(query),
    db.collection("admin_support_tickets").find(query).sort({ priority: -1, updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return NextResponse.json({ items: tickets.map((ticket) => ({ ...ticket, id: String(ticket._id), _id: undefined })), total, page, pageSize });
}

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  const permission = ["reply", "note"].includes(String(action)) ? "support.tickets.respond" : "support.tickets.manage";
  const access = await requireAdminPermission(permission);
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "support-ticket", limit: 60 });
  if (limited) return limited;
  if (typeof body.ticketId !== "string" || !ObjectId.isValid(body.ticketId)) return NextResponse.json({ error: "A valid ticket ID is required." }, { status: 400 });
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const id = new ObjectId(body.ticketId);
  const ticket = await db.collection("admin_support_tickets").findOne({ _id: id });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  const now = new Date();

  if (action === "assign") {
    const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim() : "";
    if (assignedTo) {
      const grant = await db.collection("admin_access").findOne({ userId: assignedTo, status: "active", permissions: "support.tickets.read" });
      if (!grant && !await db.collection("admin_access").findOne({ userId: assignedTo, status: "active", role: "SUPER_ADMIN" })) return NextResponse.json({ error: "Assign the ticket to active support staff." }, { status: 400 });
    }
    await db.collection("admin_support_tickets").updateOne({ _id: id }, { $set: { assignedTo: assignedTo || null, assignedBy: assignedTo ? access.session.user.id : null, updatedAt: now } });
    await writeAdminAudit({ actor: access.session, action: "support.ticket.assigned", entityType: "support_ticket", entityId: String(id), request, before: { assignedTo: ticket.assignedTo ?? null }, after: { assignedTo: assignedTo || null } });
    return NextResponse.json({ ok: true });
  }
  if (action === "status") {
    const status = typeof body.status === "string" ? body.status : "";
    if (!statuses.includes(status)) return NextResponse.json({ error: "Unsupported ticket status." }, { status: 400 });
    const update: Record<string, unknown> = { status, updatedAt: now };
    if (status === "RESOLVED" || status === "CLOSED") {
      update.resolvedAt = now;
      update.resolvedBy = access.session.user.id;
      update.$push = { resolutionHistory: { status, changedBy: access.session.user.id, changedAt: now, note: typeof body.resolution === "string" ? body.resolution.trim().slice(0, 1000) : "" } };
    } else if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      update.resolvedAt = null;
      update.resolvedBy = null;
    }
    if (update.$push) {
      const push = update.$push;
      delete update.$push;
      await db.collection("admin_support_tickets").updateOne({ _id: id }, { $set: update, $push: push as never });
    } else {
      await db.collection("admin_support_tickets").updateOne({ _id: id }, { $set: update });
    }
    await writeAdminAudit({ actor: access.session, action: "support.ticket." + status.toLowerCase(), entityType: "support_ticket", entityId: String(id), request, before: { status: ticket.status }, after: { status } });
    if (status === "RESOLVED" || status === "CLOSED") {
      await db.collection("user_notifications").insertOne({ notificationId: "ticket-" + String(id) + "-" + randomUUID(), userId: ticket.createdBy, title: "Support ticket updated", message: "Your ticket " + ticket.reference + " is " + status.toLowerCase() + ".", type: "account", createdAt: now, readAt: null, inAppStatus: "delivered", emailStatus: "not_requested" });
    }
    return NextResponse.json({ ok: true });
  }
  if (action === "priority") {
    const priority = typeof body.priority === "string" ? body.priority : "";
    if (!priorities.includes(priority)) return NextResponse.json({ error: "Unsupported ticket priority." }, { status: 400 });
    await db.collection("admin_support_tickets").updateOne({ _id: id }, { $set: { priority, updatedAt: now } });
    await writeAdminAudit({ actor: access.session, action: "support.ticket.priority_changed", entityType: "support_ticket", entityId: String(id), request, before: { priority: ticket.priority }, after: { priority } });
    return NextResponse.json({ ok: true });
  }
  if (action === "reply" || action === "note") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 2 || message.length > 4000) return NextResponse.json({ error: "Message must be 2 to 4,000 characters." }, { status: 400 });
    const visibility = action === "note" ? "internal" : "user";
    await db.collection("admin_support_tickets").updateOne({ _id: id }, { $push: { messages: { visibility, authorId: access.session.user.id, authorName: access.session.user.name ?? access.session.user.email ?? "Staff", body: message, createdAt: now } } as never, $set: { updatedAt: now } });
    await writeAdminAudit({ actor: access.session, action: action === "note" ? "support.ticket.note_added" : "support.ticket.reply_sent", entityType: "support_ticket", entityId: String(id), request, metadata: { visibility } });
    if (action === "reply") {
      await db.collection("user_notifications").insertOne({ notificationId: "ticket-" + String(id) + "-" + randomUUID(), userId: ticket.createdBy, title: "Support replied", message: "A ChamaPulse support agent replied to ticket " + ticket.reference + ".", type: "account", createdAt: now, readAt: null, inAppStatus: "delivered", emailStatus: "not_requested" });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported support ticket action." }, { status: 400 });
}
