import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import {
  ensureFinanceIndexes,
  refreshRoundRecordedTotal,
  runInFinancialTransaction,
  writeFinanceAudit,
} from "@/lib/finance/service";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string; transactionId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, transactionId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(transactionId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    await connectMongoose();
    await ensureFinanceIndexes();
    const member = await getGroupMember(groupId, user);
    if (!isSiteAdmin(user) && !hasGroupRole(member, ["admin", "treasurer"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (action !== "verify" && action !== "reverse") {
      return NextResponse.json({ error: "Unsupported contribution action." }, { status: 400 });
    }
    const reason = String(body.reason ?? "").trim().slice(0, 500);
    if (reason.length < 5) {
      return NextResponse.json({ error: action === "reverse" ? "A reason is required to reverse a payment." : "A verification note is required for the payment audit trail." }, { status: 400 });
    }

    const result = await runInFinancialTransaction(async (session) => {
      const transaction = await ChamaFinancialTransactionModel.findOne({
        _id: new Types.ObjectId(transactionId),
        groupId: new Types.ObjectId(groupId),
        type: "contribution",
      }).session(session);
      if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");

      if (action === "verify") {
        if (transaction.status === "verified") return { status: "verified", alreadyApplied: true };
        if (!["pending_verification", "legacy_unverified"].includes(transaction.status)) throw new Error("INVALID_TRANSACTION_STATE");
        if (!transaction.amountMinor) throw new Error("LEGACY_AMOUNT_REQUIRES_REVIEW");
        const previousValues = { status: transaction.status };
        transaction.status = "verified";
        transaction.verifiedBy = user.id;
        transaction.verifiedAt = new Date();
        transaction.verificationNote = reason;
        await transaction.save({ session });
        await ChamaContributionModel.updateOne(
          { financialTransactionId: transaction._id },
          { $set: { status: "paid" } },
          { session }
        );
        await writeFinanceAudit({
          groupId,
          actorId: user.id,
          action: "contribution.verified",
          entityType: "financial_transaction",
          entityId: transactionId,
          reason,
          previousValues,
          newValues: { status: "verified", verifiedAt: transaction.verifiedAt },
        }, session);
        await refreshRoundRecordedTotal(transaction.roundId!, session);
        return { status: "verified", alreadyApplied: false };
      }

      if (transaction.status === "reversed") return { status: "reversed", alreadyApplied: true };
      if (transaction.status !== "verified" || !transaction.amountMinor) {
        throw new Error("ONLY_VERIFIED_PAYMENTS_CAN_BE_REVERSED");
      }
      const reversal = await ChamaFinancialTransactionModel.findOne({ reversalOf: transaction._id }).session(session);
      if (reversal) return { status: "reversed", alreadyApplied: true, reversalId: String(reversal._id) };
      const [reversalEntry] = await ChamaFinancialTransactionModel.create([{
        groupId: transaction.groupId,
        type: "reversal",
        direction: "out",
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        memberId: transaction.memberId,
        roundId: transaction.roundId,
        recordedBy: user.id,
        reference: transaction.reference,
        method: "adjustment",
        transactionDate: new Date(),
        status: "verified",
        idempotencyKey: `reversal:${transaction._id}`,
        description: `Reversal of contribution ${transaction._id}`,
        reversalOf: transaction._id,
        correctionReason: reason,
      }], { session });
      const previousValues = { status: transaction.status };
      transaction.status = "reversed";
      transaction.correctionReason = reason;
      await transaction.save({ session });
      await ChamaContributionModel.updateOne(
        { financialTransactionId: transaction._id },
        { $set: { status: "pending" } },
        { session }
      );
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: "contribution.reversed",
        entityType: "financial_transaction",
        entityId: transactionId,
        reason,
        previousValues,
        newValues: { status: "reversed", reversalId: String(reversalEntry._id) },
      }, session);
      await refreshRoundRecordedTotal(transaction.roundId!, session);
      return { status: "reversed", alreadyApplied: false, reversalId: String(reversalEntry._id) };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSACTION_NOT_FOUND") {
      return NextResponse.json({ error: "Contribution not found." }, { status: 404 });
    }
    if (error instanceof Error && (error.message === "INVALID_TRANSACTION_STATE" || error.message === "ONLY_VERIFIED_PAYMENTS_CAN_BE_REVERSED")) {
      return NextResponse.json({ error: "The contribution cannot be changed from its current status." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "LEGACY_AMOUNT_REQUIRES_REVIEW") {
      return NextResponse.json({ error: "This historical amount cannot be safely converted to minor currency units and cannot be verified automatically." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update contribution." }, { status: 500 });
  }
}
