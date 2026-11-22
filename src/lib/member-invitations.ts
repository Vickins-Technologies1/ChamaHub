import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import { escapeHtml, sendTransactionalEmail } from "@/lib/email";

export const MEMBER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MEMBER_SETUP_ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type MemberAccountSetupStatus =
  | "not_invited"
  | "invitation_sent"
  | "invitation_expired"
  | "invitation_revoked"
  | "setup_in_progress"
  | "activation_pending"
  | "account_activated";

type InvitationStatusRecord = {
  userId?: unknown;
  accountSetupStatus?: string | null;
  accountSetupExpiresAt?: unknown;
  accountSetupAttemptExpiresAt?: unknown;
};

export function hashMemberInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getMemberAccountSetupStatus(
  record: InvitationStatusRecord,
  now = new Date(),
): MemberAccountSetupStatus {
  if (record.accountSetupStatus === "activation_pending_verification") return "activation_pending";
  if (record.accountSetupStatus === "account_activated" || record.userId) return "account_activated";
  if (record.accountSetupStatus === "invitation_revoked") return "invitation_revoked";
  if (record.accountSetupStatus === "invitation_expired") return "invitation_expired";
  if (record.accountSetupStatus === "setup_started") {
    const attemptExpiresAt = record.accountSetupAttemptExpiresAt instanceof Date
      ? record.accountSetupAttemptExpiresAt
      : typeof record.accountSetupAttemptExpiresAt === "string"
        ? new Date(record.accountSetupAttemptExpiresAt)
        : null;
    if (attemptExpiresAt && Number.isFinite(attemptExpiresAt.getTime()) && attemptExpiresAt > now) return "setup_in_progress";
  }
  if (record.accountSetupStatus === "invitation_sent" || record.accountSetupStatus === "setup_started") {
    const expiresAt = record.accountSetupExpiresAt instanceof Date
      ? record.accountSetupExpiresAt
      : typeof record.accountSetupExpiresAt === "string"
        ? new Date(record.accountSetupExpiresAt)
        : null;
    return expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt > now
      ? "invitation_sent"
      : "invitation_expired";
  }
  return "not_invited";
}

export function memberAccountSetupStatusLabel(status: MemberAccountSetupStatus) {
  const labels: Record<MemberAccountSetupStatus, string> = {
    not_invited: "Not invited",
    invitation_sent: "Invitation sent",
    invitation_expired: "Invitation expired",
    invitation_revoked: "Invitation revoked",
    setup_in_progress: "Account setup in progress",
    activation_pending: "Email verification pending",
    account_activated: "Account activated",
  };
  return labels[status];
}

export function getPublicSiteUrl() {
  const configured = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const siteUrl = configured || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && !siteUrl.startsWith("https://")) {
    throw new Error("A public HTTPS site URL must be configured before sending member setup invitations.");
  }
  return siteUrl.replace(/\/$/, "");
}

export type IssuedMemberInvitation = {
  memberId: string;
  status: MemberAccountSetupStatus;
  expiresAt: Date | null;
  setupLink: string | null;
  delivery: "sent" | "failed" | "not_needed";
  alreadySent?: boolean;
};

export class MemberInvitationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "MemberInvitationError";
  }
}

function invitationCasFilter(
  member: { _id: unknown; groupId: unknown; accountSetupStatus?: string | null; accountSetupInvitationId?: string | null },
) {
  const filter: Record<string, unknown> = { _id: member._id, groupId: member.groupId };
  filter.accountSetupStatus = member.accountSetupStatus ? member.accountSetupStatus : { $in: [null] };
  filter.accountSetupInvitationId = member.accountSetupInvitationId ? member.accountSetupInvitationId : { $in: [null] };
  return filter;
}

