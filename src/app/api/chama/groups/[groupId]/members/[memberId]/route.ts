import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import { ensureFinanceIndexes, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";
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
    await ensureFinanceIndexes();

    const isAdmin = isSiteAdmin(user);
    const requester = await getGroupMember(groupId, user);
    const canManage = isAdmin || hasGroupRole(requester, ["admin", "treasurer", "secretary"]);
    const canAssignRoles = isAdmin || hasGroupRole(requester, ["admin"]);

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    const member = await ChamaMemberModel.findOne({ _id: memberId, groupId });
    if (!member) {
      return NextResponse.json({ error: "Member not found in this group." }, { status: 404 });
    }

    if (body.role && ["admin", "treasurer", "secretary", "member"].includes(body.role)) {
      if (!canAssignRoles) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      updates.role = body.role;
    }

    if (body.status && ["active", "pending", "rejected"].includes(body.status)) {
      if (!canManage) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }

      if (member.status === "active" && body.status !== "active") {
        const openRound = await ChamaRoundModel.findOne({ groupId, status: "open" }).lean();
        const obligation = openRound?.memberObligations?.find((item) => String(item.memberId) === memberId);
        if (openRound && obligation) {
          const verified = await ChamaFinancialTransactionModel.aggregate([
            {
              $match: {
                groupId: new Types.ObjectId(groupId), roundId: openRound._id,
                memberId: new Types.ObjectId(memberId), type: "contribution", status: "verified",
              },
            },
            { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
          ]);
          const verifiedMinor = verified[0]?.totalMinor ?? 0;
          const payoutConfirmed = String(openRound.recipientMemberId) !== memberId ||
            Boolean(await ChamaFinancialTransactionModel.exists({ roundId: openRound._id, type: "payout", status: "confirmed" }));
          if (verifiedMinor < obligation.amountMinor || !payoutConfirmed) {
            return NextResponse.json({ error: "This member has an unsettled obligation or payout in the open round." }, { status: 409 });
          }
        }
      }

      updates.status = body.status;
      if (body.status === "active" && !member.joinedAt) {
        updates.joinedAt = new Date();
      }

      await runInFinancialTransaction(async (session) => {
        await ChamaMemberModel.updateOne({ _id: memberId, groupId }, { $set: updates }, { session });
        await writeFinanceAudit({
          groupId,
          actorId: user.id,
          action: "member.status_changed",
          entityType: "member",
          entityId: memberId,
          reason: String(body.reason ?? "").trim().slice(0, 500),
          previousValues: { status: member.status },
          newValues: { status: body.status },
        }, session);
        if (updates.role) {
          await writeFinanceAudit({
            groupId,
            actorId: user.id,
            action: "member.role_changed",
            entityType: "member",
            entityId: memberId,
            reason: String(body.reason ?? "").trim().slice(0, 500),
            previousValues: { role: member.role },
            newValues: { role: updates.role },
          }, session);
        }

        const group = await ChamaGroupModel.findById(groupId).session(session);
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
          await group.save({ session });
        }

        const activeCount = await ChamaMemberModel.countDocuments({ groupId, status: "active" }).session(session);
        await ChamaGroupModel.updateOne(
          { _id: groupId },
          { $set: { numberOfMembers: activeCount } },
          { session }
        );
      });

      return NextResponse.json({ ok: true });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided." }, { status: 400 });
    }

    await runInFinancialTransaction(async (session) => {
      await ChamaMemberModel.updateOne({ _id: memberId, groupId }, { $set: updates }, { session });
      if (updates.role) {
        await writeFinanceAudit({
          groupId,
          actorId: user.id,
          action: "member.role_changed",
          entityType: "member",
          entityId: memberId,
          reason: String(body.reason ?? "").trim().slice(0, 500),
          previousValues: { role: member.role },
          newValues: { role: updates.role },
        }, session);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Member updates require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
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
    await ensureFinanceIndexes();

    const isAdmin = isSiteAdmin(user);
    const requester = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(requester, ["admin"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const target = await ChamaMemberModel.findOne({ _id: memberId, groupId }).lean();
    if (!target) {
      return NextResponse.json({ error: "Member not found in this group." }, { status: 404 });
    }

    const openRound = await ChamaRoundModel.findOne({ groupId, status: "open" }).lean();
    const obligation = openRound?.memberObligations?.find((item) => String(item.memberId) === memberId);
    if (target.status === "active" && openRound && obligation) {
      const verified = await ChamaFinancialTransactionModel.aggregate([
        {
          $match: {
            groupId: new Types.ObjectId(groupId), roundId: openRound._id,
            memberId: new Types.ObjectId(memberId), type: "contribution", status: "verified",
          },
        },
        { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
      ]);
      const verifiedMinor = verified[0]?.totalMinor ?? 0;
      const payoutConfirmed = String(openRound.recipientMemberId) !== memberId ||
        Boolean(await ChamaFinancialTransactionModel.exists({ roundId: openRound._id, type: "payout", status: "confirmed" }));
      if (verifiedMinor < obligation.amountMinor || !payoutConfirmed) {
        return NextResponse.json({ error: "This member has an unsettled obligation or payout in the open round." }, { status: 409 });
      }
    }

    await runInFinancialTransaction(async (session) => {
      await ChamaMemberModel.updateOne({ _id: memberId, groupId }, { $set: { status: "rejected" } }, { session });
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: "member.archived",
        entityType: "member",
        entityId: memberId,
        previousValues: { status: target.status },
        newValues: { status: "rejected" },
      }, session);

      const group = await ChamaGroupModel.findById(groupId).session(session);
      if (group) {
        const currentOrder = (group.rotationOrder ?? []).map((id: unknown) => String(id));
        const nextOrder = currentOrder.filter((id: string) => id !== memberId);
        group.rotationOrder = nextOrder.map((id: string) => new Types.ObjectId(id));
        await group.save({ session });
      }

      const activeCount = await ChamaMemberModel.countDocuments({ groupId, status: "active" }).session(session);
      await ChamaGroupModel.updateOne(
        { _id: groupId },
        { $set: { numberOfMembers: activeCount } },
        { session }
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Member archival requires MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to remove member." }, { status: 500 });
  }
}
