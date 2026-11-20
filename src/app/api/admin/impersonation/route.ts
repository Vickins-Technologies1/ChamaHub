import { createHash, randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/chama-access";
import { hasRecentSecondFactor, impersonationTerminationQuery, impersonationTerminationUpdate, isImpersonationSessionLive, validateImpersonationTarget } from "@/lib/admin/impersonation-policy";
import connectToDatabase from "@/lib/mongodb";
import {
  canAccessPermission,
  checkSameOrigin,
  enforceAdminRateLimit,
  ensureAdminIndexes,
  getAdminGrantForUser,
  writeAdminAudit,
  type AdminSession,
} from "@/lib/admin/access";

export const dynamic = "force-dynamic";
const COOKIE_NAME = "chp_admin_impersonation";
const SESSION_MINUTES = 20;

async function currentAdmin() {
  const user = await getSessionUser();
  if (!user) return null;
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || !canAccessPermission(grant, "users.impersonate")) return null;
  return { user, grant } satisfies AdminSession;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const actor = await currentAdmin();
  if (!actor) return NextResponse.json({ error: "Impersonation permission is required." }, { status: 403 });

  const authState = await auth();
  const factors = authState.factorVerificationAge;
  if (!hasRecentSecondFactor(factors, 10 * 60)) {
    return NextResponse.json({ error: "Reauthenticate with your configured second factor within the last 10 minutes before impersonating an account." }, { status: 403 });
  }
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)?.value) return NextResponse.json({ error: "End the current troubleshooting session first." }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { targetUserId?: unknown; reason?: unknown };
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!targetUserId || reason.length < 10 || reason.length > 1000) {
    return NextResponse.json({ error: "Select another account and provide an investigation reason of 10 to 1,000 characters." }, { status: 400 });
  }

  const limited = await enforceAdminRateLimit({ userId: actor.user.id, request, action: "admin-impersonation", limit: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const target = await db.collection("user").findOne({ id: targetUserId }, {
    projection: { _id: 0, id: 1, clerkId: 1, name: 1, email: 1, role: 1, status: 1, banned: 1 },
  });
  if (!target || target.banned === true || target.status === "suspended") {
    return NextResponse.json({ error: "The target account was not found or is suspended." }, { status: 404 });
  }
  const targetGrant = await db.collection("admin_access").findOne({ userId: targetUserId });
  const denial = validateImpersonationTarget({
    actorId: actor.user.id,
    targetUserId,
    targetExists: Boolean(target),
    targetSuspended: target?.banned === true || target?.status === "suspended",
    targetAdminRole: typeof targetGrant?.role === "string" ? targetGrant.role : null,
    targetHasAdminGrant: Boolean(targetGrant),
    actorCanImpersonateStaff: canAccessPermission(actor.grant, "staff.impersonate"),
  });
  if (denial) return NextResponse.json({ error: denial.message }, { status: denial.status });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000);
  const token = randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const session = {
    _id: hash,
    actorId: actor.user.id,
    actorClerkId: actor.grant.clerkId,
    actorName: actor.user.name ?? actor.user.email ?? "Administrator",
    actorRole: actor.grant.role,
    targetUserId,
    targetName: typeof target.name === "string" && target.name ? target.name : "Unnamed account",
    targetEmail: typeof target.email === "string" ? target.email : null,
    targetRole: typeof target.role === "string" ? target.role : "member",
    reason,
    status: "active",
    startedAt: now,
    expiresAt,
    endedAt: null,
  };
  await db.collection<{ _id: string; [key: string]: unknown }>("admin_impersonation_sessions").insertOne(session);
  await writeAdminAudit({
    actor,
    action: "admin.impersonation.started",
    entityType: "user",
    entityId: targetUserId,
    request,
    after: { targetName: session.targetName, targetRole: session.targetRole, expiresAt },
    metadata: { reason, sessionId: hash.slice(0, 12) },
  });
  const response = NextResponse.json({ ok: true, startedAt: now, expiresAt });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
  return response;
}

