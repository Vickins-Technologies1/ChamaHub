import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import connectToDatabase from "@/lib/mongodb";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";
import ChamaGroupModel from "@/lib/models/chama-group";
import { fromMinorUnits } from "@/lib/finance/money";
import { getContributionStatus } from "@/lib/finance/ledger";
import { getMemberAccountSetupStatus, issueMemberSetupInvitation, MemberInvitationError } from "@/lib/member-invitations";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const members = await ChamaMemberModel.find({ groupId }).select("+accountSetupAttemptExpiresAt").lean();
    const openRound = (await ChamaRoundModel.findOne({
      groupId,
      status: "open",
    }).lean()) as {
      _id?: unknown;
      currencySnapshot?: string | null;
      memberObligations?: Array<{ memberId: unknown; amountMinor: number }>;
    } | null;

    const verifiedContributionMap: Record<string, number> = {};
    const pendingContributionMap: Record<string, number> = {};
    if (openRound) {
      const rows = await ChamaFinancialTransactionModel.aggregate([
        {
          $match: {
            groupId: new Types.ObjectId(groupId),
            roundId: new Types.ObjectId(String(openRound._id)),
            type: "contribution",
            status: { $in: ["verified", "pending_verification"] },
          },
        },
        { $group: { _id: { memberId: "$memberId", status: "$status" }, totalMinor: { $sum: "$amountMinor" } } },
      ]);
      for (const row of rows) {
        const target = row._id.status === "verified" ? verifiedContributionMap : pendingContributionMap;
        const key = String(row._id.memberId);
        target[key] = (target[key] ?? 0) + row.totalMinor;
      }
    }
    const obligations = new Map((openRound?.memberObligations ?? []).map((item) => [String(item.memberId), item.amountMinor]));

    return NextResponse.json({
      members: members.map((item) => ({
        id: String(item._id),
        userId: item.userId,
        name: item.name,
        email: item.email,
        phone: item.phone,
        role: item.role,
        status: item.status,
        joinedAt: item.joinedAt,
        accountSetupStatus: getMemberAccountSetupStatus(item),
        accountSetupExpiresAt: item.accountSetupExpiresAt ?? null,
        contributionTotal: openRound?.currencySnapshot
          ? fromMinorUnits(verifiedContributionMap[String(item._id)] ?? 0, openRound.currencySnapshot)
          : 0,
        verifiedContributionMinor: verifiedContributionMap[String(item._id)] ?? 0,
        pendingContributionMinor: pendingContributionMap[String(item._id)] ?? 0,
        expectedContributionMinor: obligations.get(String(item._id)) ?? 0,
        outstandingContributionMinor: Math.max(
          0,
          (obligations.get(String(item._id)) ?? 0) - (verifiedContributionMap[String(item._id)] ?? 0)
        ),
        contributionStatus: getContributionStatus(
          obligations.get(String(item._id)) ?? 0,
          verifiedContributionMap[String(item._id)] ?? 0,
          pendingContributionMap[String(item._id)] ?? 0
        ),
      })),
      openRoundId: openRound ? String(openRound._id) : null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load members." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId)) {
      return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(member, ["admin", "treasurer", "secretary"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const canAssignRoles = isAdmin || hasGroupRole(member, ["admin"]);

    const body = await request.json().catch(() => ({}));
    const { name, email, phone, role } = body as Record<string, string>;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (role && role !== "member" && !canAssignRoles) {
      return NextResponse.json({ error: "Only a group administrator can assign elevated roles." }, { status: 403 });
    }

    if (!normalizedEmail) {
      return NextResponse.json(
        { error: "A valid email address is required for secure member account setup." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address for the member." }, { status: 400 });
    }

    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingMember = await ChamaMemberModel.findOne({
      groupId,
      email: { $regex: `^${escapedEmail}$`, $options: "i" },
      status: { $ne: "rejected" },
    }).lean();
    if (existingMember) {
      try {
        const invitation = await issueMemberSetupInvitation({ groupId, memberId: String(existingMember._id), invitedBy: user.id });
        return NextResponse.json({
          memberId: String(existingMember._id),
          duplicate: true,
          accountSetupStatus: invitation.status,
          setupLink: invitation.setupLink,
          delivery: invitation.delivery,
          alreadySent: invitation.alreadySent,
        }, { status: 200 });
      } catch (error) {
        if (error instanceof MemberInvitationError) return NextResponse.json({ error: error.message, memberId: String(existingMember._id) }, { status: error.statusCode });
        throw error;
      }
    }

    const database = await connectToDatabase();
    const memberEmailLocks = database.collection<{ _id: string; memberId: string; leaseExpiresAt?: Date }>("chama_member_email_keys");
    const emailKey = createHash("sha256").update(`${groupId}:${normalizedEmail}`).digest("hex");
    const newMemberId = new Types.ObjectId();
    const lockNow = new Date();
    const lockExpiresAt = new Date(lockNow.getTime() + 2 * 60 * 1000);
    try {
      await memberEmailLocks.insertOne({ _id: emailKey, memberId: String(newMemberId), leaseExpiresAt: lockExpiresAt });
    } catch {
      const lock = await memberEmailLocks.findOne({ _id: emailKey });
      const concurrentlyCreated = lock?.memberId
        ? await ChamaMemberModel.findOne({ _id: lock.memberId, groupId }).lean()
        : null;
      if (concurrentlyCreated) {
        if (concurrentlyCreated.status === "rejected") return NextResponse.json({ error: "This member was previously rejected and cannot be re-added as a duplicate record." }, { status: 409 });
        try {
          const invitation = await issueMemberSetupInvitation({ groupId, memberId: String(concurrentlyCreated._id), invitedBy: user.id });
          return NextResponse.json({ memberId: String(concurrentlyCreated._id), duplicate: true, accountSetupStatus: invitation.status, setupLink: invitation.setupLink, delivery: invitation.delivery, alreadySent: invitation.alreadySent }, { status: 200 });
        } catch (error) {
          if (error instanceof MemberInvitationError) return NextResponse.json({ error: error.message, memberId: String(concurrentlyCreated._id) }, { status: error.statusCode });
          throw error;
        }
      }
      if (lock && lock.leaseExpiresAt instanceof Date && lock.leaseExpiresAt > lockNow) {
        return NextResponse.json({ error: "A member record for this email is already being added. Refresh the member list in a moment." }, { status: 409 });
      }
      const staleLockFilter: Record<string, unknown> = { _id: emailKey };
      if (lock?.memberId) staleLockFilter.memberId = lock.memberId;
      if (lock?.leaseExpiresAt instanceof Date) staleLockFilter.leaseExpiresAt = lock.leaseExpiresAt;
      else staleLockFilter.leaseExpiresAt = { $exists: false };
      const reclaimed = await memberEmailLocks.updateOne(staleLockFilter, {
        $set: { memberId: String(newMemberId), leaseExpiresAt: lockExpiresAt },
      });
      if (reclaimed.modifiedCount !== 1) return NextResponse.json({ error: "A member record for this email is already being added. Refresh the member list in a moment." }, { status: 409 });
    }

    let newMember;
    try {
      newMember = await ChamaMemberModel.create({
      _id: newMemberId,
      groupId,
      name: name?.trim() || (email ? email.split("@")[0] : "Member"),
      email: normalizedEmail,
      phone: phone?.trim(),
      role: role && ["admin", "treasurer", "secretary", "member"].includes(role)
        ? role
        : "member",
      status: "pending",
      invitedBy: user.id,
    });
    } catch (error) {
      await memberEmailLocks.deleteOne({ _id: emailKey, memberId: String(newMemberId) });
      const duplicateMember = await ChamaMemberModel.findOne({ groupId, email: { $regex: `^${escapedEmail}$`, $options: "i" }, status: { $ne: "rejected" } }).lean();
      if (duplicateMember) {
        try {
          const invitation = await issueMemberSetupInvitation({ groupId, memberId: String(duplicateMember._id), invitedBy: user.id });
          return NextResponse.json({ memberId: String(duplicateMember._id), duplicate: true, accountSetupStatus: invitation.status, setupLink: invitation.setupLink, delivery: invitation.delivery, alreadySent: invitation.alreadySent }, { status: 200 });
        } catch (inviteError) {
          if (inviteError instanceof MemberInvitationError) return NextResponse.json({ error: inviteError.message, memberId: String(duplicateMember._id) }, { status: inviteError.statusCode });
        }
      }
      throw error;
    }
    await memberEmailLocks.updateOne({ _id: emailKey, memberId: String(newMemberId) }, { $unset: { leaseExpiresAt: "" } });

    const activeCount = await ChamaMemberModel.countDocuments({
      groupId,
      status: "active",
    });
    await ChamaGroupModel.updateOne(
      { _id: groupId },
      { $set: { numberOfMembers: activeCount } }
    );

    let invitation;
    try {
      invitation = await issueMemberSetupInvitation({ groupId, memberId: String(newMember._id), invitedBy: user.id });
    } catch (error) {
      if (error instanceof MemberInvitationError) {
        return NextResponse.json({ memberId: String(newMember._id), error: error.message }, { status: error.statusCode });
      }
      throw error;
    }
    return NextResponse.json({
      memberId: String(newMember._id),
      accountSetupStatus: invitation.status,
      setupLink: invitation.setupLink,
      delivery: invitation.delivery,
      alreadySent: invitation.alreadySent,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to add member." }, { status: 500 });
  }
}
