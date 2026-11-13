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
import { calculatePotAmount, normalizeFrequency, shuffle } from "@/lib/chama-utils";
import { ensureFinanceIndexes, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";
import { toMinorUnits } from "@/lib/finance/money";

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
    }).lean()) as {
      _id: unknown;
      recipientMemberId: unknown;
      roundNumber: number;
      status: string;
      dueDate?: Date;
      totalContributions: number;
      potAmount: number;
      receivedAt?: Date;
      currencySnapshot?: string | null;
      expectedTotalMinor?: number | null;
      snapshotStatus?: string;
      eligibleMemberIds?: unknown[];
    } | null;

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
        potAmount: openRound?.potAmount ?? calculatePotAmount(group, activeCount),
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
            currency: openRound.currencySnapshot,
            expectedTotalMinor: openRound.expectedTotalMinor,
            snapshotStatus: openRound.snapshotStatus,
            eligibleMemberIds: (openRound.eligibleMemberIds ?? []).map(String),
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
    await ensureFinanceIndexes();

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
    const changesRoundOrFinancialSettings = [
      "contributionAmount", "currency", "frequency", "numberOfMembers", "startDate", "status",
      "rotationType", "rotationOrder", "shuffleRotation",
    ].some((key) => body[key] !== undefined);
    if (changesRoundOrFinancialSettings && !isAdmin && !hasGroupRole(member, ["admin"])) {
      return NextResponse.json({ error: "Only group administrators can change financial settings and payout rotation." }, { status: 403 });
    }
    const nextConfiguredCurrency = String(body.currency ?? group.currency).trim().toUpperCase();
    const financialValuesChanged =
      (body.contributionAmount !== undefined && Number(body.contributionAmount) !== group.contributionAmount) ||
      (body.currency !== undefined && nextConfiguredCurrency !== group.currency) ||
      (body.frequency !== undefined && normalizeFrequency(body.frequency) !== group.frequency);
    if (financialValuesChanged && !String(body.reason ?? "").trim()) {
      return NextResponse.json({ error: "Provide a reason for changing contribution or currency settings." }, { status: 400 });
    }
    const previousFinanceSettings = {
      contributionAmount: group.contributionAmount,
      currency: group.currency,
      frequency: group.frequency,
    };
    const previousGroupStatus = group.status;
    if (body.name !== undefined) group.name = String(body.name).trim();
    if (body.description !== undefined) group.description = String(body.description).trim();
    if (body.contributionAmount !== undefined) {
      const nextAmount = Number(body.contributionAmount);
      try {
        toMinorUnits(body.contributionAmount, String(body.currency ?? group.currency).toUpperCase());
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid contribution amount." }, { status: 400 });
      }
      group.contributionAmount = nextAmount;
    }
    if (body.frequency !== undefined) group.frequency = normalizeFrequency(body.frequency);
    if (body.numberOfMembers !== undefined) {
      group.numberOfMembers = Number(body.numberOfMembers);
    }
    if (body.startDate !== undefined) group.startDate = new Date(body.startDate);
    if (body.currency !== undefined) {
      const nextCurrency = String(body.currency || "KES").trim().toUpperCase();
      try {
        toMinorUnits(body.contributionAmount ?? group.contributionAmount, nextCurrency);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid currency." }, { status: 400 });
      }
      group.currency = nextCurrency;
    }
    if (body.status === "active" || body.status === "archived") {
      group.status = body.status;
      group.archivedAt = body.status === "archived" ? group.archivedAt ?? new Date() : null;
      group.archivedBy = body.status === "archived" ? group.archivedBy ?? user.id : null;
    }

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

    await runInFinancialTransaction(async (session) => {
      await group.save({ session });
      if (
        previousFinanceSettings.contributionAmount !== group.contributionAmount ||
        previousFinanceSettings.currency !== group.currency ||
        previousFinanceSettings.frequency !== group.frequency
      ) {
        await writeFinanceAudit({
          groupId: group._id as Types.ObjectId,
          actorId: user.id,
          action: "group.financial_configuration_changed",
          entityType: "group",
          entityId: String(group._id),
          reason: String(body.reason ?? "").trim().slice(0, 500),
          previousValues: previousFinanceSettings,
          newValues: { contributionAmount: group.contributionAmount, currency: group.currency, frequency: group.frequency },
        }, session);
      }
      if (previousGroupStatus !== group.status) {
        await writeFinanceAudit({
          groupId: group._id as Types.ObjectId,
          actorId: user.id,
          action: group.status === "archived" ? "group.archived" : "group.reactivated",
          entityType: "group",
          entityId: String(group._id),
          previousValues: { status: previousGroupStatus },
          newValues: { status: group.status },
        }, session);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Group updates require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
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
    await ensureFinanceIndexes();

    const group = await ChamaGroupModel.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !hasGroupRole(member, ["admin"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const previousStatus = group.status;
    group.status = "archived";
    group.archivedAt = group.archivedAt ?? new Date();
    group.archivedBy = group.archivedBy ?? user.id;
    await runInFinancialTransaction(async (session) => {
      await group.save({ session });
      if (previousStatus !== "archived") {
        await writeFinanceAudit({
          groupId: group._id as Types.ObjectId,
          actorId: user.id,
          action: "group.archived",
          entityType: "group",
          entityId: String(group._id),
          previousValues: { status: previousStatus },
          newValues: { status: "archived" },
        }, session);
      }
    });

    return NextResponse.json({ ok: true, archived: true });
  } catch (error) {
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Group archival requires MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to delete group." }, { status: 500 });
  }
}
