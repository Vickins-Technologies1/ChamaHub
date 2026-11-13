import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import { ensureFinanceIndexes, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string; payoutId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, payoutId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(payoutId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }
    await connectMongoose();
    await ensureFinanceIndexes();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const member = await getGroupMember(groupId, user);
    const isFinanceAdmin = isSiteAdmin(user) || hasGroupRole(member, ["admin", "treasurer"]);
    if (action === "confirm") {
      const payout = await ChamaFinancialTransactionModel.findOne({
        _id: payoutId, groupId, type: "payout",
      }).lean();
      if (!payout || !member || String(payout.memberId) !== String(member._id) || (payout.status !== "transferred" && payout.status !== "confirmed")) {
        return NextResponse.json({ error: "Only the payout recipient can confirm a transferred payout." }, { status: 403 });
      }
    } else if (!isFinanceAdmin || !["transfer", "fail", "retry"].includes(action)) {
      return NextResponse.json({ error: "Access denied or unsupported payout action." }, { status: 403 });
    }

    const reason = String(body.reason ?? "").trim().slice(0, 500);
    if (["fail", "retry"].includes(action) && reason.length < 5) {
      return NextResponse.json({ error: "A reason is required to fail or retry a payout." }, { status: 400 });
    }
    const result = await runInFinancialTransaction(async (session) => {
      const payout = await ChamaFinancialTransactionModel.findOne({
        _id: payoutId, groupId, type: "payout",
      }).session(session);
      if (!payout) throw new Error("PAYOUT_NOT_FOUND");
      const previousStatus = payout.status;
      if (action === "confirm") {
        if (payout.status === "confirmed") return { status: payout.status, alreadyApplied: true };
        if (payout.status !== "transferred") throw new Error("INVALID_PAYOUT_STATE");
        payout.status = "confirmed";
        payout.confirmedBy = user.id;
        payout.confirmedAt = new Date();
      } else if (action === "transfer") {
        if (payout.status !== "pending_transfer") throw new Error("INVALID_PAYOUT_STATE");
        const reference = String(body.reference ?? "").trim().slice(0, 120);
        if (!reference) throw new Error("TRANSFER_REFERENCE_REQUIRED");
        payout.status = "transferred";
        payout.reference = reference;
        payout.transactionDate = body.transferDate ? new Date(body.transferDate) : new Date();
        if (Number.isNaN(payout.transactionDate.getTime())) throw new Error("INVALID_TRANSFER_DATE");
        payout.evidenceReference = String(body.evidenceReference ?? payout.evidenceReference ?? "").trim().slice(0, 500);
      } else if (action === "retry") {
        if (payout.status !== "failed") throw new Error("INVALID_PAYOUT_STATE");
        payout.status = "pending_transfer";
        payout.correctionReason = reason;
      } else {
        if (!["pending_transfer", "transferred"].includes(payout.status)) throw new Error("INVALID_PAYOUT_STATE");
        payout.status = "failed";
        payout.correctionReason = reason;
      }
      await payout.save({ session });
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: `payout.${action === "transfer" ? "transferred" : action === "confirm" ? "confirmed" : action === "retry" ? "retry_authorized" : "failed"}`,
        entityType: "financial_transaction",
        entityId: payoutId,
        reason,
        previousValues: { status: previousStatus },
        newValues: { status: payout.status, reference: payout.reference, occurredAt: new Date() },
      }, session);
      return { status: payout.status, alreadyApplied: false };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Payout updates require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "PAYOUT_NOT_FOUND") return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    if (error instanceof Error && ["INVALID_PAYOUT_STATE", "TRANSFER_REFERENCE_REQUIRED", "INVALID_TRANSFER_DATE"].includes(error.message)) {
      return NextResponse.json({ error: "The payout cannot be changed from its current state or has invalid transfer details." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update payout." }, { status: 500 });
  }
}
