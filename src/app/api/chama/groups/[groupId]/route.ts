import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";
import { calculatePotAmount, normalizeFrequency, shuffle } from "@/lib/chama-utils";

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

    const group = (await ChamaGroupModel.findById(groupId).lean()) as
      | {
          _id: unknown;
          name: string;
          description: string;
          contributionAmount: number;
          frequency: string;
          numberOfMembers: number;
          startDate: Date;
          currency: string;
          status: string;
          rotationType: string;
          rotationOrder?: unknown[];
          currentRound: number;
        }
      | null;
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const members = (await ChamaMemberModel.find({ groupId: group._id }).lean()) as unknown as Array<{
      _id: unknown;
      status: string;
    }>;
    const activeCount = members.filter((item) => item.status === "active").length;
    const openRound = (await ChamaRoundModel.findOne({
      groupId: group._id,
      status: "open",
    }).lean()) as { _id: unknown; recipientMemberId: unknown; roundNumber: number; status: string; dueDate?: Date; totalContributions: number; receivedAt?: Date } | null;

    return NextResponse.json({
      group: {
        id: String(group._id),
        name: group.name,
        description: group.description,
        contributionAmount: group.contributionAmount,
        frequency: group.frequency,
        numberOfMembers: group.numberOfMembers,
        startDate: group.startDate,
        currency: group.currency,
        status: group.status,
        rotationType: group.rotationType,
        rotationOrder: (group.rotationOrder ?? []).map((id) => String(id)),
        currentRound: group.currentRound,
      },
      stats: {
        membersCount: activeCount,
        potAmount: calculatePotAmount(group, activeCount),
      },
      openRound: openRound
        ? {
            id: String(openRound._id),
            roundNumber: openRound.roundNumber,
            recipientMemberId: String(openRound.recipientMemberId),
            status: openRound.status,
            dueDate: openRound.dueDate,
            totalContributions: openRound.totalContributions,
            receivedAt: openRound.receivedAt,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load group." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
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

    const group = await ChamaGroupModel.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(member, ["admin", "treasurer", "secretary"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.name !== undefined) group.name = String(body.name).trim();
    if (body.description !== undefined) group.description = String(body.description).trim();
    if (body.contributionAmount !== undefined) {
      group.contributionAmount = Number(body.contributionAmount);
    }
    if (body.frequency !== undefined) group.frequency = normalizeFrequency(body.frequency);
    if (body.numberOfMembers !== undefined) {
      group.numberOfMembers = Number(body.numberOfMembers);
    }
    if (body.startDate !== undefined) group.startDate = new Date(body.startDate);
    if (body.currency !== undefined) group.currency = String(body.currency || "KES");
    if (body.status !== undefined) group.status = String(body.status);

    if (body.rotationType === "random" || body.rotationType === "manual") {
      group.rotationType = body.rotationType;
    }

    if (Array.isArray(body.rotationOrder)) {
      const validIds = body.rotationOrder.filter((id: string) => Types.ObjectId.isValid(id));
      group.rotationOrder = validIds.map((id: string) => new Types.ObjectId(id));
    }

    if (body.shuffleRotation === true) {
      const currentOrder = (group.rotationOrder ?? []).map((id: unknown) => String(id));
      const shuffled = shuffle(currentOrder) as string[];
      group.rotationOrder = shuffled.map((id) => new Types.ObjectId(id));
      group.rotationType = "random";
    }

    await group.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Unable to update group." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
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

    const group = await ChamaGroupModel.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(member, ["admin"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    await Promise.all([
      ChamaGroupModel.deleteOne({ _id: group._id }),
      ChamaMemberModel.deleteMany({ groupId: group._id }),
      ChamaRoundModel.deleteMany({ groupId: group._id }),
      ChamaContributionModel.deleteMany({ groupId: group._id }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Unable to delete group." }, { status: 500 });
  }
}
