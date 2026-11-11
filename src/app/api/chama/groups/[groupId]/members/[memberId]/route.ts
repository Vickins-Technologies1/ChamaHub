import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaGroupModel from "@/lib/models/chama-group";
import {
  getSessionUser,
  getGroupMember,
  hasGroupRole,
  isSiteAdmin,
} from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string; memberId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, memberId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const requester = await getGroupMember(groupId, user);
    const canManage =
      isAdmin || hasGroupRole(requester, ["admin", "treasurer", "secretary"]);

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.role && ["admin", "treasurer", "secretary", "member"].includes(body.role)) {
      if (!canManage) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      updates.role = body.role;
    }

    if (body.status && ["active", "pending", "rejected"].includes(body.status)) {
      const member = await ChamaMemberModel.findById(memberId);
      if (!member) {
        return NextResponse.json({ error: "Member not found." }, { status: 404 });
      }

      const isSelf =
        member.userId === user.id ||
        (user.email && member.email === user.email.toLowerCase());

      if (!canManage && !isSelf) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }

      updates.status = body.status;
      if (body.status === "active" && !member.joinedAt) {
        updates.joinedAt = new Date();
      }

      await ChamaMemberModel.updateOne({ _id: memberId }, { $set: updates });

      const group = await ChamaGroupModel.findById(groupId);
      if (group) {
        const memberIdStr = String(member._id);
        const currentOrder = (group.rotationOrder ?? []).map((id: unknown) => String(id));
        if (body.status === "active" && !currentOrder.includes(memberIdStr)) {
          currentOrder.push(memberIdStr);
          group.rotationOrder = currentOrder.map((id: string) => new Types.ObjectId(id));
        }
        if (body.status === "rejected") {
          const nextOrder = currentOrder.filter((id: string) => id !== memberIdStr);
          group.rotationOrder = nextOrder.map((id: string) => new Types.ObjectId(id));
        }
        await group.save();
      }

      const activeCount = await ChamaMemberModel.countDocuments({
        groupId,
        status: { $ne: "rejected" },
      });
      await ChamaGroupModel.updateOne(
        { _id: groupId },
        { $set: { numberOfMembers: activeCount } }
      );

      return NextResponse.json({ ok: true });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided." }, { status: 400 });
    }

    await ChamaMemberModel.updateOne({ _id: memberId }, { $set: updates });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Unable to update member." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { groupId, memberId } = await params;
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    await connectMongoose();

    const isAdmin = isSiteAdmin(user);
    const requester = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(requester, ["admin"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    await ChamaMemberModel.deleteOne({ _id: memberId });

    const group = await ChamaGroupModel.findById(groupId);
    if (group) {
      const currentOrder = (group.rotationOrder ?? []).map((id: unknown) => String(id));
      const nextOrder = currentOrder.filter((id: string) => id !== memberId);
      group.rotationOrder = nextOrder.map((id: string) => new Types.ObjectId(id));
      await group.save();
    }

    const activeCount = await ChamaMemberModel.countDocuments({
      groupId,
      status: { $ne: "rejected" },
    });
    await ChamaGroupModel.updateOne(
      { _id: groupId },
      { $set: { numberOfMembers: activeCount } }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Unable to remove member." }, { status: 500 });
  }
}
