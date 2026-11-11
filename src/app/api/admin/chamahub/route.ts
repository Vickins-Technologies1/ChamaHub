import { NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import { getAuth } from "@/lib/auth";
import { getSessionUser, isSiteAdmin } from "@/lib/chama-access";
import transporter from "@/lib/nodemailer";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!isSiteAdmin(user)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

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

    const contributionStats = await ChamaContributionModel.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    const contributionTotals = contributionStats[0] ?? { totalAmount: 0, totalCount: 0 };

    const groups = await ChamaGroupModel.find().sort({ createdAt: -1 }).lean();
    const members = await ChamaMemberModel.find({ status: { $ne: "rejected" } }).lean();
    const openRoundList = await ChamaRoundModel.find({ status: "open" }).lean();

    const contributionsByGroup = await ChamaContributionModel.aggregate([
      {
        $group: {
          _id: "$groupId",
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
          lastPaidAt: { $max: "$paidAt" },
        },
      },
    ]);

    const contributionMap = contributionsByGroup.reduce<Record<string, (typeof contributionsByGroup)[number]>>(
      (acc, item) => {
        acc[String(item._id)] = item;
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
      const contributionSummary = contributionMap[groupId];

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
        totalCollected: contributionSummary?.totalAmount ?? 0,
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
        totalCollected: contributionTotals.totalAmount,
        totalContributions: contributionTotals.totalCount,
      },
      groups: groupRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load ChamaHub analytics." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!isSiteAdmin(user)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    await connectMongoose();

    const group = await ChamaGroupModel.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    if (action === "archive" || action === "activate") {
      group.status = action === "archive" ? "archived" : "active";
      await group.save();
      return NextResponse.json({ ok: true });
    }

    if (action === "force-join") {
      if (!email) {
        return NextResponse.json({ error: "Email is required to force-join." }, { status: 400 });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const auth = await getAuth();
      const context = await auth.$context;
      const adapter = context.internalAdapter as unknown as {
        listUsers: (
          limit?: number,
          offset?: number,
          sortBy?: { field: string; direction: "asc" | "desc" }
        ) => Promise<Array<{ id: string; email?: string | null }>>;
      };
      const users = await adapter.listUsers(500, 0, {
        field: "createdAt",
        direction: "desc",
      });
      const matchedUser = users.find((item) => item.email?.toLowerCase() === normalizedEmail);

      const existingMember = await ChamaMemberModel.findOne({
        groupId: group._id,
        email: normalizedEmail,
      });

      if (existingMember) {
        existingMember.userId = matchedUser?.id ?? existingMember.userId;
        existingMember.status = "active";
        await existingMember.save();
      } else {
        await ChamaMemberModel.create({
          groupId: group._id,
          email: normalizedEmail,
          role: "member",
          status: "active",
          userId: matchedUser?.id,
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

      return NextResponse.json({ ok: true });
    }

    if (action === "send-reminders") {
      const members = await ChamaMemberModel.find({
        groupId: group._id,
        status: { $ne: "rejected" },
        email: { $exists: true, $ne: "" },
        $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
      }).lean();

      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.BETTER_AUTH_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        "http://localhost:3000";

      const sendResults = await Promise.all(
        members.map(async (member) => {
          const recipient = member.email?.toLowerCase();
          if (!recipient) return false;
          const inviteLink = `${baseUrl}/member-signup?email=${encodeURIComponent(
            recipient
          )}&groupName=${encodeURIComponent(group.name ?? "ChamaHub group")}`;

          try {
            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: recipient,
              subject: `Reminder: join ${group.name ?? "your ChamaHub group"}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0b1220;">
                  <h2 style="margin: 0 0 12px;">ChamaHub reminder</h2>
                  <p>You’ve been invited to join <strong>${group.name ?? "a ChamaHub group"}</strong>.</p>
                  <p>Create your member account to view contributions, payments, and payout schedules.</p>
                  <p style="margin-top: 18px;">
                    <a href="${inviteLink}" style="background:#1b5cff;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600;">
                      Accept invite
                    </a>
                  </p>
                  <p style="font-size: 12px; color: #5a6882; margin-top: 16px;">
                    If the button doesn't work, copy and paste this link into your browser:
                    <br/>
                    ${inviteLink}
                  </p>
                </div>
              `,
            });
            return true;
          } catch {
            return false;
          }
        })
      );

      const sentCount = sendResults.filter(Boolean).length;
      return NextResponse.json({
        ok: true,
        message: `Sent ${sentCount} reminder${sentCount === 1 ? "" : "s"}.`,
      });
    }

    if (action === "make-moderator") {
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

      const auth = await getAuth();
      const context = await auth.$context;
      const adapter = context.internalAdapter as unknown as {
        listUsers: (
          limit?: number,
          offset?: number,
          sortBy?: { field: string; direction: "asc" | "desc" }
        ) => Promise<Array<{ id: string; email?: string | null; role?: string | null }>>;
        updateUser: (id: string, data: { role?: string | null }) => Promise<void>;
      };

      const users = await adapter.listUsers(500, 0, {
        field: "createdAt",
        direction: "desc",
      });
      const targetUser = users.find((item) => item.id === member.userId);
      const currentRole = targetUser?.role ?? "user";
      const roleList = currentRole
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!roleList.includes("moderator")) {
        roleList.push("moderator");
      }
      const nextRole = roleList.join(",");
      await adapter.updateUser(member.userId, { role: nextRole });

      member.role = "admin";
      member.status = "active";
      await member.save();
      group.createdBy = member.userId;
      await group.save();

      return NextResponse.json({ ok: true });
    }

    if (action === "revoke-moderator") {
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

      const auth = await getAuth();
      const context = await auth.$context;
      const adapter = context.internalAdapter as unknown as {
        listUsers: (
          limit?: number,
          offset?: number,
          sortBy?: { field: string; direction: "asc" | "desc" }
        ) => Promise<Array<{ id: string; email?: string | null; role?: string | null }>>;
        updateUser: (id: string, data: { role?: string | null }) => Promise<void>;
      };

      const users = await adapter.listUsers(500, 0, {
        field: "createdAt",
        direction: "desc",
      });
      const targetUser = users.find((item) => item.id === member.userId);
      const currentRole = targetUser?.role ?? "user";
      const roleList = currentRole
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value && value !== "moderator");
      if (roleList.length === 0) {
        roleList.push("member");
      }
      const nextRole = roleList.join(",");
      await adapter.updateUser(member.userId, { role: nextRole });

      member.role = "member";
      await member.save();

      if (group.createdBy === member.userId) {
        group.createdBy = user.id;
        await group.save();
      }

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

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to update ChamaHub group." },
      { status: 500 }
    );
  }
}