export async function GET() {
  const actor = await currentAdmin();
  if (!actor) return NextResponse.json({ error: "Administrative impersonation access is required." }, { status: 403 });
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ active: false });
  const db = await connectToDatabase();
  const sessions = db.collection<{ _id: string; [key: string]: unknown }>("admin_impersonation_sessions");
  const session = await sessions.findOne({
    _id: tokenHash(token),
    actorId: actor.user.id,
    status: "active",
  });
  if (!session || !isImpersonationSessionLive({ actorId: session.actorId, status: session.status, expiresAt: session.expiresAt }, actor.user.id)) return NextResponse.json({ error: "The troubleshooting session has ended or expired." }, { status: 410 });

  const account = await db.collection("user").findOne({ id: session.targetUserId }, {
    projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, status: 1, banned: 1, createdAt: 1 },
  });
  if (!account || account.banned === true || account.status === "suspended") {
    await sessions.updateOne({ _id: session._id, status: "active" }, { $set: { status: "terminated", endedAt: new Date(), endReason: "target_unavailable" } });
    return NextResponse.json({ error: "The target account is no longer available." }, { status: 410 });
  }
  const memberQuery: Record<string, unknown>[] = [{ userId: session.targetUserId }];
  if (typeof account.email === "string" && account.email) memberQuery.push({ email: account.email.toLowerCase() });
  const members = await db.collection("chamamembers").find({ $or: memberQuery }, {
    projection: { groupId: 1, role: 1, status: 1, joinedAt: 1 },
  }).sort({ joinedAt: -1 }).limit(50).toArray();
  const groupIds = members.map((item) => item.groupId);
  const groups = groupIds.length ? await db.collection("chamagroups").find({ _id: { $in: groupIds } }, {
    projection: { name: 1, status: 1, currency: 1, contributionAmount: 1, frequency: 1 },
  }).toArray() : [];
  const groupMap = new Map(groups.map((group) => [String(group._id), group]));
  const transactions = canAccessPermission(actor.grant, "finance.read") && members.length
    ? await db.collection("chamafinancialtransactions").find({ memberId: { $in: members.map((item) => item._id) } }, {
      projection: { groupId: 1, type: 1, direction: 1, amountMinor: 1, legacyAmountMajor: 1, currency: 1, status: 1, reference: 1, transactionDate: 1 },
    }).sort({ transactionDate: -1, _id: -1 }).limit(25).toArray()
    : [];
  return NextResponse.json({
    active: true,
    session: {
      actorName: session.actorName,
      actorRole: session.actorRole,
      targetName: session.targetName,
      targetEmail: session.targetEmail,
      reason: session.reason,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      remainingSeconds: Math.max(0, Math.floor((new Date(String(session.expiresAt)).getTime() - Date.now()) / 1000)),
    },
    account: { id: account.id, name: account.name ?? "", email: account.email ?? "", role: account.role ?? "member", status: account.status ?? "registered", createdAt: account.createdAt ?? null },
    groups: members.map((item) => {
      const group = groupMap.get(String(item.groupId));
      return { id: String(item.groupId), name: group?.name ?? "Group", status: group?.status ?? "unknown", currency: group?.currency ?? "KES", contributionAmount: group?.contributionAmount ?? null, frequency: group?.frequency ?? null, memberRole: item.role ?? "member", memberStatus: item.status ?? "unknown", joinedAt: item.joinedAt ?? null };
    }),
    transactions: transactions.map((item) => ({ id: String(item._id), groupName: groupMap.get(String(item.groupId))?.name ?? "Group", type: item.type, direction: item.direction, amountMinor: item.amountMinor ?? null, legacyAmountMajor: item.legacyAmountMajor ?? null, currency: item.currency, status: item.status, reference: item.reference ?? "", transactionDate: item.transactionDate })),
    financialHistoryAvailable: canAccessPermission(actor.grant, "finance.read"),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const actor = await currentAdmin();
  if (!actor) return NextResponse.json({ error: "Administrative impersonation access is required." }, { status: 403 });
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: new Date(0) });
  if (!token) return response;
  const db = await connectToDatabase();
  const endedAt = new Date();
  const session = await db.collection<{ _id: string; [key: string]: unknown }>("admin_impersonation_sessions").findOneAndUpdate(
    impersonationTerminationQuery(tokenHash(token), actor.user.id),
    impersonationTerminationUpdate(endedAt),
    { returnDocument: "before" },
  );
  if (session) {
    await writeAdminAudit({
      actor,
      action: "admin.impersonation.ended",
      entityType: "user",
      entityId: String(session.targetUserId),
      request,
      metadata: { sessionId: String(session._id).slice(0, 12), targetUserId: String(session.targetUserId), reason: session.reason },
    });
  }
  return response;
}
