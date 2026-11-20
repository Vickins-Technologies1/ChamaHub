import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { escapeHtml, sendTransactionalEmail } from "@/lib/email";
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  checkSameOrigin,
  enforceAdminRateLimit,
  ensureAdminIndexes,
  isSuperAdmin,
  parsePageParams,
  requireAdminPermission,
  writeAdminAudit,
  type AdminPermission,
  type AdminRole,
} from "@/lib/admin/access";

export const dynamic = "force-dynamic";

function parseGrant(body: Record<string, unknown>) {
  const role = body.role;
  if (typeof role !== "string" || !ADMIN_ROLES.includes(role as AdminRole) || role === "SUPER_ADMIN") return null;
  const permissions = body.permissions;
  if (!Array.isArray(permissions) || permissions.some((permission) => typeof permission !== "string" || !ADMIN_PERMISSIONS.includes(permission as AdminPermission))) return null;
  let expiresAt: Date | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
    expiresAt = new Date(String(body.expiresAt));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return null;
  }
  return { role: role as Exclude<AdminRole, "SUPER_ADMIN">, permissions: permissions as AdminPermission[], expiresAt };
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("staff.read");
  if (access.response) return access.response;
  if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only a Super Admin can inspect administrative access grants." }, { status: 403 });
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "staff-access-read", limit: 60 });
  if (limited) return limited;
  const { page, pageSize, skip } = parsePageParams(new URL(request.url).searchParams);
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const search = new URL(request.url).searchParams.get("search")?.trim().slice(0, 120);
  const searchFilter = search ? { $or: [
    { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { userId: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
  ] } : {};
  const [total, grants, invitations] = await Promise.all([
    db.collection("admin_access").countDocuments({ $and: [{ role: { $ne: "SUPER_ADMIN" } }, searchFilter] }),
    db.collection("admin_access").find({ $and: [{ role: { $ne: "SUPER_ADMIN" } }, searchFilter] }, { projection: { userId: 1, email: 1, name: 1, role: 1, permissions: 1, status: 1, expiresAt: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
    db.collection("admin_access_invites").find({ ...(search ? { email: { $regex: search.replace(/[.*+?^$\u007b}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}) }, { projection: { inviteId: 1, email: 1, role: 1, permissions: 1, grantExpiresAt: 1, expiresAt: 1, createdAt: 1, status: 1, claimedAt: 1, revokedAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray(),
  ]);
  const staffIds = grants.map((grant) => String(grant.userId));
  const staffActivity = staffIds.length ? await db.collection("admin_audit").aggregate([
    { $match: { actorId: { $in: staffIds } } },
    { $sort: { occurredAt: -1 } },
    { $group: {
      _id: "$actorId",
      totalActions: { $sum: 1 },
      lastActivity: { $first: "$occurredAt" },
      usersManaged: { $sum: { $cond: [{ $and: [{ $eq: ["$entityType", "user"] }, { $ne: ["$action", "user.note.added"] }] }, 1, 0] } },
      groupsReviewed: { $sum: { $cond: [{ $eq: ["$action", "group.reviewed"] }, 1, 0] } },
      ticketsResolved: { $sum: { $cond: [{ $in: ["$action", ["support.ticket.resolved", "support.ticket.closed"]] }, 1, 0] } },
      suspensions: { $sum: { $cond: [{ $eq: ["$action", "user.suspended"] }, 1, 0] } },
    } },
  ]).toArray() : [];
  const activityById = new Map(staffActivity.map((entry) => [String(entry._id), entry]));
  return NextResponse.json({
    items: grants.map((grant) => ({ ...grant, status: grant.expiresAt instanceof Date && grant.expiresAt <= new Date() ? "expired" : grant.status, _id: String(grant._id), userId: String(grant.userId), metrics: activityById.get(String(grant.userId)) ?? { totalActions: 0, usersManaged: 0, groupsReviewed: 0, ticketsResolved: 0, suspensions: 0, lastActivity: null } })),
    invitations: invitations.map((invite) => ({ ...invite, status: invite.status === "pending" && invite.expiresAt instanceof Date && invite.expiresAt <= new Date() ? "expired" : invite.status, _id: String(invite._id) })),
    total, page, pageSize,
  });
}

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("staff.write");
  if (access.response) return access.response;
  if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only a Super Admin can change administrative access." }, { status: 403 });
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "staff-access", limit: 10 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const grants = db.collection("admin_access");

  if (action === "invite") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const grant = parseGrant(body);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !grant) return NextResponse.json({ error: "Provide a valid email, role, and permission list. Super Admin invitations require secure bootstrap." }, { status: 400 });
    const pendingInvite = await db.collection("admin_access_invites").findOne({ email, status: "pending", expiresAt: { $gt: new Date() } });
    if (pendingInvite) return NextResponse.json({ error: "A live invitation already exists for this email address." }, { status: 409 });
    const existingAccount = await db.collection("user").findOne({ email }, { projection: { id: 1 } });
    if (existingAccount) return NextResponse.json({ error: "This email already has an account. Use its account ID to grant access." }, { status: 409 });
    const inviteId = randomUUID();
    const inviteToken = randomBytes(32).toString("base64url");
    const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.collection("admin_access_invites").insertOne({ inviteId, inviteTokenHash, email, role: grant.role, permissions: grant.permissions, grantExpiresAt: grant.expiresAt, status: "pending", createdBy: access.session.user.id, createdAt: new Date(), expiresAt });
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const inviteUrl = `${siteUrl.replace(/\/$/, "")}/auth/admin-invite?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`;
      await sendTransactionalEmail({
        to: email,
        subject: "Your ChamaPulse administrator invitation",
        text: `You have been invited to ChamaPulse administrative access. Accept within seven days: ${inviteUrl}`,
        html: `<p>You have been invited to ChamaPulse administrative access.</p><p><a href="${escapeHtml(inviteUrl)}">Review and accept invitation</a></p><p>This single-use invitation expires in seven days.</p>`,
      });
    } catch (error) {
      await db.collection("admin_access_invites").updateOne({ inviteId, status: "pending" }, { $set: { status: "failed", failedAt: new Date() }, $unset: { inviteTokenHash: "" } });
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send the invitation." }, { status: 502 });
    }
    await writeAdminAudit({ actor: access.session, action: "staff.invited", entityType: "admin_invitation", entityId: inviteId, request, after: { email, role: grant.role, permissions: grant.permissions, expiresAt } });
    return NextResponse.json({ ok: true, inviteId, expiresAt }, { status: 201 });
  }

  if (action === "revoke-invitation") {
    const inviteId = typeof body.inviteId === "string" ? body.inviteId.trim() : "";
    if (!inviteId) return NextResponse.json({ error: "An invitation reference is required." }, { status: 400 });
    const invite = await db.collection("admin_access_invites").findOne({ inviteId, status: "pending" });
    if (!invite) return NextResponse.json({ error: "Pending invitation not found." }, { status: 404 });
    await db.collection("admin_access_invites").updateOne({ inviteId, status: "pending" }, { $set: { status: "revoked", revokedAt: new Date(), revokedBy: access.session.user.id } });
    await db.collection("admin_access_invites").updateOne({ inviteId, status: "revoked" }, { $unset: { inviteTokenHash: "" } });
    await writeAdminAudit({ actor: access.session, action: "staff.invitation.revoked", entityType: "admin_invitation", entityId: inviteId, request, before: { status: "pending" }, after: { status: "revoked" }, metadata: { email: invite.email } });
    return NextResponse.json({ ok: true });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "An existing ChamaPulse account ID is required." }, { status: 400 });
  if (userId === access.session.user.id) return NextResponse.json({ error: "You cannot change your own administrative access here." }, { status: 400 });
  const current = await grants.findOne({ userId });
  if (current?.role === "SUPER_ADMIN") return NextResponse.json({ error: "Super Admin grants are provisioned outside the app and cannot be changed here." }, { status: 403 });
  const target = await db.collection("user").findOne({ id: userId }, { projection: { id: 1, email: 1, name: 1 } });
  const identity = await db.collection<Record<string, unknown> & { _id: string }>("auth_user").findOne({ _id: userId }, { projection: { _id: 1 } });
  if (!target || !identity) return NextResponse.json({ error: "The account must be migrated to Better Auth before granting access." }, { status: 404 });
  const now = new Date();
  if (action === "grant" || action === "update") {
    const grant = parseGrant(body);
    if (!grant) return NextResponse.json({ error: "Provide a valid role, permission list, and optional future expiration." }, { status: 400 });
    const before = current ? { role: current.role, permissions: current.permissions, status: current.status, expiresAt: current.expiresAt } : null;
    const next = {
      userId, email: target.email ?? null, name: target.name ?? null,
      ...grant, status: "active", updatedAt: now, createdBy: access.session.user.id,
    };
    await grants.updateOne({ userId }, { $set: next, $setOnInsert: { createdAt: now } }, { upsert: true });
    await writeAdminAudit({ actor: access.session, action: current ? "staff.access.updated" : "staff.access.granted", entityType: "admin_access", entityId: userId, request, before, after: { role: grant.role, permissions: grant.permissions, status: "active", expiresAt: grant.expiresAt } });
    return NextResponse.json({ ok: true });
  }

  if (!["suspend", "activate", "revoke"].includes(String(action))) return NextResponse.json({ error: "Unsupported staff access action." }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Administrative grant not found." }, { status: 404 });
  const status = action === "suspend" ? "suspended" : action === "revoke" ? "revoked" : "active";
  await grants.updateOne({ userId, role: { $ne: "SUPER_ADMIN" } }, { $set: { status, updatedAt: now } });
  let revokedSessions = 0;
  if (action !== "activate") {
    const revoked = await db.collection("auth_session").deleteMany({ userId });
    revokedSessions = revoked.deletedCount;
  }
  const auditAction = action === "suspend" ? "staff.access.suspended" : action === "activate" ? "staff.access.activated" : "staff.access.revoked";
  await writeAdminAudit({ actor: access.session, action: auditAction, entityType: "admin_access", entityId: userId, request, before: { role: current.role, status: current.status }, after: { role: current.role, status } });
  return NextResponse.json({ ok: true, status, revokedSessions });
}
