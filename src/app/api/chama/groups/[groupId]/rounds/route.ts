import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";
import { addFrequency, calculatePotAmount, getNextRecipientId } from "@/lib/chama-utils";

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

    const rounds = await ChamaRoundModel.find({ groupId })
      .sort({ roundNumber: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({
      rounds: rounds.map((round) => ({
        id: String(round._id),
        roundNumber: round.roundNumber,
        recipientMemberId: String(round.recipientMemberId),
        status: round.status,
        potAmount: round.potAmount,
        totalContributions: round.totalContributions,
        dueDate: round.dueDate,
        startedAt: round.startedAt,
        completedAt: round.completedAt,
        receivedAt: round.receivedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load rounds." }, { status: 500 });
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
    if (!isAdmin && !hasGroupRole(member, ["admin", "treasurer"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || "advance";

    const group = await ChamaGroupModel.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const openRound = await ChamaRoundModel.findOne({
      groupId,
      status: "open",
    });

    if (action === "mark-received" && openRound) {
      openRound.receivedAt = new Date();
      await openRound.save();
      return NextResponse.json({ ok: true });
    }

    if (openRound) {
      openRound.status = "completed";
      openRound.completedAt = new Date();
      await openRound.save();
    }

    const members = await ChamaMemberModel.find({
      groupId,
      status: "active",
    }).lean();
    const memberIds = members.map((item) => String(item._id));

    if (!group.rotationOrder || group.rotationOrder.length === 0) {
      group.rotationOrder = memberIds.map((id) => new Types.ObjectId(id));
    }

    const nextRoundNumber = (openRound?.roundNumber ?? group.currentRound ?? 0) + 1;
    const recipientId =
      getNextRecipientId(
        (group.rotationOrder ?? []).map((id: unknown) => String(id)),
        nextRoundNumber
      ) ?? memberIds[0];

    const baseDate = openRound?.dueDate || group.startDate || new Date();
    const dueDate = addFrequency(new Date(baseDate), group.frequency, 1);

    const nextRound = await ChamaRoundModel.create({
      groupId: group._id,
      roundNumber: nextRoundNumber,
      recipientMemberId: recipientId,
      status: "open",
      potAmount: calculatePotAmount(group, members.length),
      totalContributions: 0,
      dueDate,
      startedAt: new Date(),
    });

    group.currentRound = nextRoundNumber;
    await group.save();

    return NextResponse.json({ roundId: String(nextRound._id) });
  } catch (error) {
    return NextResponse.json({ error: "Unable to advance round." }, { status: 500 });
  }
}
