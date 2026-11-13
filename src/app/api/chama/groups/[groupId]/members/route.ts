import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";
import ChamaGroupModel from "@/lib/models/chama-group";
import transporter from "@/lib/nodemailer";
import { fromMinorUnits } from "@/lib/finance/money";
import { getContributionStatus } from "@/lib/finance/ledger";

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

    const members = await ChamaMemberModel.find({ groupId }).lean();
    const openRound = (await ChamaRoundModel.findOne({
      groupId,
      status: "open",
    }).lean()) as {
      _id?: unknown;
      currencySnapshot?: string | null;
      memberObligations?: Array<{ memberId: unknown; amountMinor: number }>;
    } | null;

    const verifiedContributionMap: Record<string, number> = {};
    const pendingContributionMap: Record<string, number> = {};
    if (openRound) {
      const rows = await ChamaFinancialTransactionModel.aggregate([
        {
          $match: {
            groupId: new Types.ObjectId(groupId),
            roundId: new Types.ObjectId(String(openRound._id)),
            type: "contribution",
            status: { $in: ["verified", "pending_verification"] },
          },
        },
        { $group: { _id: { memberId: "$memberId", status: "$status" }, totalMinor: { $sum: "$amountMinor" } } },
      ]);
      for (const row of rows) {
        const target = row._id.status === "verified" ? verifiedContributionMap : pendingContributionMap;
        const key = String(row._id.memberId);
        target[key] = (target[key] ?? 0) + row.totalMinor;
      }
    }
    const obligations = new Map((openRound?.memberObligations ?? []).map((item) => [String(item.memberId), item.amountMinor]));

    return NextResponse.json({
      members: members.map((item) => ({
        id: String(item._id),
        userId: item.userId,
        name: item.name,
        email: item.email,
        phone: item.phone,
        role: item.role,
        status: item.status,
        joinedAt: item.joinedAt,
        contributionTotal: openRound?.currencySnapshot
          ? fromMinorUnits(verifiedContributionMap[String(item._id)] ?? 0, openRound.currencySnapshot)
          : 0,
        verifiedContributionMinor: verifiedContributionMap[String(item._id)] ?? 0,
        pendingContributionMinor: pendingContributionMap[String(item._id)] ?? 0,
        expectedContributionMinor: obligations.get(String(item._id)) ?? 0,
        outstandingContributionMinor: Math.max(
          0,
          (obligations.get(String(item._id)) ?? 0) - (verifiedContributionMap[String(item._id)] ?? 0)
        ),
        contributionStatus: getContributionStatus(
          obligations.get(String(item._id)) ?? 0,
          verifiedContributionMap[String(item._id)] ?? 0,
          pendingContributionMap[String(item._id)] ?? 0
        ),
      })),
      openRoundId: openRound ? String(openRound._id) : null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load members." }, { status: 500 });
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
    if (!isAdmin && !hasGroupRole(member, ["admin", "treasurer", "secretary"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const canAssignRoles = isAdmin || hasGroupRole(member, ["admin"]);

    const body = await request.json().catch(() => ({}));
    const { name, email, phone, role } = body as Record<string, string>;

    if (role && role !== "member" && !canAssignRoles) {
      return NextResponse.json({ error: "Only a group administrator can assign elevated roles." }, { status: 403 });
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Provide an email or phone number." },
        { status: 400 }
      );
    }

    const newMember = await ChamaMemberModel.create({
      groupId,
      name: name?.trim() || (email ? email.split("@")[0] : "Member"),
      email: email?.trim().toLowerCase(),
      phone: phone?.trim(),
      role: role && ["admin", "treasurer", "secretary", "member"].includes(role)
        ? role
        : "member",
      status: "pending",
      invitedBy: user.id,
    });

    const activeCount = await ChamaMemberModel.countDocuments({
      groupId,
      status: "active",
    });
    await ChamaGroupModel.updateOne(
      { _id: groupId },
      { $set: { numberOfMembers: activeCount } }
    );

    if (email && transporter) {
      try {
        const group = (await ChamaGroupModel.findById(groupId).lean()) as
          | { name?: string }
          | null;
        const baseUrl =
          process.env.NEXT_PUBLIC_SITE_URL ||
          process.env.BETTER_AUTH_BASE_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
          "http://localhost:3000";
        const inviteLink = `${baseUrl}/member-signup?email=${encodeURIComponent(
          email.trim().toLowerCase()
        )}&groupName=${encodeURIComponent(group?.name ?? "ChamaPulse group")}`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email.trim().toLowerCase(),
          subject: `You're invited to join ${group?.name ?? "a ChamaPulse group"}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0b1220;">
              <h2 style="margin: 0 0 12px;">Welcome to ChamaPulse</h2>
              <p>You have been invited to join <strong>${group?.name ?? "a ChamaPulse group"}</strong>.</p>
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
      } catch (mailError) {
        // Avoid blocking member creation if email fails.
      }
    }

    return NextResponse.json({ memberId: String(newMember._id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Unable to add member." }, { status: 500 });
  }
}
