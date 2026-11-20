import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { getGroupMember, getSessionUser } from "@/lib/chama-access";
import { checkSameOrigin, ensureAdminIndexes, enforceUserRateLimit, parsePageParams } from "@/lib/admin/access";
import { canUserReplyToTicket, publicTicketMessages, userTicketFilter } from "@/lib/admin/support-policy";

export const dynamic = "force-dynamic";
const categories = ["contribution_dispute", "payout_dispute", "group_membership", "account_access", "payment_verification", "other"];

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your support tickets." }, { status: 401 });
  const { page, pageSize, skip } = parsePageParams(new URL(request.url).searchParams, 20);
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const [total, tickets] = await Promise.all([
    db.collection("admin_support_tickets").countDocuments(userTicketFilter(user.id)),
    db.collection("admin_support_tickets").find(userTicketFilter(user.id), { projection: { reference: 1, subject: 1, category: 1, priority: 1, status: 1, groupId: 1, ledgerReference: 1, messages: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return NextResponse.json({ items: tickets.map((ticket) => ({ id: String(ticket._id), ...ticket, messages: publicTicketMessages(ticket.messages) })), total, page, pageSize });
}

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to open a support ticket." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" ? body.category : "";
  if (subject.length < 5 || subject.length > 160 || description.length < 10 || description.length > 5000 || !categories.includes(category)) {
    return NextResponse.json({ error: "Provide a category, subject of 5 to 160 characters, and description of 10 to 5,000 characters." }, { status: 400 });
  }
  const limited = await enforceUserRateLimit({ userId: user.id, request, action: "support-ticket-create", limit: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const groupId = typeof body.groupId === "string" && ObjectId.isValid(body.groupId) ? body.groupId : null;
  let member: { _id?: unknown } | null = null;
  if (groupId) {
    member = await getGroupMember(groupId, user);
    if (!member) return NextResponse.json({ error: "You must be an active member to open a group-related ticket." }, { status: 403 });
  }
  const ledgerReference = typeof body.ledgerReference === "string" ? body.ledgerReference.trim().slice(0, 120) : "";
  if (ledgerReference) {
    if (!groupId || !member?._id) return NextResponse.json({ error: "A group membership is required to attach a ledger reference." }, { status: 400 });
    const transaction = await db.collection("chamafinancialtransactions").findOne({ reference: ledgerReference, groupId: new ObjectId(groupId), memberId: member._id }, { projection: { _id: 1 } });
    if (!transaction) return NextResponse.json({ error: "The ledger reference was not found in your group account." }, { status: 404 });
  }
  const now = new Date();
  const reference = "CP-" + now.toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomUUID().slice(0, 8).toUpperCase();
  const ticket = {
    reference, subject, category, priority: "normal", status: "OPEN",
    createdBy: user.id, createdByName: user.name ?? user.email ?? "User",
    assignedTo: null, assignedBy: null, groupId: groupId ? new ObjectId(groupId) : null,
    ledgerReference: ledgerReference || null, createdAt: now, updatedAt: now,
    messages: [{ visibility: "user", authorId: user.id, authorName: user.name ?? user.email ?? "User", body: description, createdAt: now }],
    resolutionHistory: [],
  };
  const result = await db.collection("admin_support_tickets").insertOne(ticket);
  return NextResponse.json({ ok: true, id: String(result.insertedId), reference }, { status: 201 });
}

export async function PATCH(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to reply to a support ticket." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { ticketId?: unknown; message?: unknown };
  if (typeof body.ticketId !== "string" || !ObjectId.isValid(body.ticketId) || typeof body.message !== "string" || body.message.trim().length < 2 || body.message.length > 4000) {
    return NextResponse.json({ error: "Provide a ticket ID and reply of 2 to 4,000 characters." }, { status: 400 });
  }
  const limited = await enforceUserRateLimit({ userId: user.id, request, action: "support-ticket-reply", limit: 30, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const db = await connectToDatabase();
  const ticket = await db.collection("admin_support_tickets").findOne({ _id: new ObjectId(body.ticketId), ...userTicketFilter(user.id) });
  if (!ticket) return NextResponse.json({ error: "Support ticket not found." }, { status: 404 });
  if (!canUserReplyToTicket({ createdBy: ticket.createdBy, status: ticket.status }, user.id)) return NextResponse.json({ error: "This ticket is resolved or closed and cannot receive a reply." }, { status: 409 });
  const now = new Date();
  await db.collection("admin_support_tickets").updateOne({ _id: ticket._id, ...userTicketFilter(user.id), status: { $nin: ["CLOSED", "RESOLVED"] } }, {
    $push: { messages: { visibility: "user", authorId: user.id, authorName: user.name ?? user.email ?? "User", body: body.message.trim(), createdAt: now } } as never,
    $set: { updatedAt: now, status: ticket.status === "PENDING" ? "IN_PROGRESS" : ticket.status },
  });
  return NextResponse.json({ ok: true });
}
