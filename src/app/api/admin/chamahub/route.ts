import { NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import { updateAppUserRole } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import {
  checkSameOrigin,
  enforceAdminRateLimit,
  isSuperAdmin,
  requireAdminPermission,
  writeAdminAudit,
} from "@/lib/admin/access";
import { fromMinorUnits } from "@/lib/finance/money";
import { issueMemberSetupInvitation } from "@/lib/member-invitations";

export async function GET() {
  try {
    const access = await requireAdminPermission("groups.read");
    if (access.response) return access.response;

    await connectMongoose();

    const [totalGroups, activeGroups, totalMembers, activeMembers, openRounds] =
      await Promise.all([
        ChamaGroupModel.countDocuments(),
        ChamaGroupModel.countDocuments({ status: "active" }),
        ChamaMemberModel.countDocuments({ status: { $ne: "rejected" } }),
        ChamaMemberModel.countDocuments({ status: "active" }),
        ChamaRoundModel.countDocuments({ status: "open" }),
      ]);

    const now = new Date();
    const inSevenDays = new Date();
    inSevenDays.setDate(now.getDate() + 7);

    const upcomingPayouts = await ChamaRoundModel.countDocuments({
      status: "open",
      dueDate: { $gte: now, $lte: inSevenDays },
    });

    const contributionStats = await ChamaFinancialTransactionModel.aggregate([
      { $match: { type: "contribution", status: "verified", amountMinor: { $type: "number" } } },
      {
        $group: {
          _id: "$currency",
          totalAmountMinor: { $sum: "$amountMinor" },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    const verifiedContributionCount = contributionStats.reduce((sum, item) => sum + item.totalCount, 0);

    const groups = await ChamaGroupModel.find().sort({ createdAt: -1 }).lean();
    const members = await ChamaMemberModel.find({ status: { $ne: "rejected" } }).lean();
    const openRoundList = await ChamaRoundModel.find({ status: "open" }).lean();

    const contributionsByGroup = await ChamaFinancialTransactionModel.aggregate([
      { $match: { type: "contribution", status: "verified", amountMinor: { $type: "number" } } },
      {
        $group: {
          _id: { groupId: "$groupId", currency: "$currency" },
          totalAmountMinor: { $sum: "$amountMinor" },
          totalCount: { $sum: 1 },
          lastPaidAt: { $max: "$transactionDate" },
        },
      },
    ]);

    const contributionMap = contributionsByGroup.reduce<Record<string, (typeof contributionsByGroup)[number]>>(
      (acc, item) => {
        acc[`${String(item._id.groupId)}:${item._id.currency}`] = item;
        return acc;
      },
      {}
    );

    const membersByGroup = members.reduce<Record<string, typeof members>>((acc, member) => {
      const key = String(member.groupId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(member);
      return acc;
    }, {});

    const openRoundMap = openRoundList.reduce<Record<string, typeof openRoundList[number]>>(
      (acc, round) => {
        acc[String(round.groupId)] = round;
        return acc;
      },
      {}
    );

    const groupRows = groups.map((group) => {
      const groupId = String(group._id);
      const groupMembers = membersByGroup[groupId] ?? [];
      const activeCount = groupMembers.filter((member) => member.status === "active").length;
      const openRound = openRoundMap[groupId];
      const contributionSummary = contributionMap[`${groupId}:${group.currency}`];

      return {
        id: groupId,
        name: group.name,
        frequency: group.frequency,
        contributionAmount: group.contributionAmount,
        currency: group.currency,
        status: group.status,
        createdAt: group.createdAt,
        createdBy: group.createdBy,
        membersCount: groupMembers.length,
        activeMembers: activeCount,
        members: groupMembers.map((member) => ({
          id: String(member._id),
          userId: member.userId ?? null,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
        })),
        openRound: openRound
          ? {
              roundNumber: openRound.roundNumber,
              dueDate: openRound.dueDate,
              potAmount: openRound.potAmount,
            }
          : null,
        totalCollected: contributionSummary ? fromMinorUnits(contributionSummary.totalAmountMinor, group.currency) : 0,
        contributionsCount: contributionSummary?.totalCount ?? 0,
        lastContributionAt: contributionSummary?.lastPaidAt ?? null,
      };
    });

    return NextResponse.json({
      metrics: {
        totalGroups,
        activeGroups,
        totalMembers,
        activeMembers,
        openRounds,
        upcomingPayouts,
        totalVerifiedContributionEntries: verifiedContributionCount,
        verifiedContributionsByCurrency: contributionStats.map((item) => ({ currency: item._id, amountMinor: item.totalAmountMinor, count: item.totalCount })),
        totalCollected: null,
        totalContributions: verifiedContributionCount,
      },
      groups: groupRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load ChamaPulse analytics." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("groups.write");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "legacy-group-admin", limit: 20 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const { action, groupId, memberId, email } = body as {
    action?:
      | "archive"
      | "activate"
      | "transfer"
      | "force-join"
      | "make-moderator"
      | "revoke-moderator"
      | "send-reminders";
    groupId?: string;
    memberId?: string;
    email?: string;
  };

  if (!action || !groupId) {
    return NextResponse.json(
      { error: "Action and groupId are required." },
      { status: 400 }
    );
  }

  try {
    const user = access.session.user;

    await connectMongoose();

    const group = await ChamaGroupModel.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    if (action === "archive" || action === "activate") {
      const previousStatus = group.status;
      group.status = action === "archive" ? "archived" : "active";
      await group.save();
      await writeAdminAudit({ actor: access.session, action: `group.${action === "archive" ? "archived" : "activated"}`, entityType: "group", entityId: String(group._id), request, before: { status: previousStatus }, after: { status: group.status } });
      return NextResponse.json({ ok: true });
    }

    if (action === "force-join") {
      if (!email) {
        return NextResponse.json({ error: "Email is required to force-join." }, { status: 400 });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const database = await connectToDatabase();
      const matchedUser = await database.collection("user").findOne({ email: normalizedEmail }, { projection: { id: 1 } });

      const existingMember = await ChamaMemberModel.findOne({
        groupId: group._id,
        email: normalizedEmail,
      });

      if (existingMember) {
        existingMember.userId = matchedUser ? String(matchedUser.id) : existingMember.userId;
        existingMember.status = "active";
        await existingMember.save();
      } else {
        await ChamaMemberModel.create({
          groupId: group._id,
          email: normalizedEmail,
          role: "member",
          status: "active",
          userId: matchedUser ? String(matchedUser.id) : undefined,
          invitedBy: user.id,
          joinedAt: matchedUser ? new Date() : undefined,
        });
      }

      const activeCount = await ChamaMemberModel.countDocuments({
        groupId: group._id,
        status: { $ne: "rejected" },
      });
      await ChamaGroupModel.updateOne(
        { _id: group._id },
        { $set: { numberOfMembers: activeCount } }
      );

      await writeAdminAudit({ actor: access.session, action: "group.member.force_joined", entityType: "group", entityId: String(group._id), request, metadata: { email: normalizedEmail, memberId: existingMember ? String(existingMember._id) : null } });

      return NextResponse.json({ ok: true });
    }

    if (action === "send-reminders") {
      const members = await ChamaMemberModel.find({
        groupId: group._id,
        status: { $ne: "rejected" },
        email: { $exists: true, $ne: "" },
        $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
      }).lean();

      const sendResults = await Promise.all(
        members.map(async (member) => {
          try {
            const result = await issueMemberSetupInvitation({
              groupId: String(group._id),
              memberId: String(member._id),
              invitedBy: access.session.user.id,
              resend: true,
            });
            return result.delivery === "sent";
          } catch (error) {
            console.error("Unable to send ChamaHub member account reminder", error);
            return false;
          }
        })
      );

      const sentCount = sendResults.filter(Boolean).length;
      await writeAdminAudit({ actor: access.session, action: "group.invite_reminders.sent", entityType: "group", entityId: String(group._id), request, metadata: { sentCount, attemptedCount: members.length } });
      return NextResponse.json({
        ok: true,
        message: `Sent ${sentCount} reminder${sentCount === 1 ? "" : "s"}.`,
      });
    }

    if (action === "make-moderator") {
      if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only a Super Admin can grant moderator access." }, { status: 403 });
      if (!memberId) {
        return NextResponse.json(
          { error: "memberId is required to promote a moderator." },
          { status: 400 }
        );
      }

      const member = await ChamaMemberModel.findById(memberId);
      if (!member || String(member.groupId) !== String(group._id)) {
        return NextResponse.json({ error: "Member not found in this group." }, { status: 404 });
      }

      if (!member.userId) {
        return NextResponse.json(
          { error: "Member must have a linked account to become moderator." },
          { status: 400 }
        );
      }

      const database = await connectToDatabase();
      const targetUser = await database.collection("user").findOne({ id: member.userId }, { projection: { role: 1 } });
      if (!targetUser) return NextResponse.json({ error: "Linked account was not found." }, { status: 404 });
      const currentRole = typeof targetUser.role === "string" ? targetUser.role : "member";
      const roleList = currentRole
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!roleList.includes("moderator")) {
        roleList.push("moderator");
      }
      const nextRole = roleList.join(",");
      const updated = await updateAppUserRole(member.userId, nextRole);
      if (!updated) return NextResponse.json({ error: "Linked account could not be updated." }, { status: 404 });

      member.role = "admin";
      member.status = "active";
      await member.save();
      group.createdBy = member.userId;
      await group.save();

      await writeAdminAudit({ actor: access.session, action: "group.moderator.promoted", entityType: "group", entityId: String(group._id), request, before: { userId: member.userId, platformRole: currentRole, groupRole: "member" }, after: { userId: member.userId, platformRole: nextRole, groupRole: member.role } });

      return NextResponse.json({ ok: true });
    }

    if (action === "revoke-moderator") {
      if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only a Super Admin can revoke moderator access." }, { status: 403 });
      if (!memberId) {
        return NextResponse.json(
          { error: "memberId is required to revoke a moderator." },
          { status: 400 }
        );
      }

      const member = await ChamaMemberModel.findById(memberId);
      if (!member || String(member.groupId) !== String(group._id)) {
        return NextResponse.json({ error: "Member not found in this group." }, { status: 404 });
      }

      if (!member.userId) {
        return NextResponse.json(
          { error: "Member must have a linked account to revoke moderator." },
          { status: 400 }
        );
      }

      const database = await connectToDatabase();
      const targetUser = await database.collection("user").findOne({ id: member.userId }, { projection: { role: 1 } });
      if (!targetUser) return NextResponse.json({ error: "Linked account was not found." }, { status: 404 });
      const currentRole = typeof targetUser.role === "string" ? targetUser.role : "member";
      const roleList = currentRole
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value && value !== "moderator");
      if (roleList.length === 0) {
        roleList.push("member");
      }
      const nextRole = roleList.join(",");
      const updated = await updateAppUserRole(member.userId, nextRole);
      if (!updated) return NextResponse.json({ error: "Linked account could not be updated." }, { status: 404 });

      member.role = "member";
      await member.save();

      if (group.createdBy === member.userId) {
        group.createdBy = user.id;
        await group.save();
      }

      await writeAdminAudit({ actor: access.session, action: "group.moderator.revoked", entityType: "group", entityId: String(group._id), request, before: { userId: member.userId, platformRole: currentRole, groupRole: "admin" }, after: { userId: member.userId, platformRole: nextRole, groupRole: member.role } });

      return NextResponse.json({
        ok: true,
        message: "Moderator access revoked. Group ownership moved to admin.",
      });
    }

    if (action === "transfer") {
      if (!memberId) {
        return NextResponse.json(
          { error: "memberId is required to transfer ownership." },
          { status: 400 }
        );
      }

      const member = await ChamaMemberModel.findById(memberId);
      if (!member || String(member.groupId) !== String(group._id)) {
        return NextResponse.json({ error: "Member not found in this group." }, { status: 404 });
      }

      if (!member.userId) {
        return NextResponse.json(
          { error: "Member must have a linked account to become moderator." },
          { status: 400 }
        );
      }

      const previousOwnerId = group.createdBy;
      group.createdBy = member.userId;
      await group.save();

      await ChamaMemberModel.updateMany(
        { groupId: group._id, role: "admin" },
        { $set: { role: "member" } }
      );
      await ChamaMemberModel.updateOne(
        { _id: member._id },
        { $set: { role: "admin", status: "active" } }
      );

      await writeAdminAudit({ actor: access.session, action: "group.owner.transferred", entityType: "group", entityId: String(group._id), request, before: { ownerId: previousOwnerId }, after: { ownerId: group.createdBy, memberId: String(member._id) } });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to update ChamaPulse group." },
      { status: 500 }
    );
  }
}
