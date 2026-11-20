import { NextResponse } from "next/server";
import { clerkClient } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import transporter from "@/lib/nodemailer";
import {
  checkSameOrigin,
  enforceAdminRateLimit,
  requireAdminPermission,
  isSuperAdmin,
  writeAdminAudit,
} from "@/lib/admin/access";

export const dynamic = "force-dynamic";

async function findAccount(userId: string) {
  const db = await connectToDatabase();
  const user = await db.collection("user").findOne({ id: userId }, {
    projection: { _id: 0, id: 1, clerkId: 1, name: 1, email: 1, role: 1, status: 1, banned: 1, createdAt: 1, updatedAt: 1 },
  });
  return { db, user };
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const access = await requireAdminPermission("users.read");
  if (access.response) return access.response;
  const { userId } = await context.params;
  const { db, user } = await findAccount(userId);
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const memberQuery: Record<string, unknown>[] = [{ userId }];
  if (typeof user.email === "string" && user.email) memberQuery.push({ email: user.email.toLowerCase() });
  const members = await db.collection("chamamembers").find({ $or: memberQuery }, {
    projection: { groupId: 1, name: 1, role: 1, status: 1, joinedAt: 1 },
  }).sort({ joinedAt: -1 }).limit(100).toArray();
  const groupIds = members.map((member) => member.groupId);
  const [groups, transactions, activity, notes, activeSessions] = await Promise.all([
    db.collection("chamagroups").find({ _id: { $in: groupIds } }, { projection: { name: 1, status: 1, currency: 1 } }).toArray(),
    db.collection("chamafinancialtransactions").find({ memberId: { $in: members.map((member) => member._id) } }, {
      projection: { groupId: 1, memberId: 1, type: 1, direction: 1, amountMinor: 1, legacyAmountMajor: 1, currency: 1, status: 1, reference: 1, transactionDate: 1 },
    }).sort({ transactionDate: -1, _id: -1 }).limit(50).toArray(),
    db.collection("admin_audit").find({ entityType: "user", entityId: userId }, { projection: { actorId: 1, actorRole: 1, action: 1, occurredAt: 1, metadata: 1 } }).sort({ occurredAt: -1 }).limit(50).toArray(),
    db.collection("admin_user_notes").find({ targetUserId: userId }, { projection: { authorId: 1, authorName: 1, text: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray(),
    user.clerkId ? (await (await clerkClient()).sessions.getSessionList({ userId: String(user.clerkId), status: "active", limit: 100 })).totalCount : 0,
  ]);
  const groupMap = new Map(groups.map((group) => [String(group._id), group]));
  return NextResponse.json({
    user: {
      id: String(user.id), name: user.name ?? "", email: user.email ?? "", role: user.role ?? "member",
      status: user.banned === true || user.status === "suspended" ? "suspended" : "registered",
      createdAt: user.createdAt ?? null, updatedAt: user.updatedAt ?? null,
    },
    groups: members.map((member) => ({
      id: String(member.groupId), name: groupMap.get(String(member.groupId))?.name ?? "Group",
      groupStatus: groupMap.get(String(member.groupId))?.status ?? "unknown", memberRole: member.role,
      memberStatus: member.status, joinedAt: member.joinedAt ?? null, currency: groupMap.get(String(member.groupId))?.currency ?? null,
    })),
    transactions: transactions.map((transaction) => ({
      id: String(transaction._id), groupName: groupMap.get(String(transaction.groupId))?.name ?? "Group",
      type: transaction.type, direction: transaction.direction, amountMinor: transaction.amountMinor ?? null,
      legacyAmountMajor: transaction.legacyAmountMajor ?? null, currency: transaction.currency,
      status: transaction.status, reference: transaction.reference ?? "", transactionDate: transaction.transactionDate,
    })),
    security: { activeSessions, loginHistoryAvailable: false, passwordResetAvailable: false },
    activity: activity.map((entry) => ({ id: String(entry._id), actorId: entry.actorId, actorRole: entry.actorRole, action: entry.action, occurredAt: entry.occurredAt, metadata: entry.metadata ?? null })),
    notes: notes.map((note) => ({ id: String(note._id), authorId: note.authorId, authorName: note.authorName, text: note.text, createdAt: note.createdAt })),
    subscriptionsAvailable: false,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const { userId } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: string; text?: string; reason?: string };

  if (body.action === "add-note") {
    const access = await requireAdminPermission("users.write");
    if (access.response) return access.response;
    const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "user-note", limit: 30 });
    if (limited) return limited;
    const text = body.text?.trim();
    if (!text || text.length > 4000) return NextResponse.json({ error: "A note of 1 to 4,000 characters is required." }, { status: 400 });
    const { db, user } = await findAccount(userId);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const note = { targetUserId: userId, authorId: access.session.user.id, authorName: access.session.user.name ?? access.session.user.email ?? "Administrator", text, createdAt: new Date() };
    const inserted = await db.collection("admin_user_notes").insertOne(note);
    await writeAdminAudit({ actor: access.session, action: "user.note.added", entityType: "user", entityId: userId, request, metadata: { noteId: String(inserted.insertedId) } });
    return NextResponse.json({ ok: true, id: String(inserted.insertedId) }, { status: 201 });
  }

  if (body.action === "send-password-recovery") {
    const access = await requireAdminPermission("users.write");
    if (access.response) return access.response;
    const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "password-recovery-email", limit: 5 });
    if (limited) return limited;
    const { db, user } = await findAccount(userId);
    if (!user || typeof user.email !== "string") return NextResponse.json({ error: "A linked account email was not found." }, { status: 404 });
    const targetGrant = await db.collection("admin_access").findOne({ userId });
    if (targetGrant && !isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only a Super Admin may request recovery for administrative staff." }, { status: 403 });
    if (!transporter) return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "ChamaPulse password recovery",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Password recovery requested</h2><p>A ChamaPulse administrator asked us to send you to the secure password recovery flow.</p><p><a href="${siteUrl.replace(/\/$/, "")}/forgot-password">Continue to ChamaPulse sign in and choose “Forgot password?”</a></p><p>If you did not expect this message, contact ChamaPulse support.</p></div>`,
    });
    await writeAdminAudit({ actor: access.session, action: "user.password_recovery.requested", entityType: "user", entityId: userId, request });
    return NextResponse.json({ ok: true, message: "Recovery instructions were sent using the existing Clerk password recovery flow." });
  }

  if (body.action !== "suspend" && body.action !== "reactivate" && body.action !== "revoke-sessions") {
    return NextResponse.json({ error: "Unsupported user action." }, { status: 400 });
  }
  const permission = body.action === "revoke-sessions" ? "users.sessions.revoke" : "users.suspend";
  const access = await requireAdminPermission(permission);
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "user-account-action", limit: 10 });
  if (limited) return limited;
  if (access.session.user.id === userId) return NextResponse.json({ error: "Administrators cannot apply this action to their own account." }, { status: 400 });

  const { db, user } = await findAccount(userId);
  if (!user || typeof user.clerkId !== "string") return NextResponse.json({ error: "The linked authentication account was not found." }, { status: 404 });
  const targetGrant = await db.collection("admin_access").findOne({ userId });
  if (targetGrant && !isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only a Super Admin may apply account actions to administrative staff." }, { status: 403 });
  if (targetGrant?.role === "SUPER_ADMIN" && body.action !== "revoke-sessions") return NextResponse.json({ error: "A Super Admin account cannot be suspended here." }, { status: 403 });
  const client = await clerkClient();
  if (body.action === "revoke-sessions") {
    let offset = 0;
    let revoked = 0;
    let total = 0;
    do {
      const page = await client.sessions.getSessionList({ userId: user.clerkId, status: "active", limit: 100, offset });
      total = page.totalCount;
      for (let index = 0; index < page.data.length; index += 25) {
        const batch = page.data.slice(index, index + 25);
        await Promise.all(batch.map((session) => client.sessions.revokeSession(session.id)));
        revoked += batch.length;
      }
      offset += page.data.length;
      if (page.data.length === 0) break;
    } while (offset < total);
    await writeAdminAudit({ actor: access.session, action: "user.sessions.revoked", entityType: "user", entityId: userId, request, metadata: { revoked } });
    return NextResponse.json({ ok: true, revoked });
  }

  const reason = body.reason?.trim().slice(0, 500) ?? "";
  if (body.action === "suspend" && reason.length < 5) return NextResponse.json({ error: "Provide a suspension reason of at least five characters." }, { status: 400 });
  if (body.action === "suspend") await client.users.banUser(user.clerkId);
  else await client.users.unbanUser(user.clerkId);
  const nextStatus = body.action === "suspend" ? "suspended" : "active";
  await db.collection("user").updateOne({ id: userId }, { $set: { status: nextStatus, banned: body.action === "suspend", updatedAt: new Date() } });
  const actionName = body.action === "suspend" ? "user.suspended" : "user.reactivated";
  await writeAdminAudit({
    actor: access.session,
    action: actionName,
    entityType: "user",
    entityId: userId,
    request,
    before: { status: user.banned === true ? "suspended" : user.status ?? "registered" },
    after: { status: nextStatus },
    metadata: { reason },
  });
  return NextResponse.json({ ok: true, status: nextStatus });
}
