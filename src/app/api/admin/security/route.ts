import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { buildSecurityAlertCandidates } from "@/lib/admin/security-policy";
import connectToDatabase from "@/lib/mongodb";
import { checkSameOrigin, enforceAdminRateLimit, isSuperAdmin, parsePageParams, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

async function raiseAlert(db: Awaited<ReturnType<typeof connectToDatabase>>, input: { fingerprint: string; type: string; severity: string; title: string; evidence: Record<string, unknown> }) {
  const now = new Date();
  await db.collection("admin_security_alerts").updateOne(
    { fingerprint: input.fingerprint },
    { $setOnInsert: { ...input, status: "open", createdAt: now }, $set: { lastSeenAt: now, updatedAt: now, evidence: input.evidence } },
    { upsert: true },
  );
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("security.read");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "security-center-read", limit: 10 });
  if (limited) return limited;
  const db = await connectToDatabase();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const [denied, rateLimits, permissionChanges, impersonationsToday, highActivity, sensitiveAudit, suspensions, recentImpersonations, grants] = await Promise.all([
    db.collection("admin_security_events").find({ kind: "privileged_access_denied", occurredAt: { $gte: dayAgo } }).sort({ occurredAt: -1 }).limit(2000).toArray(),
    db.collection("admin_security_events").find({ kind: "admin_rate_limit", occurredAt: { $gte: dayAgo } }).sort({ occurredAt: -1 }).limit(2000).toArray(),
    db.collection("admin_audit").find({ action: { $in: ["staff.access.updated", "staff.access.granted", "staff.access.revoked", "staff.access.suspended"] }, occurredAt: { $gte: hourAgo } }).sort({ occurredAt: -1 }).limit(1000).toArray(),
    db.collection("admin_impersonation_sessions").find({ startedAt: { $gte: dayAgo } }, { projection: { actorId: 1, actorName: 1, targetUserId: 1, targetName: 1, reason: 1, status: 1, startedAt: 1, expiresAt: 1, endedAt: 1 } }).sort({ startedAt: -1 }).limit(1000).toArray(),
    db.collection("admin_audit").aggregate([
      { $match: { occurredAt: { $gte: hourAgo } } },
      { $group: { _id: "$actorId", count: { $sum: 1 }, role: { $first: "$actorRole" } } },
      { $match: { count: { $gte: 50 } } },
    ]).toArray(),
    db.collection("admin_audit").find({ occurredAt: { $gte: dayAgo }, action: { $regex: "suspend|staff\\.access|impersonation|maintenance|feature_flag|session", $options: "i" } }, { projection: { actorId: 1, actorRole: 1, action: 1, entityType: 1, entityId: 1, occurredAt: 1, ipAddress: 1, metadata: 1 } }).sort({ occurredAt: -1 }).limit(100).toArray(),
    db.collection("user").find({ $or: [{ banned: true }, { status: "suspended" }] }, { projection: { id: 1, name: 1, email: 1, role: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(100).toArray(),
    db.collection("admin_impersonation_sessions").find({}, { projection: { actorId: 1, actorName: 1, targetUserId: 1, targetName: 1, reason: 1, status: 1, startedAt: 1, expiresAt: 1, endedAt: 1 } }).sort({ startedAt: -1 }).limit(100).toArray(),
    db.collection("admin_access").find({ status: "active", role: { $ne: "SUPER_ADMIN" } }, { projection: { userId: 1, name: 1, email: 1, role: 1 } }).limit(100).toArray(),
  ]);

  const candidates = buildSecurityAlertCandidates({
    denied: denied as unknown as Array<{ actorId?: unknown; ipAddress?: unknown; permission?: unknown }>,
    permissionChanges: permissionChanges as unknown as Array<{ actorId?: unknown }>,
    impersonations: impersonationsToday as unknown as Array<{ actorId?: unknown; targetUserId?: unknown }>,
    rateLimits: rateLimits as unknown as Array<{ actorId?: unknown; action?: unknown }>,
    highActivity: highActivity as unknown as Array<{ _id?: unknown; count?: unknown }>,
    hourKey: now.toISOString().slice(0, 13), dayKey: now.toISOString().slice(0, 10),
  });
  for (const candidate of candidates) await raiseAlert(db, candidate);

  const alertParams = parsePageParams(new URL(request.url).searchParams, 25);
  const [alertTotal, alerts, storedSessions] = await Promise.all([
    db.collection("admin_security_alerts").countDocuments({}),
    db.collection("admin_security_alerts").find({}).sort({ status: 1, createdAt: -1 }).skip(alertParams.skip).limit(alertParams.pageSize).toArray(),
    db.collection<Record<string, unknown> & { _id: string; userId: string }>("auth_session").find({ userId: { $in: grants.map((grant) => String(grant.userId)) }, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).limit(500).toArray(),
  ]);
  const grantByUserId = new Map(grants.map((grant) => [String(grant.userId), grant]));
  const sessions = storedSessions.map((session) => {
    const grant = grantByUserId.get(String(session.userId));
    return {
      id: String(session._id), userId: String(session.userId), name: grant?.name ?? grant?.email ?? "Staff",
      role: grant?.role ?? "STAFF", status: "active", createdAt: session.createdAt,
      lastActiveAt: session.updatedAt, expiresAt: session.expiresAt,
      latestActivity: { ipAddress: session.ipAddress ?? null, userAgent: session.userAgent ?? null },
    };
  });
  return NextResponse.json({
    checkedAt: now,
    events: {
      deniedPrivilegedAccess: denied.length,
      rateLimitEvents: rateLimits.length,
      permissionChanges: permissionChanges.length,
      sensitiveOperations: sensitiveAudit.map((item) => ({ ...item, id: String(item._id), _id: undefined })),
    },
    alerts: alerts.map((item) => ({ ...item, id: String(item._id), _id: undefined })),
    totalAlerts: alertTotal,
    suspendedAccounts: suspensions.map((item) => ({ ...item, _id: undefined })),
    impersonationSessions: recentImpersonations.map((item) => ({ ...item, id: String(item._id), _id: undefined, status: item.status === "active" && item.expiresAt <= now ? "expired" : item.status })),
    sessions,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("security.write");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "security-center", limit: 20 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = await connectToDatabase();
  if (body.action === "alert-status") {
    const id = typeof body.alertId === "string" && ObjectId.isValid(body.alertId) ? new ObjectId(body.alertId) : null;
    const status = typeof body.status === "string" ? body.status : "";
    if (!id || !["open", "investigating", "resolved"].includes(status)) return NextResponse.json({ error: "Provide a valid alert and investigation status." }, { status: 400 });
    const before = await db.collection("admin_security_alerts").findOne({ _id: id });
    if (!before) return NextResponse.json({ error: "Security alert not found." }, { status: 404 });
    await db.collection("admin_security_alerts").updateOne({ _id: id }, { $set: { status, investigatedBy: access.session.user.id, investigatedAt: new Date() } });
    await writeAdminAudit({ actor: access.session, action: "security.alert.status_changed", entityType: "security_alert", entityId: String(id), request, before: { status: before.status }, after: { status } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "revoke-session") {
    const targetUserId = typeof body.userId === "string" ? body.userId : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!targetUserId || !sessionId) return NextResponse.json({ error: "A staff account and session ID are required." }, { status: 400 });
    if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only the Super Admin can revoke an administrative session." }, { status: 403 });
    const grant = await db.collection("admin_access").findOne({ userId: targetUserId, status: "active", role: { $ne: "SUPER_ADMIN" } });
    if (!grant) return NextResponse.json({ error: "Administrative staff account not found." }, { status: 404 });
    const result = await db.collection<Record<string, unknown> & { _id: string; userId: string }>("auth_session").deleteOne({ _id: sessionId, userId: targetUserId, expiresAt: { $gt: new Date() } });
    if (result.deletedCount !== 1) return NextResponse.json({ error: "That session is not active for the selected staff account." }, { status: 404 });
    await writeAdminAudit({ actor: access.session, action: "staff.session.revoked", entityType: "admin_access", entityId: targetUserId, request, metadata: { sessionId } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported security action." }, { status: 400 });
}
