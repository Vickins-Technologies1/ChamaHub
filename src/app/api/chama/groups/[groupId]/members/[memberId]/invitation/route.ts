import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMemberModel from "@/lib/models/chama-member";
import { getSessionUser, getGroupMember, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";
import { getMemberAccountSetupStatus, issueMemberSetupInvitation, MemberInvitationError } from "@/lib/member-invitations";
import { checkSameOrigin } from "@/lib/admin/access";

type Params = { params: Promise<{ groupId: string; memberId: string }> };

async function authorize(request: NextRequest, groupId: string, memberId: string) {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(memberId)) {
    return { response: NextResponse.json({ error: "Invalid id." }, { status: 400 }) };
  }
  await connectMongoose();
  const siteAdmin = isSiteAdmin(user);
  const requester = await getGroupMember(groupId, user);
  if (!siteAdmin && !hasGroupRole(requester, ["admin", "treasurer", "secretary"])) {
    return { response: NextResponse.json({ error: "Access denied." }, { status: 403 }) };
  }
  const member = await ChamaMemberModel.findOne({ _id: memberId, groupId }).lean();
  if (!member) return { response: NextResponse.json({ error: "Member not found in this group." }, { status: 404 }) };
  return { user, member };
}

export async function POST(request: NextRequest, { params }: Params) {
  const { groupId, memberId } = await params;
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await authorize(request, groupId, memberId);
  if ("response" in access) return access.response;
  const result = await request.json().catch(() => ({})) as { action?: unknown };
  if (result.action !== "resend") return NextResponse.json({ error: "Choose the resend invitation action." }, { status: 400 });
  try {
    const invitation = await issueMemberSetupInvitation({ groupId, memberId, invitedBy: access.user.id, resend: true });
    return NextResponse.json(invitation, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MemberInvitationError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Unable to resend member invitation", error);
    return NextResponse.json({ error: "Unable to resend the member setup link." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { groupId, memberId } = await params;
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await authorize(request, groupId, memberId);
  if ("response" in access) return access.response;
  const currentStatus = getMemberAccountSetupStatus(access.member);
  if (currentStatus === "account_activated") return NextResponse.json({ error: "This member account is already activated." }, { status: 409 });
  if (currentStatus !== "invitation_sent") return NextResponse.json({ error: "There is no live invitation to revoke." }, { status: 409 });
  const result = await ChamaMemberModel.updateOne(
    {
      _id: memberId,
      groupId,
      accountSetupStatus: "invitation_sent",
      accountSetupExpiresAt: { $gt: new Date() },
      accountSetupTokenHash: { $type: "string" },
      $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
    },
    { $set: { accountSetupStatus: "invitation_revoked", accountSetupRevokedAt: new Date() } },
  );
  if (result.modifiedCount !== 1) return NextResponse.json({ error: "The invitation changed before it could be revoked. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ ok: true, status: "invitation_revoked" });
}
