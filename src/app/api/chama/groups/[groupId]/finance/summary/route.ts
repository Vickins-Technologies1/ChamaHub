import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaReconciliationModel from "@/lib/models/chama-reconciliation";
import ChamaRoundModel from "@/lib/models/chama-round";
import { getOutstandingMinor } from "@/lib/finance/ledger";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    const isAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!isAdmin && !member) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    const canReview = isAdmin || hasGroupRole(member, ["admin", "treasurer"]);
    const group = await ChamaGroupModel.findById(groupId).lean();
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });
    const openRound = await ChamaRoundModel.findOne({ groupId, status: "open" }).lean();
    const rows = await ChamaFinancialTransactionModel.aggregate([
      { $match: { groupId: new Types.ObjectId(groupId), currency: group.currency, amountMinor: { $type: "number" } } },
      { $group: { _id: { type: "$type", status: "$status" }, totalMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
    ]);
    const sum = (types: string[], statuses: string[]) => rows
      .filter((row) => types.includes(row._id.type) && statuses.includes(row._id.status))
      .reduce((total, row) => total + row.totalMinor, 0);
    const recordedContributionsMinor = sum(["contribution"], ["pending_verification", "verified", "legacy_unverified"]);
    const verifiedContributionsMinor = sum(["contribution"], ["verified"]);
    const pendingVerificationMinor = sum(["contribution"], ["pending_verification"]);
    const recordedPayoutsMinor = sum(["payout"], ["pending_transfer", "transferred", "confirmed"]);
    const confirmedPayoutsMinor = sum(["payout"], ["confirmed"]);
    const outstandingByMember: Array<{ memberId: string; expectedMinor: number; verifiedMinor: number; outstandingMinor: number }> = [];
    let outstandingObligationsMinor: number | null = null;
    let verifiedOpenRoundMinor = 0;
    if (openRound?.snapshotStatus === "confirmed" && openRound.memberObligations?.length) {
      const paid = await ChamaFinancialTransactionModel.aggregate([
        {
          $match: {
            groupId: new Types.ObjectId(groupId),
            roundId: openRound._id,
            type: "contribution",
            status: "verified",
          },
        },
        { $group: { _id: "$memberId", totalMinor: { $sum: "$amountMinor" } } },
      ]);
      const paidMap = new Map(paid.map((item) => [String(item._id), item.totalMinor as number]));
      verifiedOpenRoundMinor = paid.reduce((total, item) => total + (item.totalMinor as number), 0);
      outstandingByMember.push(...openRound.memberObligations.map((item) => {
        const expectedMinor = item.amountMinor;
        const verifiedMinor = paidMap.get(String(item.memberId)) ?? 0;
        return {
          memberId: String(item.memberId),
          expectedMinor,
          verifiedMinor,
          outstandingMinor: getOutstandingMinor(expectedMinor, verifiedMinor),
        };
      }));
      outstandingObligationsMinor = outstandingByMember.reduce((total, item) => total + item.outstandingMinor, 0);
    }
    const latestReconciliation = await ChamaReconciliationModel.findOne({ groupId }).sort({ periodEnd: -1, createdAt: -1 }).lean();
    const staffRecent = canReview
      ? await ChamaFinancialTransactionModel.find({ groupId }).sort({ transactionDate: -1, _id: -1 }).limit(10).lean()
      : [];
    const recentMemberIds = [...new Set(staffRecent.map((item) => item.memberId).filter(Boolean).map(String))];
    const recentMembers = recentMemberIds.length ? await ChamaMemberModel.find({ _id: { $in: recentMemberIds } }).lean() : [];
    const memberMap = new Map(recentMembers.map((item) => [String(item._id), item.name || item.email || "Member"]));
    const myObligation = outstandingByMember.find((item) => String(item.memberId) === String(member?._id));
    return NextResponse.json({
      currency: group.currency,
      summary: {
        recordedContributionsMinor,
        verifiedContributionsMinor,
        pendingVerificationMinor,
        recordedPayoutsMinor,
        confirmedPayoutsMinor,
        outstandingObligationsMinor,
        currentRound: openRound ? {
          id: String(openRound._id),
          number: openRound.roundNumber,
          currency: openRound.currencySnapshot,
          expectedTotalMinor: openRound.expectedTotalMinor,
          verifiedContributionsMinor: verifiedOpenRoundMinor,
          snapshotStatus: openRound.snapshotStatus,
          progressByMember: canReview ? outstandingByMember : myObligation ? [myObligation] : [],
        } : null,
        reconciliation: latestReconciliation ? {
          id: String(latestReconciliation._id),
          status: latestReconciliation.status,
          discrepancyMinor: latestReconciliation.discrepancyMinor,
          periodStart: latestReconciliation.periodStart,
          periodEnd: latestReconciliation.periodEnd,
        } : null,
      },
      recentTransactions: staffRecent.map((item) => ({
        id: String(item._id),
        type: item.type,
        direction: item.direction,
        amountMinor: item.amountMinor,
        currency: item.currency,
        status: item.status,
        memberId: item.memberId ? String(item.memberId) : null,
        memberName: item.memberId ? memberMap.get(String(item.memberId)) ?? "Member" : "Group",
        reference: item.reference,
        transactionDate: item.transactionDate,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load financial summary." }, { status: 500 });
  }
}
