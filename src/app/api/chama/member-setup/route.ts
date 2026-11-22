import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { checkSameOrigin } from "@/lib/admin/access";
import { getAuth, getAuthSession } from "@/lib/auth-server";
import { hashMemberInvitationToken } from "@/lib/member-invitations";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import { connectMongoose } from "@/lib/mongoose";
import connectToDatabase from "@/lib/mongodb";

const invalidLinkMessage = "This setup link is invalid, expired, revoked, or already used. Ask your group moderator for a new link.";

function tokenFrom(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "your invited email address";
  const visible = name.length < 3 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

async function findInvitation(token: string) {
  await connectMongoose();
  const tokenHash = hashMemberInvitationToken(token);
  const selectFields = "+accountSetupTokenHash +accountSetupConsumedTokenHash +accountSetupAttemptId +accountSetupAttemptExpiresAt";
  const active = await ChamaMemberModel.findOne({ accountSetupTokenHash: tokenHash }).select(selectFields).lean();
  if (active) return active;
  return ChamaMemberModel.findOne({ accountSetupConsumedTokenHash: tokenHash }).select(selectFields).lean();
}

function unusableResponse(status: number, state: string) {
  const messages: Record<string, string> = {
    invalid: "This setup link is invalid. Ask your group moderator to send a new link.",
    expired: "This invitation has expired. Ask your group moderator to resend the setup link.",
    revoked: "This invitation was revoked. Ask your group moderator for a new link.",
    used: "This invitation has already been used. Sign in with your member account to continue.",
    verification_pending: "Your account setup is complete. Verify the invited email address using the link we sent before signing in.",
    unavailable: "This member invitation is no longer available. Contact your group moderator.",
    in_progress: "This invitation is already being used to set up an account. Check your email for verification.",
  };
  return NextResponse.json({ error: messages[state] ?? invalidLinkMessage, state }, { status });
}

async function inspectInvitation(request: NextRequest, token: string) {
  const member = await findInvitation(token);
  if (!member) return unusableResponse(404, "invalid");
  if (member.accountSetupStatus === "activation_pending_verification") return unusableResponse(410, "verification_pending");
  if (member.userId || member.accountSetupStatus === "account_activated") return unusableResponse(410, "used");
  if (member.accountSetupStatus === "invitation_revoked") return unusableResponse(410, "revoked");
  if (member.accountSetupStatus === "setup_started") {
    const attemptExpiresAt = member.accountSetupAttemptExpiresAt;
    if (attemptExpiresAt instanceof Date && attemptExpiresAt > new Date()) {
      return NextResponse.json({ error: "Account setup is already in progress. Check your email for the verification link.", state: "in_progress" }, { status: 409 });
    }
  }
  if (!(member.accountSetupExpiresAt instanceof Date) || member.accountSetupExpiresAt <= new Date()) {
    await ChamaMemberModel.updateOne(
      { _id: member._id, accountSetupTokenHash: hashMemberInvitationToken(token), accountSetupStatus: { $in: ["invitation_sent", "setup_started"] } },
      { $set: { accountSetupStatus: "invitation_expired" }, $unset: { accountSetupAttemptId: "", accountSetupAttemptExpiresAt: "", accountSetupAttemptStartedAt: "" } },
    );
    return unusableResponse(410, "expired");
  }
  if (!["invitation_sent", "setup_started"].includes(member.accountSetupStatus ?? "")) {
    return unusableResponse(410, "used");
  }
  const group = await ChamaGroupModel.findById(member.groupId).select("name").lean();
  if (!group || member.status === "rejected") return unusableResponse(410, "unavailable");
  const email = typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
  if (!email) return unusableResponse(410, "unavailable");
  const database = await connectToDatabase();
  const existingUser = await database.collection("auth_user").findOne(
    { email: { $regex: `^${escapedRegex(email)}$`, $options: "i" } },
    { projection: { _id: 1 } },
  );
  const session = await getAuthSession(request.headers);
  const canLinkExistingAccount = Boolean(
    session?.user?.emailVerified === true &&
    session.user.email?.trim().toLowerCase() === email &&
    (!member.userId || member.userId === session.user.id),
  );
  return NextResponse.json({
    memberName: typeof member.name === "string" ? member.name : "Member",
    groupName: group.name,
    emailHint: maskEmail(email),
    expiresAt: member.accountSetupExpiresAt,
    existingAccount: Boolean(existingUser),
    canLinkExistingAccount,
  }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function POST(request: NextRequest) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = tokenFrom(body.token);
  if (!token) return unusableResponse(404, "invalid");
  try {
    if (body.action === "inspect") return await inspectInvitation(request, token);
    const member = await findInvitation(token);
    if (!member) return unusableResponse(404, "invalid");
    const tokenHash = hashMemberInvitationToken(token);
    const now = new Date();
    if (member.accountSetupStatus === "activation_pending_verification") return unusableResponse(410, "verification_pending");
    if (member.userId || member.accountSetupStatus === "account_activated") return unusableResponse(410, "used");
    if (member.accountSetupStatus === "invitation_revoked") return unusableResponse(410, "revoked");
    if (!(member.accountSetupExpiresAt instanceof Date) || member.accountSetupExpiresAt <= now) {
      await ChamaMemberModel.updateOne({ _id: member._id, accountSetupTokenHash: tokenHash }, { $set: { accountSetupStatus: "invitation_expired" } });
      return unusableResponse(410, "expired");
    }
    if (member.status === "rejected") return unusableResponse(410, "unavailable");

    if (body.action === "link-existing-account") {
      const session = await getAuthSession(request.headers);
      const invitedEmail = typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
      if (!session?.user) return NextResponse.json({ error: "Sign in with the invited email address before linking this account." }, { status: 401 });
      if (session.user.emailVerified !== true || session.user.email?.trim().toLowerCase() !== invitedEmail) {
        return NextResponse.json({ error: "This invitation can only be linked from a verified account using the invited email address." }, { status: 403 });
      }
      if (member.userId && member.userId !== session.user.id) return unusableResponse(409, "used");
      const linked = await ChamaMemberModel.updateOne(
        {
          _id: member._id,
          groupId: member.groupId,
          accountSetupTokenHash: tokenHash,
          accountSetupStatus: { $in: ["invitation_sent", "setup_started"] },
          accountSetupExpiresAt: { $gt: now },
          $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }, { userId: session.user.id }],
        },
        { $set: { userId: session.user.id, accountSetupStatus: "account_activated", accountSetupConsumedTokenHash: tokenHash }, $unset: { accountSetupTokenHash: "", accountSetupAttemptId: "", accountSetupAttemptStartedAt: "", accountSetupAttemptExpiresAt: "" } },
      );
      if (linked.modifiedCount !== 1) {
        const latest = await ChamaMemberModel.findById(member._id).lean();
        if (latest?.userId !== session.user.id) return unusableResponse(409, "used");
      }
      return NextResponse.json({ ok: true, accountActivated: true, redirectTo: "/chama" });
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Choose a password between 12 and 128 characters." }, { status: 400 });
    }
    const email = typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "This member record does not have a valid email address. Ask the moderator to update it." }, { status: 409 });
    }
    const database = await connectToDatabase();
    const existingUser = await database.collection("auth_user").findOne(
      { email: { $regex: `^${escapedRegex(email)}$`, $options: "i" } },
      { projection: { _id: 1 } },
    );
    if (existingUser) {
      return NextResponse.json({ error: "A ChamaPulse account already uses this email. Sign in or reset its password, then open the invitation while signed in.", code: "ACCOUNT_EXISTS" }, { status: 409 });
    }

    const attemptId = randomUUID();
    const attemptExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const claimed = await ChamaMemberModel.updateOne(
      {
        _id: member._id,
        groupId: member.groupId,
        accountSetupTokenHash: tokenHash,
        accountSetupStatus: "invitation_sent",
        accountSetupExpiresAt: { $gt: now },
        $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
      },
      { $set: { accountSetupStatus: "setup_started", accountSetupAttemptId: attemptId, accountSetupAttemptStartedAt: now, accountSetupAttemptExpiresAt: attemptExpiresAt } },
    );
    if (claimed.modifiedCount !== 1) return unusableResponse(409, "in_progress");

    try {
      const auth = await getAuth();
      const created = await auth.api.signUpEmail({
        body: {
          name: typeof member.name === "string" && member.name.trim() ? member.name.trim() : email.split("@")[0],
          email,
          password,
          callbackURL: "/auth/continue?role=member",
        },
        headers: request.headers,
      });
      const activationStatus = created.user.emailVerified ? "account_activated" : "activation_pending_verification";
      const linked = await ChamaMemberModel.updateOne(
        {
          _id: member._id,
          groupId: member.groupId,
          accountSetupTokenHash: tokenHash,
          accountSetupStatus: "setup_started",
          accountSetupAttemptId: attemptId,
          $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
        },
        { $set: { userId: created.user.id, accountSetupStatus: activationStatus, accountSetupConsumedTokenHash: tokenHash }, $unset: { accountSetupTokenHash: "", accountSetupAttemptId: "", accountSetupAttemptStartedAt: "", accountSetupAttemptExpiresAt: "" } },
      );
      if (linked.modifiedCount !== 1) {
        const latest = await ChamaMemberModel.findById(member._id).lean();
        if (latest?.userId !== created.user.id) {
          return NextResponse.json({ error: "Your account was created, but the member record could not be linked. Contact your group moderator before trying again." }, { status: 503 });
        }
      }
      return NextResponse.json({
        ok: true,
        accountActivated: created.user.emailVerified,
        verificationRequired: !created.user.emailVerified,
        redirectTo: created.user.emailVerified ? "/chama" : null,
      }, { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const safeErrorMessage = errorMessage
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
        .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted value]")
        .replace(/\b(password|secret|token|authorization)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
        .slice(0, 400);
      console.error("Member account signup failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: safeErrorMessage,
      });

      const possibleUser = await database.collection<{ _id: string; emailVerified?: boolean; createdAt?: Date }>("auth_user").findOne(
        { email: { $regex: `^${escapedRegex(email)}$`, $options: "i" } },
        { projection: { _id: 1, emailVerified: 1, createdAt: 1 } },
      ).catch(() => null);
      if (possibleUser && possibleUser.createdAt instanceof Date && possibleUser.createdAt >= now) {
        await ChamaMemberModel.updateOne(
          { _id: member._id, accountSetupStatus: "setup_started", accountSetupAttemptId: attemptId, accountSetupTokenHash: tokenHash },
          { $set: { userId: possibleUser._id, accountSetupStatus: "activation_pending_verification", accountSetupConsumedTokenHash: tokenHash }, $unset: { accountSetupTokenHash: "", accountSetupAttemptId: "", accountSetupAttemptStartedAt: "", accountSetupAttemptExpiresAt: "" } },
        );
        return NextResponse.json({ ok: true, verificationRequired: true }, { status: 201 });
      }
      await ChamaMemberModel.updateOne(
        { _id: member._id, accountSetupStatus: "setup_started", accountSetupAttemptId: attemptId, accountSetupTokenHash: tokenHash },
        { $set: { accountSetupStatus: "invitation_sent" }, $unset: { accountSetupAttemptId: "", accountSetupAttemptStartedAt: "", accountSetupAttemptExpiresAt: "" } },
      );
      const message = error instanceof Error && /already exists|already registered|duplicate/i.test(error.message)
        ? "A ChamaPulse account already uses this email. Sign in or reset its password, then open the invitation while signed in."
        : "We couldn't finish account setup. The invitation is still available; please try again or contact your moderator.";
      return NextResponse.json({ error: message }, { status: /already exists|already registered|duplicate/i.test(error instanceof Error ? error.message : "") ? 409 : 502 });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Member setup")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unable to complete member account setup", error);
    return NextResponse.json({ error: "We couldn't finish account setup. Please try again." }, { status: 503 });
  }
}
