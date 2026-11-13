import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import { ensureFinanceIndexes, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";
import { buildRoundSnapshot } from "@/lib/finance/round-snapshot";
import { canAdvanceRound } from "@/lib/finance/ledger";
import { addFrequency, getNextRecipientId } from "@/lib/chama-utils";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    const member = await getGroupMember(groupId, user);
    if (!isSiteAdmin(user) && !member) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    const rounds = await ChamaRoundModel.find({ groupId }).sort({ roundNumber: -1 }).limit(50).lean();
    return NextResponse.json({
      rounds: rounds.map((round) => ({
        id: String(round._id),
        roundNumber: round.roundNumber,
        recipientMemberId: String(round.recipientMemberId),
        status: round.status,
        potAmount: round.potAmount,
        potAmountMinor: round.potAmountMinor,
        totalContributions: round.totalContributions,
        expectedTotalMinor: round.expectedTotalMinor,
        currency: round.currencySnapshot,
        eligibleMemberIds: (round.eligibleMemberIds ?? []).map(String),
        memberObligations: (round.memberObligations ?? []).map((item) => ({
          memberId: String(item.memberId), amountMinor: item.amountMinor,
        })),
        snapshotStatus: round.snapshotStatus,
        snapshotAt: round.snapshotAt,
        snapshotConfirmedBy: round.snapshotConfirmedBy,
        snapshotConfirmedAt: round.snapshotConfirmedAt,
        dueDate: round.dueDate,
        startedAt: round.startedAt,
        completedAt: round.completedAt,
        receivedAt: round.receivedAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load rounds." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    await ensureFinanceIndexes();
    const member = await getGroupMember(groupId, user);
    if (!isSiteAdmin(user) && !hasGroupRole(member, ["admin", "treasurer"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "advance");

    if (action === "confirm-legacy-snapshot") {
      const reason = String(body.reason ?? "").trim().slice(0, 500);
      if (reason.length < 5) return NextResponse.json({ error: "Explain why the legacy round snapshot is being accepted." }, { status: 400 });
      const result = await runInFinancialTransaction(async (session) => {
        const group = await ChamaGroupModel.findOne({ _id: groupId, status: "active" }).session(session);
        const round = await ChamaRoundModel.findOne({ groupId, status: "open" }).session(session);
        if (!group || !round) throw new Error("OPEN_ROUND_NOT_FOUND");
        if (round.snapshotStatus === "confirmed" && round.memberObligations.length) {
          return { snapshotStatus: "confirmed", alreadyApplied: true };
        }
        const activeMembers = await ChamaMemberModel.find({ groupId, status: "active" }).session(session).lean();
        if (!activeMembers.length) throw new Error("NO_ACTIVE_MEMBERS");
        const snapshot = buildRoundSnapshot(group, activeMembers.map((item) => item._id));
        Object.assign(round, snapshot);
        round.snapshotConfirmedBy = user.id;
        round.snapshotConfirmedAt = new Date();
        await round.save({ session });
        await writeFinanceAudit({
          groupId,
          actorId: user.id,
          action: "round.legacy_snapshot_confirmed",
          entityType: "round",
          entityId: String(round._id),
          reason,
          newValues: {
            snapshotAt: snapshot.snapshotAt,
            expectedTotalMinor: snapshot.expectedTotalMinor,
            currency: snapshot.currencySnapshot,
            eligibleMemberIds: snapshot.eligibleMemberIds.map(String),
          },
        }, session);
        return { snapshotStatus: "confirmed", alreadyApplied: false };
      });
      return NextResponse.json(result);
    }

    if (action !== "advance") {
      return NextResponse.json({ error: "Unsupported round action. Use payout confirmation through the payout workflow." }, { status: 400 });
    }

    const nextRound = await runInFinancialTransaction(async (session) => {
      const group = await ChamaGroupModel.findOne({ _id: groupId, status: "active" }).session(session);
      const openRound = await ChamaRoundModel.findOne({ groupId, status: "open" }).session(session);
      if (!group || !openRound) throw new Error("OPEN_ROUND_NOT_FOUND");
      if (openRound.snapshotStatus !== "confirmed" || !openRound.memberObligations.length) {
        throw new Error("LEGACY_SNAPSHOT_REVIEW_REQUIRED");
      }

      const contributionRows = await ChamaFinancialTransactionModel.aggregate([
        {
          $match: {
            groupId: group._id,
            roundId: openRound._id,
            type: "contribution",
            status: "verified",
          },
        },
        { $group: { _id: "$memberId", totalMinor: { $sum: "$amountMinor" } } },
      ]).session(session);
      const paidByMember = new Map(contributionRows.map((item) => [String(item._id), item.totalMinor as number]));
      const outstandingMinor = openRound.memberObligations.reduce((sum, obligation) =>
        sum + Math.max(0, obligation.amountMinor - (paidByMember.get(String(obligation.memberId)) ?? 0)), 0);
      const payout = await ChamaFinancialTransactionModel.findOne({
        groupId: group._id,
        roundId: openRound._id,
        type: "payout",
        legacy: false,
      }).session(session).lean();
      if (!canAdvanceRound({ outstandingMinor, payoutStatus: payout?.status ?? null })) {
        if (outstandingMinor > 0) throw new Error("OUTSTANDING_CONTRIBUTIONS");
        throw new Error("PAYOUT_NOT_CONFIRMED");
      }
      if (!payout?.amountMinor || String(payout.memberId) !== String(openRound.recipientMemberId)) {
        throw new Error("PAYOUT_DETAILS_INVALID");
      }

      const activeMembers = await ChamaMemberModel.find({ groupId, status: "active" }).session(session).lean();
      if (!activeMembers.length) throw new Error("NO_ACTIVE_MEMBERS");
      const at = new Date();
      const previousValues = { status: openRound.status, payoutTransactionId: openRound.payoutTransactionId ?? null };
      const closed = await ChamaRoundModel.updateOne(
        { _id: openRound._id, groupId: group._id, status: "open" },
        { $set: { status: "completed", completedAt: at, payoutTransactionId: payout._id } },
        { session }
      );
      if (closed.modifiedCount !== 1) throw new Error("ROUND_ALREADY_ADVANCED");

      if (!group.rotationOrder?.length) {
        group.rotationOrder = activeMembers.map((item) => item._id as Types.ObjectId);
      }
      const activeIds = new Set(activeMembers.map((item) => String(item._id)));
      const rotation = (group.rotationOrder ?? []).map(String).filter((id) => activeIds.has(id));
      const nextRoundNumber = openRound.roundNumber + 1;
      const candidate = getNextRecipientId(rotation, nextRoundNumber);
      const recipientId = candidate && activeIds.has(candidate) ? candidate : String(activeMembers[0]._id);
      const baseDate = openRound.dueDate || group.startDate || at;
      const dueDate = addFrequency(new Date(baseDate), group.frequency, 1);
      const snapshot = buildRoundSnapshot(group, activeMembers.map((item) => item._id), at);
      const [createdRound] = await ChamaRoundModel.create([{
        groupId: group._id,
        roundNumber: nextRoundNumber,
        recipientMemberId: new Types.ObjectId(recipientId),
        status: "open",
        totalContributions: 0,
        dueDate,
        startedAt: at,
        ...snapshot,
      }], { session });
      group.currentRound = nextRoundNumber;
      await group.save({ session });
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: "round.advanced",
        entityType: "round",
        entityId: String(openRound._id),
        previousValues,
        newValues: { status: "completed", nextRoundId: String(createdRound._id), nextRoundNumber },
      }, session);
      return { roundId: String(createdRound._id), roundNumber: nextRoundNumber };
    });
    return NextResponse.json(nextRound, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const statusByMessage: Record<string, number> = {
        OPEN_ROUND_NOT_FOUND: 404,
        LEGACY_SNAPSHOT_REVIEW_REQUIRED: 409,
        OUTSTANDING_CONTRIBUTIONS: 409,
        PAYOUT_NOT_CONFIRMED: 409,
        PAYOUT_DETAILS_INVALID: 409,
        NO_ACTIVE_MEMBERS: 409,
        ROUND_ALREADY_ADVANCED: 409,
      };
      if (statusByMessage[error.message]) {
        const messages: Record<string, string> = {
          OPEN_ROUND_NOT_FOUND: "There is no active round to update.",
          LEGACY_SNAPSHOT_REVIEW_REQUIRED: "A treasurer must review and confirm this round's financial snapshot first.",
          OUTSTANDING_CONTRIBUTIONS: "Verify every member obligation before advancing the round.",
          PAYOUT_NOT_CONFIRMED: "The round's payout must be transferred and confirmed by its recipient before advancing.",
          PAYOUT_DETAILS_INVALID: "The payout amount or recipient does not match this round.",
          NO_ACTIVE_MEMBERS: "At least one active member is required to open the next round.",
          ROUND_ALREADY_ADVANCED: "Another request already advanced this round.",
        };
        return NextResponse.json({ error: messages[error.message] }, { status: statusByMessage[error.message] });
      }
      if (/Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
        return NextResponse.json({ error: "Round advancement requires MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
      }
    }
    return NextResponse.json({ error: "Unable to advance round." }, { status: 500 });
  }
}
