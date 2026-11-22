import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthSession, syncAppUser } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { checkSameOrigin, enforceUserRateLimit, ensureAdminIndexes } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const session = await getAuthSession(request.headers);
  if (!session?.user) return NextResponse.json({ error: "Sign in with the invited account to continue." }, { status: 401 });
  if (!session.user.emailVerified) return NextResponse.json({ error: "Verify your invited email before claiming this invitation." }, { status: 403 });
  const limited = await enforceUserRateLimit({ userId: session.user.id, request, action: "admin-invitation-claim", limit: 10 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as { token?: unknown; inviteId?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const inviteId = typeof body.inviteId === "string" && /^[0-9a-f-]{36}$/i.test(body.inviteId) ? body.inviteId : "";
  const validToken = token.length >= 32 && token.length <= 256;
  if (!validToken && !inviteId) return NextResponse.json({ error: "This administrative invitation is invalid." }, { status: 403 });

  const account = await syncAppUser(session.user);
  const userId = session.user.id;
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const invites = db.collection("admin_access_invites");
  const email = session.user.email.toLowerCase();
  const inviteIdHash = validToken ? createHash("sha256").update(token).digest("hex") : "";
  const invite = await invites.findOne(validToken ? { inviteTokenHash: inviteIdHash, email } : { inviteId, email });
  if (!invite) return NextResponse.json({ error: "This administrative invitation is invalid." }, { status: 403 });
  if (invite.status === "claimed" && invite.claimedBy === userId) return NextResponse.json({ ok: true, role: invite.role, alreadyClaimed: true });
  if (invite.status !== "pending" || !(invite.expiresAt instanceof Date) || invite.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This administrative invitation has expired or was already used." }, { status: 410 });
  }
  const existing = await db.collection("admin_access").findOne({ userId });
  if (existing) return NextResponse.json({ error: "This account already has an administrative access grant." }, { status: 409 });

  const now = new Date();
  const claimed = await invites.updateOne(
    { inviteId: invite.inviteId, ...(validToken ? { inviteTokenHash: inviteIdHash } : {}), status: "pending", email, expiresAt: { $gt: now } },
    { $set: { status: "claimed", claimedBy: userId, claimedAt: now }, $unset: { inviteTokenHash: "" } },
  );
  if (claimed.modifiedCount !== 1) return NextResponse.json({ error: "This invitation has already been claimed." }, { status: 409 });
  try {
    await db.collection("admin_access").insertOne({
      userId,
      email,
      name: account.name,
      role: invite.role,
      permissions: invite.permissions,
      status: "active",
      expiresAt: invite.grantExpiresAt ?? null,
      createdBy: invite.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    await invites.updateOne({ inviteId: invite.inviteId, status: "claimed", claimedBy: userId }, { $set: { status: "pending", inviteTokenHash: inviteIdHash }, $unset: { claimedBy: "", claimedAt: "" } });
    throw error;
  }
  await db.collection("admin_audit").insertOne({
    actorId: "system-invitation",
    actorRole: "SYSTEM",
    action: "staff.invitation.claimed",
    entityType: "admin_access",
    entityId: userId,
    occurredAt: now,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    before: null,
    after: { role: invite.role, permissions: invite.permissions, status: "active" },
    metadata: { invitedBy: invite.createdBy, inviteId: invite.inviteId },
    impersonation: null,
  });
  return NextResponse.json({ ok: true, role: invite.role });
}
