import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getAuthSession, syncAppUser } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { checkSameOrigin } from "@/lib/admin/access";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import { calculatePotAmount, normalizeFrequency } from "@/lib/chama-utils";

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const body = await request.json().catch(() => ({}));
  const {
    groupName,
    description,
    contributionAmount,
    frequency,
    numberOfMembers,
    startDate,
    currency,
  } = body as Record<string, string>;

  if (!groupName || !contributionAmount || !startDate) {
    return NextResponse.json(
      {
        error: "Group name, contribution amount, and start date are required.",
      },
      { status: 400 }
    );
  }

  try {
    const session = await getAuthSession(request.headers);
    if (!session?.user) return NextResponse.json({ error: "Sign in to finish moderator registration." }, { status: 401 });
    const createdUser = session.user;
    const appUserId = createdUser.id;
    await syncAppUser(createdUser, "moderator");

    await connectMongoose();

    const database = await connectToDatabase();
    const existingProfile = await database.collection("user").findOne({ id: appUserId }, { projection: { onboardingGroupId: 1 } });
    const existingGroupId = existingProfile?.onboardingGroupId;
    if (typeof existingGroupId === "string" && Types.ObjectId.isValid(existingGroupId)) {
      const existingGroup = await ChamaGroupModel.findById(existingGroupId);
      if (existingGroup) {
        let existingMember = await ChamaMemberModel.findOne({ groupId: existingGroup._id, userId: appUserId });
        if (!existingMember) {
          existingMember = await ChamaMemberModel.create({
            groupId: existingGroup._id,
            userId: appUserId,
            name: createdUser.name || createdUser.email.split("@")[0] || "Moderator",
            email: createdUser.email.toLowerCase(),
            role: "admin",
            status: "active",
            invitedBy: appUserId,
            joinedAt: new Date(),
          });
        }
        existingGroup.rotationOrder = [existingMember._id as Types.ObjectId];
        existingGroup.numberOfMembers = 1;
        existingGroup.currentRound = 1;
        await existingGroup.save();
        const existingRound = await ChamaRoundModel.findOne({ groupId: existingGroup._id, roundNumber: 1 });
        if (!existingRound) {
          await ChamaRoundModel.create({
            groupId: existingGroup._id,
            roundNumber: 1,
            recipientMemberId: existingMember._id,
            status: "open",
            potAmount: calculatePotAmount(existingGroup, 1),
            totalContributions: 0,
            dueDate: existingGroup.startDate,
            startedAt: existingGroup.startDate,
          });
        }
        return NextResponse.json({ groupId: existingGroupId, userId: appUserId, alreadyCreated: true });
      }
    }

    const group = await ChamaGroupModel.create({
      name: groupName.trim(),
      description: description?.trim() ?? "",
      contributionAmount: Number(contributionAmount),
      frequency: normalizeFrequency(frequency),
      numberOfMembers: Number(numberOfMembers) || 1,
      expectedMemberCount: Math.max(1, Number(numberOfMembers) || 1),
      startDate: new Date(startDate),
      currency: currency?.trim() || "KES",
      createdBy: appUserId,
      rotationType: "manual",
    });

    await database.collection("user").updateOne({ id: appUserId }, { $set: { onboardingGroupId: String(group._id), updatedAt: new Date() } });

    const member = await ChamaMemberModel.create({
      groupId: group._id,
      userId: appUserId,
      name: createdUser.name || createdUser.email.split("@")[0] || "Moderator",
      email: createdUser.email.toLowerCase(),
      role: "admin",
      status: "active",
      invitedBy: appUserId,
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

    return NextResponse.json(
      {
        groupId: String(group._id),
        userId: appUserId,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create moderator account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
