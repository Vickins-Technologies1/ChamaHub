import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { randomUUID } from "node:crypto";
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
  let releaseLease: (() => Promise<void>) | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const groupName = typeof input.groupName === "string" ? input.groupName.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const contributionAmount = Number(input.contributionAmount);
    const startDate = typeof input.startDate === "string" ? new Date(input.startDate) : new Date(Number.NaN);
    const numberOfMembers = Number(input.numberOfMembers);
    const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "KES";
    if (!groupName || groupName.length > 120) return NextResponse.json({ error: "Enter a group name up to 120 characters." }, { status: 400 });
    if (!Number.isFinite(contributionAmount) || contributionAmount < 1) return NextResponse.json({ error: "Enter a contribution amount of at least 1." }, { status: 400 });
    if (Number.isNaN(startDate.getTime())) return NextResponse.json({ error: "Enter a valid group start date." }, { status: 400 });
    if (description.length > 500) return NextResponse.json({ error: "Keep the group description under 500 characters." }, { status: 400 });
    if (Number.isFinite(numberOfMembers) && (numberOfMembers < 1 || numberOfMembers > 10000)) return NextResponse.json({ error: "Expected members must be between 1 and 10,000." }, { status: 400 });
    if (!["KES", "USD", "UGX", "TZS"].includes(currency)) return NextResponse.json({ error: "Choose a supported group currency." }, { status: 400 });

    const session = await getAuthSession(request.headers);
    if (!session?.user) return NextResponse.json({ error: "Sign in to finish moderator registration." }, { status: 401 });
    if (session.user.emailVerified !== true) return NextResponse.json({ error: "Verify your email before finishing account setup." }, { status: 403 });
    const createdUser = session.user;
    const appUserId = createdUser.id;
    await syncAppUser(createdUser);

    await connectMongoose();

    const database = await connectToDatabase();
    const profiles = database.collection("user");
    const existingProfile = await profiles.findOne({ id: appUserId }, { projection: { onboardingGroupId: 1, onboardingClaimedAt: 1 } });
    const existingGroupId = existingProfile?.onboardingGroupId;
    const previousClaim = existingProfile?.onboardingClaimedAt;
    const previousClaimDate = previousClaim instanceof Date ? previousClaim : null;
    if (previousClaimDate && Date.now() - previousClaimDate.getTime() < 10 * 60 * 1000) {
      return NextResponse.json({ error: "Group setup is already in progress. Wait a moment, then try again." }, { status: 409 });
    }

    const reusableGroupId = typeof existingGroupId === "string" && Types.ObjectId.isValid(existingGroupId) ? existingGroupId : null;
    const groupId = reusableGroupId ? new Types.ObjectId(reusableGroupId) : new Types.ObjectId();
    const claimToken = randomUUID();
    const claimFilter: Record<string, unknown> = { id: appUserId };
    if (previousClaim !== undefined) claimFilter.onboardingClaimedAt = previousClaim;
    else claimFilter.onboardingClaimedAt = { $exists: false };
    if (existingGroupId !== undefined) claimFilter.onboardingGroupId = existingGroupId;
    else claimFilter.onboardingGroupId = { $exists: false };
    const claimedAt = new Date();
    const claimResult = await profiles.updateOne(claimFilter, {
      $set: {
        onboardingGroupId: String(groupId),
        onboardingClaimedAt: claimedAt,
        onboardingClaimToken: claimToken,
        updatedAt: claimedAt,
      },
    });
    if (claimResult.modifiedCount !== 1) {
      return NextResponse.json({ error: "Group setup is already in progress. Wait a moment, then try again." }, { status: 409 });
    }
    releaseLease = async () => {
      await profiles.updateOne({ id: appUserId, onboardingClaimToken: claimToken }, { $unset: { onboardingClaimedAt: "", onboardingClaimToken: "" }, $set: { updatedAt: new Date() } });
    };

    const existingGroup = await ChamaGroupModel.findById(groupId);
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
      await syncAppUser(createdUser, "moderator");
      return NextResponse.json({ groupId: String(groupId), userId: appUserId, alreadyCreated: true });
    }

    const expectedMemberCount = Number.isFinite(numberOfMembers) ? numberOfMembers : 1;
    const group = new ChamaGroupModel({
      _id: groupId,
      name: groupName,
      description,
      contributionAmount,
      frequency: normalizeFrequency(typeof input.frequency === "string" ? input.frequency : undefined),
      numberOfMembers: expectedMemberCount,
      expectedMemberCount: Math.max(1, expectedMemberCount),
      startDate,
      currency,
      createdBy: appUserId,
      rotationType: "manual",
    });

    // Keep the claimed group ID so retries can finish this same group.
    await group.save();

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
      dueDate: startDate,
      startedAt: startDate,
    });

    await syncAppUser(createdUser, "moderator");
    return NextResponse.json(
      {
        groupId: String(group._id),
        userId: appUserId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unable to complete moderator account setup", error);
    return NextResponse.json({ error: "We couldn't finish setting up your account. Please try again." }, { status: 500 });
  } finally {
    if (releaseLease) {
      try {
        await releaseLease();
      } catch (error) {
        console.error("Unable to release moderator setup claim", error);
      }
    }
  }
}
