import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getAuth } from "@/lib/auth";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import { calculatePotAmount, normalizeFrequency } from "@/lib/chama-utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    name,
    email,
    password,
    groupName,
    description,
    contributionAmount,
    frequency,
    numberOfMembers,
    startDate,
    currency,
  } = body as Record<string, string>;

  if (!name || !email || !password || !groupName || !contributionAmount || !startDate) {
    return NextResponse.json(
      {
        error:
          "Name, email, password, group name, contribution amount, and start date are required.",
      },
      { status: 400 }
    );
  }

  try {
    const auth = await getAuth();
    const result = await auth.api.signUpEmail({
      body: {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
      },
    });

    const createdUser =
      result && typeof result === "object" && "user" in result ? result.user : result;

    const context = await auth.$context;
    await context.internalAdapter.updateUser(createdUser.id, {
      role: "moderator",
    });

    await connectMongoose();

    const group = await ChamaGroupModel.create({
      name: groupName.trim(),
      description: description?.trim() ?? "",
      contributionAmount: Number(contributionAmount),
      frequency: normalizeFrequency(frequency),
      numberOfMembers: Number(numberOfMembers) || 1,
      startDate: new Date(startDate),
      currency: currency?.trim() || "KES",
      createdBy: createdUser.id,
      rotationType: "manual",
    });

    const member = await ChamaMemberModel.create({
      groupId: group._id,
      userId: createdUser.id,
      name: createdUser.name || createdUser.email?.split("@")[0] || "Moderator",
      email: createdUser.email?.toLowerCase(),
      role: "admin",
      status: "active",
      invitedBy: createdUser.id,
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

    return NextResponse.json({ groupId: String(group._id), userId: createdUser.id }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create moderator user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