export async function issueMemberSetupInvitation(input: {
  groupId: string;
  memberId: string;
  invitedBy: string;
  resend?: boolean;
}): Promise<IssuedMemberInvitation> {
  if (!Types.ObjectId.isValid(input.groupId) || !Types.ObjectId.isValid(input.memberId)) {
    throw new MemberInvitationError("Member or group not found.", 404);
  }
  await connectMongoose();
  let member = await ChamaMemberModel.findOne({ _id: input.memberId, groupId: input.groupId })
    .select("+accountSetupTokenHash +accountSetupAttemptId +accountSetupAttemptStartedAt +accountSetupAttemptExpiresAt")
    .lean();
  if (!member) throw new MemberInvitationError("Member not found in this group.", 404);
  if (member.accountSetupStatus === "activation_pending_verification") {
    return { memberId: String(member._id), status: "activation_pending", expiresAt: null, setupLink: null, delivery: "not_needed" };
  }
  if (member.userId) {
    return {
      memberId: String(member._id), status: "account_activated", expiresAt: null,
      setupLink: null, delivery: "not_needed",
    };
  }

  const now = new Date();
  let status = getMemberAccountSetupStatus(member, now);
  if (member.accountSetupStatus === "setup_started") {
    if (member.accountSetupAttemptExpiresAt instanceof Date && member.accountSetupAttemptExpiresAt > now) {
      throw new MemberInvitationError("Account setup is already in progress. Ask the member to check their email before sending another invitation.", 409);
    }
    const nextStatus = member.accountSetupExpiresAt instanceof Date && member.accountSetupExpiresAt > now
      ? "invitation_sent"
      : "invitation_expired";
    await ChamaMemberModel.updateOne(
      { _id: member._id, accountSetupStatus: "setup_started", accountSetupAttemptId: member.accountSetupAttemptId },
      { $set: { accountSetupStatus: nextStatus }, $unset: { accountSetupAttemptId: "", accountSetupAttemptStartedAt: "", accountSetupAttemptExpiresAt: "" } },
    );
    member = await ChamaMemberModel.findOne({ _id: member._id, groupId: input.groupId })
      .select("+accountSetupTokenHash +accountSetupAttemptId +accountSetupAttemptStartedAt +accountSetupAttemptExpiresAt")
      .lean();
    if (!member) throw new MemberInvitationError("Member not found in this group.", 404);
    status = getMemberAccountSetupStatus(member, now);
  }
  if (status === "invitation_sent" && !input.resend) {
    return {
      memberId: String(member._id), status, expiresAt: member.accountSetupExpiresAt ?? null,
      setupLink: null, delivery: "not_needed", alreadySent: true,
    };
  }

  const siteUrl = getPublicSiteUrl();

  const email = typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new MemberInvitationError("Add a valid email address to this member record before sending an account setup link.", 400);
  }
  if (member.status === "rejected") {
    throw new MemberInvitationError("A rejected member cannot receive an account setup invitation.", 409);
  }

  if (status === "invitation_sent" && input.resend) {
    // Resending deliberately replaces the live token, so an older link can no longer be used.
  } else if (status === "invitation_expired" && member.accountSetupStatus === "invitation_sent") {
    await ChamaMemberModel.updateOne(
      { _id: member._id, accountSetupInvitationId: member.accountSetupInvitationId, accountSetupExpiresAt: { $lte: now } },
      { $set: { accountSetupStatus: "invitation_expired" } },
    );
    member = await ChamaMemberModel.findOne({ _id: member._id, groupId: input.groupId })
      .select("+accountSetupTokenHash +accountSetupAttemptId")
      .lean();
    if (!member) throw new MemberInvitationError("Member not found in this group.", 404);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashMemberInvitationToken(token);
  const invitationId = randomUUID();
  const expiresAt = new Date(now.getTime() + MEMBER_INVITATION_TTL_MS);
  const update = await ChamaMemberModel.updateOne(
    invitationCasFilter(member),
    {
      $set: {
        accountSetupStatus: "invitation_sent",
        accountSetupInvitationId: invitationId,
        accountSetupTokenHash: tokenHash,
        accountSetupExpiresAt: expiresAt,
        accountSetupSentAt: now,
        invitedBy: input.invitedBy,
      },
      $unset: { accountSetupAttemptId: "", accountSetupAttemptStartedAt: "", accountSetupAttemptExpiresAt: "", accountSetupRevokedAt: "" },
    },
  );
  if (update.modifiedCount !== 1) {
    const current = await ChamaMemberModel.findById(member._id).lean();
    if (current?.userId) return { memberId: String(member._id), status: "account_activated", expiresAt: null, setupLink: null, delivery: "not_needed" };
    if (current && getMemberAccountSetupStatus(current, now) === "invitation_sent") {
      return { memberId: String(member._id), status: "invitation_sent", expiresAt: current.accountSetupExpiresAt ?? null, setupLink: null, delivery: "not_needed", alreadySent: true };
    }
    throw new MemberInvitationError("This member's invitation changed. Refresh the member list and try again.", 409);
  }

  const setupLink = `${siteUrl}/member-setup#token=${encodeURIComponent(token)}`;
  const group = await ChamaGroupModel.findById(input.groupId).select("name").lean();
  const groupName = typeof group?.name === "string" ? group.name : "your Chama group";
  const memberName = typeof member.name === "string" && member.name.trim() ? member.name.trim() : "member";
  let delivery: IssuedMemberInvitation["delivery"] = "sent";
  try {
    const safeLink = escapeHtml(setupLink);
    const safeGroupName = escapeHtml(groupName);
    await sendTransactionalEmail({
      to: email,
      subject: `Set up your ChamaPulse account for ${groupName}`,
      text: `Hello ${memberName},\n\nYour moderator invited you to set up your ChamaPulse account for ${groupName}. Open this secure link within seven days: ${setupLink}\n\nYou will create your own password. The link can only be used once. If you did not expect this invitation, contact your group moderator.`,
      html: `<p>Hello ${escapeHtml(memberName)},</p><p>Your moderator invited you to set up your ChamaPulse account for <strong>${safeGroupName}</strong>.</p><p><a href="${safeLink}">Set up your account</a></p><p>This secure link expires in seven days and can only be used once. You will create your own password. If you did not expect this invitation, contact your group moderator.</p>`,
    });
  } catch (error) {
    delivery = "failed";
    console.error("Unable to send member account setup invitation", error);
  }
  return { memberId: String(member._id), status: "invitation_sent", expiresAt, setupLink, delivery };
}
