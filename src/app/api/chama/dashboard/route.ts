import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import { getSessionUser, linkMemberToUser } from "@/lib/chama-access";
import { fromMinorUnits } from "@/lib/finance/money";
import { getContributionStatus, getOutstandingMinor } from "@/lib/finance/ledger";

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
      status: "active",
    }).lean();

    const groupIds = members.map((member) => member.groupId);
    const groups = await ChamaGroupModel.find({ _id: { $in: groupIds }, status: "active" }).lean();
    const rounds = await ChamaRoundModel.find({
      groupId: { $in: groupIds },
      status: "open",
    }).lean();

    const memberIdSet = new Set(members.map((member) => String(member._id)));
    const roundIds = rounds.map((round) => round._id);
    const contributions = await ChamaFinancialTransactionModel.find({
      roundId: { $in: roundIds },
      memberId: { $in: Array.from(memberIdSet).map((id) => new Types.ObjectId(id)) },
      type: "contribution",
      status: { $in: ["verified", "pending_verification"] },
    }).lean();

    const recentContributions = groupIds.length
      ? await ChamaFinancialTransactionModel.find({ groupId: { $in: groupIds } })
          .sort({ transactionDate: -1, createdAt: -1 })
          .limit(8)
          .lean()
      : [];
    const recentPayouts = groupIds.length && members.length
      ? await ChamaFinancialTransactionModel.find({
          groupId: { $in: groupIds },
          memberId: { $in: members.map((member) => member._id) },
          type: "payout",
          legacy: false,
        }).sort({ transactionDate: -1, createdAt: -1 }).limit(6).lean()
      : [];
    const allActivityMemberIds = [...recentContributions, ...recentPayouts].map((item) => item.memberId).filter(Boolean);
    const recentMemberIds = [...new Set(allActivityMemberIds.map(String))].map((id) => new Types.ObjectId(id));
    const recentMembers = recentMemberIds.length
      ? await ChamaMemberModel.find({ _id: { $in: recentMemberIds }, groupId: { $in: groupIds } }).lean()
      : [];
    const recentMemberMap = new Map(recentMembers.map((member) => [String(member._id), member]));
    const groupMap = new Map(groups.map((group) => [String(group._id), group]));

    const contributionMap = contributions.reduce<Record<string, { verifiedMinor: number; pendingMinor: number }>>((acc, item) => {
      const key = `${String(item.roundId)}:${String(item.memberId)}`;
      acc[key] ??= { verifiedMinor: 0, pendingMinor: 0 };
      if (item.status === "verified") acc[key].verifiedMinor += item.amountMinor ?? 0;
      else acc[key].pendingMinor += item.amountMinor ?? 0;
      return acc;
    }, {});
    const payouts = rounds.length
      ? await ChamaFinancialTransactionModel.find({
          roundId: { $in: rounds.map((round) => round._id) },
          type: "payout",
          legacy: false,
        }).lean()
      : [];
    const payoutMap = new Map(payouts.map((item) => [String(item.roundId), item]));
    const verifiedRoundTotals = rounds.length
      ? await ChamaFinancialTransactionModel.aggregate([
          {
            $match: {
              roundId: { $in: rounds.map((round) => round._id) },
              type: "contribution",
              status: "verified",
            },
          },
          { $group: { _id: "$roundId", totalMinor: { $sum: "$amountMinor" } } },
        ])
      : [];
    const verifiedRoundMap = new Map(verifiedRoundTotals.map((item) => [String(item._id), item.totalMinor as number]));

    let nextContribution: { dueDate: Date; groupName: string } | null = null;
    let nextPayout: { dueDate: Date; groupName: string } | null = null;

    const groupSummaries = groups.map((group) => {
      const groupId = String(group._id);
      const openRound = rounds.find((round) => String(round.groupId) === groupId);
      const groupMembers = members.filter((member) => String(member.groupId) === groupId);
      const myMember = groupMembers.find(
        (member) =>
          member.userId === user.id ||
          (user.email && member.email === user.email.toLowerCase())
      );
      const obligation = openRound?.memberObligations?.find((item) => String(item.memberId) === String(myMember?._id));
      const payment = openRound && myMember
        ? contributionMap[`${String(openRound._id)}:${String(myMember._id)}`] ?? { verifiedMinor: 0, pendingMinor: 0 }
        : { verifiedMinor: 0, pendingMinor: 0 };
      const outstandingMinor = obligation ? getOutstandingMinor(obligation.amountMinor, payment.verifiedMinor) : 0;

      if (openRound && myMember && obligation && outstandingMinor > 0) {
        if (!nextContribution || (openRound.dueDate && openRound.dueDate < nextContribution.dueDate)) {
          nextContribution = {
            dueDate: openRound.dueDate || new Date(),
            groupName: group.name,
          };
        }
      }

      const payout = openRound ? payoutMap.get(String(openRound._id)) : null;
      if (
        openRound &&
        myMember &&
        String(openRound.recipientMemberId) === String(myMember._id) &&
        payout?.status !== "confirmed"
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
              totalVerifiedContributionsMinor: verifiedRoundMap.get(String(openRound._id)) ?? 0,
              potAmount: openRound.potAmount,
              currency: openRound.currencySnapshot,
              expectedTotalMinor: openRound.expectedTotalMinor,
              snapshotStatus: openRound.snapshotStatus,
              payoutStatus: payout?.status ?? null,
              myFinancials: obligation ? {
                expectedMinor: obligation.amountMinor,
                verifiedMinor: payment.verifiedMinor,
                pendingMinor: payment.pendingMinor,
                outstandingMinor,
                status: getContributionStatus(obligation.amountMinor, payment.verifiedMinor, payment.pendingMinor),
              } : null,
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
      activity: recentContributions.map((item) => {
        const member = recentMemberMap.get(String(item.memberId));
        const group = groupMap.get(String(item.groupId));
        return {
          id: String(item._id),
          groupId: String(item.groupId),
          groupName: group?.name ?? "Group",
          memberName: member?.name || member?.email || "Member",
          currency: item.currency ?? group?.currency ?? "KES",
          status: item.status,
          paidAt: item.transactionDate,
          type: item.type,
          direction: item.direction,
          amountMinor: item.amountMinor,
          amount: item.amountMinor != null
            ? fromMinorUnits(item.amountMinor, item.currency)
            : item.legacyAmountMajor ?? null,
          recordedBy: item.recordedBy,
          reference: item.reference,
        };
      }),
      payouts: recentPayouts.map((item) => {
        const member = recentMemberMap.get(String(item.memberId));
        const group = groupMap.get(String(item.groupId));
        return {
          id: String(item._id),
          groupId: String(item.groupId),
          groupName: group?.name ?? "Group",
          memberName: member?.name || member?.email || "Member",
          amountMinor: item.amountMinor,
          currency: item.currency,
          status: item.status,
          paidAt: item.transactionDate,
          reference: item.reference,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load dashboard." }, { status: 500 });
  }
}
