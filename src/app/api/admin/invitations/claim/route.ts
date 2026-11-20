import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { getAppUserId, syncAppUser } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { checkSameOrigin, ensureAdminIndexes } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const identity = await currentUser();
  if (!identity) return NextResponse.json({ error: "Sign in with the invited account to continue." }, { status: 401 });
  const inviteId = identity.publicMetadata.chamapulseAdminInviteId;
  const primaryEmail = identity.emailAddresses.find((address) => address.id === identity.primaryEmailAddressId);
  if (typeof inviteId !== "string" || !primaryEmail || primaryEmail.verification?.status !== "verified") {
    return NextResponse.json({ error: "A verified invited email is required." }, { status: 403 });
  }

  const account = await syncAppUser(identity);
  const userId = getAppUserId(identity);
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const invites = db.collection("admin_access_invites");
  const invite = await invites.findOne({ inviteId, email: primaryEmail.emailAddress.toLowerCase() });
  if (!invite) return NextResponse.json({ error: "This administrative invitation is invalid." }, { status: 403 });
  if (invite.status === "claimed" && invite.claimedBy === userId) return NextResponse.json({ ok: true, role: invite.role, alreadyClaimed: true });
  if (invite.status !== "pending" || !(invite.expiresAt instanceof Date) || invite.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This administrative invitation has expired or was already used." }, { status: 410 });
  }
  const existing = await db.collection("admin_access").findOne({ userId });
  if (existing) return NextResponse.json({ error: "This account already has an administrative access grant." }, { status: 409 });

  const now = new Date();
  await db.collection("admin_access").insertOne({
    userId,
    clerkId: identity.id,
    email: primaryEmail.emailAddress.toLowerCase(),
    name: account.name,
    role: invite.role,
    permissions: invite.permissions,
    status: "active",
    expiresAt: invite.grantExpiresAt ?? null,
    createdBy: invite.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  const claimed = await invites.updateOne(
    { inviteId, status: "pending", email: primaryEmail.emailAddress.toLowerCase(), expiresAt: { $gt: now } },
    { $set: { status: "claimed", claimedBy: userId, claimedAt: now } },
  );
  if (claimed.modifiedCount !== 1) {
    await db.collection("admin_access").deleteOne({ userId, createdBy: invite.createdBy, createdAt: now });
    return NextResponse.json({ error: "This invitation has already been claimed." }, { status: 409 });
  }
  await db.collection("admin_audit").insertOne({
    actorId: "system-invitation",
    actorRole: "SYSTEM",
    action: "staff.invitation.claimed",
    entityType: "admin_access",
    entityId: userId,
    occurredAt: now,
    ipAddress: null,
    before: null,
    after: { role: invite.role, permissions: invite.permissions, status: "active" },
    metadata: { invitedBy: invite.createdBy, inviteId },
    impersonation: null,
  });
  return NextResponse.json({ ok: true, role: invite.role });
}
