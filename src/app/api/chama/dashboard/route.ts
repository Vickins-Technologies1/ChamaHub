import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import { getSessionUser, linkMemberToUser } from "@/lib/chama-access";
import { calculatePotAmount } from "@/lib/chama-utils";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await linkMemberToUser(user);
    await connectMongoose();

    const orConditions: Record<string, unknown>[] = [{ userId: user.id }];
    if (user.email) {
      orConditions.push({ email: user.email.toLowerCase() });
    }

    const members = await ChamaMemberModel.find({
      $or: orConditions,
      status: { $ne: "rejected" },
    }).lean();

    const groupIds = members.map((member) => member.groupId);
    const groups = await ChamaGroupModel.find({ _id: { $in: groupIds } }).lean();
    const rounds = await ChamaRoundModel.find({
      groupId: { $in: groupIds },
      status: "open",
    }).lean();

    const memberIdSet = new Set(members.map((member) => String(member._id)));
    const roundIds = rounds.map((round) => round._id);
    const contributions = await ChamaContributionModel.find({
      roundId: { $in: roundIds },
      memberId: { $in: Array.from(memberIdSet).map((id) => new Types.ObjectId(id)) },
    }).lean();

    const contributionMap = contributions.reduce<Record<string, number>>((acc, item) => {
      acc[`${String(item.roundId)}:${String(item.memberId)}`] = item.amount;
      return acc;
    }, {});

    let nextContribution: { dueDate: Date; groupName: string } | null = null;
    let nextPayout: { dueDate: Date; groupName: string } | null = null;

    const groupSummaries = groups.map((group) => {
      const groupId = String(group._id);
      const openRound = rounds.find((round) => String(round.groupId) === groupId);
      const groupMembers = members.filter((member) => String(member.groupId) === groupId);
      const activeCount = groupMembers.filter((member) => member.status === "active").length;
      const myMember = groupMembers.find(
        (member) =>
          member.userId === user.id ||
          (user.email && member.email === user.email.toLowerCase())
      );
      const contributed =
        openRound && myMember
          ? Boolean(contributionMap[`${String(openRound._id)}:${String(myMember._id)}`])
          : false;

      if (openRound && myMember && !contributed) {
        if (!nextContribution || (openRound.dueDate && openRound.dueDate < nextContribution.dueDate)) {
          nextContribution = {
            dueDate: openRound.dueDate || new Date(),
            groupName: group.name,
          };
        }
      }

      if (
        openRound &&
        myMember &&
        String(openRound.recipientMemberId) === String(myMember._id) &&
        !openRound.receivedAt
      ) {
        if (!nextPayout || (openRound.dueDate && openRound.dueDate < nextPayout.dueDate)) {
          nextPayout = {
            dueDate: openRound.dueDate || new Date(),
            groupName: group.name,
          };
        }
      }

      return {
        id: groupId,
        name: group.name,
        contributionAmount: group.contributionAmount,
        frequency: group.frequency,
        currency: group.currency,
        role: myMember?.role ?? "member",
        status: myMember?.status ?? "pending",
        openRound: openRound
          ? {
              id: String(openRound._id),
              roundNumber: openRound.roundNumber,
              recipientMemberId: String(openRound.recipientMemberId),
              dueDate: openRound.dueDate,
              totalContributions: openRound.totalContributions,
              potAmount: calculatePotAmount(group, activeCount),
            }
          : null,
      };
    });

    return NextResponse.json({
      summary: {
        activeGroups: groupSummaries.length,
        nextContribution,
        nextPayout,
      },
      groups: groupSummaries,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load dashboard." }, { status: 500 });
  }
}
