import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import { calculatePotAmount, normalizeFrequency } from "@/lib/chama-utils";
import { getSessionUser, isModerator, isSiteAdmin, linkMemberToUser } from "@/lib/chama-access";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await linkMemberToUser(user);
    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    let groups = [];
    let memberRecords = [];

    if (isAdmin) {
      groups = await ChamaGroupModel.find().sort({ createdAt: -1 }).lean();
      memberRecords = await ChamaMemberModel.find({
        groupId: { $in: groups.map((group) => group._id) },
        status: { $ne: "rejected" },
      }).lean();
    } else {
      const orConditions: Record<string, unknown>[] = [{ userId: user.id }];
      if (user.email) {
        orConditions.push({ email: user.email.toLowerCase() });
      }
      memberRecords = await ChamaMemberModel.find({
        $or: orConditions,
        status: { $ne: "rejected" },
      }).lean();

      const groupIds = memberRecords.map((member) => member.groupId);
      groups = await ChamaGroupModel.find({ _id: { $in: groupIds } })
        .sort({ createdAt: -1 })
        .lean();
    }

    const groupIds = groups.map((group) => group._id);
    const rounds = await ChamaRoundModel.find({
      groupId: { $in: groupIds },
      status: "open",
    }).lean();

    const roundMap = rounds.reduce<Record<string, typeof rounds[number]>>((acc, round) => {
      acc[String(round.groupId)] = round;
      return acc;
    }, {});

    const groupSummaries = groups.map((group) => {
      const groupId = String(group._id);
      const members = memberRecords.filter(
        (member) => String(member.groupId) === groupId && member.status !== "rejected"
      );
      const activeCount = members.filter((member) => member.status === "active").length;
      const openRound = roundMap[groupId];
      return {
        id: groupId,
        name: group.name,
        description: group.description,
        contributionAmount: group.contributionAmount,
        frequency: group.frequency,
        currency: group.currency,
        startDate: group.startDate,
        status: group.status,
        rotationType: group.rotationType,
        currentRound: group.currentRound,
        potAmount: calculatePotAmount(group, activeCount),
        openRound: openRound
          ? {
              id: String(openRound._id),
              roundNumber: openRound.roundNumber,
              recipientMemberId: String(openRound.recipientMemberId),
              status: openRound.status,
              dueDate: openRound.dueDate,
              totalContributions: openRound.totalContributions,
            }
          : null,
        membership: members.find(
          (member) =>
            member.userId === user.id ||
            (user.email && member.email === user.email.toLowerCase())
        ) ?? null,
        membersCount: activeCount,
      };
    });

    return NextResponse.json({ groups: groupSummaries });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load groups." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const canCreate = isSiteAdmin(user) || isModerator(user);
    if (!canCreate) {
      return NextResponse.json(
        { error: "Only ChamaHub moderators can create groups." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      name,
      description,
      contributionAmount,
      frequency,
      numberOfMembers,
      startDate,
      currency,
      rotationType,
    } = body as Record<string, string>;

    if (!name || !contributionAmount || !startDate) {
      return NextResponse.json(
        { error: "Name, contribution amount, and start date are required." },
        { status: 400 }
      );
    }

    await connectMongoose();

    const group = await ChamaGroupModel.create({
      name: name.trim(),
      description: description?.trim() ?? "",
      contributionAmount: Number(contributionAmount),
      frequency: normalizeFrequency(frequency),
      numberOfMembers: Number(numberOfMembers) || 1,
      startDate: new Date(startDate),
      currency: currency?.trim() || "KES",
      createdBy: user.id,
      rotationType: rotationType === "random" ? "random" : "manual",
    });

    const member = await ChamaMemberModel.create({
      groupId: group._id,
      userId: user.id,
      name: user.name || user.email?.split("@")[0] || "Member",
      email: user.email?.toLowerCase(),
      role: "admin",
      status: "active",
      invitedBy: user.id,
      joinedAt: new Date(),
    });

    group.rotationOrder = [member._id as Types.ObjectId];
    group.numberOfMembers = 1;
    group.currentRound = 1;
    await group.save();

    await ChamaRoundModel.create({
      groupId: group._id,
      roundNumber: 1,
      recipientMemberId: member._id,
      status: "open",
      potAmount: calculatePotAmount(group, 1),
      totalContributions: 0,
      dueDate: new Date(startDate),
      startedAt: new Date(startDate),
    });

    return NextResponse.json({ groupId: String(group._id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to create group." }, { status: 500 });
  }
}
