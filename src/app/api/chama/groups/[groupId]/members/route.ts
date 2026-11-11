import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";
import ChamaGroupModel from "@/lib/models/chama-group";
import transporter from "@/lib/nodemailer";

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
    }).lean()) as { _id?: unknown } | null;

    let contributionMap: Record<string, number> = {};
    if (openRound) {
      const contributions = await ChamaContributionModel.find({
        roundId: openRound._id,
      }).lean();
      contributionMap = contributions.reduce<Record<string, number>>((acc, item) => {
        acc[String(item.memberId)] = (acc[String(item.memberId)] || 0) + item.amount;
        return acc;
      }, {});
    }

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
        contributionTotal: contributionMap[String(item._id)] || 0,
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

    const body = await request.json().catch(() => ({}));
    const { name, email, phone, role } = body as Record<string, string>;

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
      status: { $ne: "rejected" },
    });
    await ChamaGroupModel.updateOne(
      { _id: groupId },
      { $set: { numberOfMembers: activeCount } }
    );

    if (email) {
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
        )}&groupName=${encodeURIComponent(group?.name ?? "ChamaHub group")}`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email.trim().toLowerCase(),
          subject: `You're invited to join ${group?.name ?? "a ChamaHub group"}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0b1220;">
              <h2 style="margin: 0 0 12px;">Welcome to ChamaHub</h2>
              <p>You have been invited to join <strong>${group?.name ?? "a ChamaHub group"}</strong>.</p>
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
