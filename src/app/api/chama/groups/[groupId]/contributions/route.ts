import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaMemberModel from "@/lib/models/chama-member";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";

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

    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");

    const query: Record<string, unknown> = { groupId };
    if (roundId && Types.ObjectId.isValid(roundId)) {
      query.roundId = roundId;
    }

    const contributions = await ChamaContributionModel.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      contributions: contributions.map((item) => ({
        id: String(item._id),
        roundId: String(item.roundId),
        memberId: String(item.memberId),
        amount: item.amount,
        status: item.status,
        method: item.method,
        reference: item.reference,
        paidAt: item.paidAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load contributions." }, { status: 500 });
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
    const requester = (await getGroupMember(groupId, user)) as
      | { role?: string | null }
      | null;

    const body = await request.json().catch(() => ({}));
    const { roundId, memberId, amount, method, reference, paidAt } = body as Record<
      string,
      string
    >;

    if (!roundId || !memberId || !amount) {
      return NextResponse.json(
        { error: "Round, member, and amount are required." },
        { status: 400 }
      );
    }

    if (!Types.ObjectId.isValid(roundId) || !Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "Invalid ids." }, { status: 400 });
    }

    const member = (await ChamaMemberModel.findById(memberId).lean()) as
      | { userId?: string; email?: string | null }
      | null;
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const isSelf =
      member.userId === user.id ||
      (user.email && member.email === user.email.toLowerCase());

    if (!isAdmin && !hasGroupRole(requester, ["admin", "treasurer"]) && !isSelf) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const contribution = await ChamaContributionModel.create({
      groupId,
      roundId,
      memberId,
      amount: Number(amount),
      status: "paid",
      method: method?.trim() || "manual",
      reference: reference?.trim() || "",
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    });

    const total = await ChamaContributionModel.aggregate([
      { $match: { roundId: new Types.ObjectId(roundId) } },
      { $group: { _id: "$roundId", sum: { $sum: "$amount" } } },
    ]);

    await ChamaRoundModel.updateOne(
      { _id: roundId },
      { $set: { totalContributions: total[0]?.sum ?? 0 } }
    );

    return NextResponse.json({ id: String(contribution._id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to record contribution." }, { status: 500 });
  }
}
