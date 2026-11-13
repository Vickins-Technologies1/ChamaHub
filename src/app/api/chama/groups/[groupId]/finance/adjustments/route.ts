import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaRoundModel from "@/lib/models/chama-round";
import { toMinorUnits } from "@/lib/finance/money";
import { ensureFinanceIndexes, runInFinancialTransaction, writeFinanceAudit } from "@/lib/finance/service";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };

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
    const group = await ChamaGroupModel.findOne({ _id: groupId, status: "active" }).lean();
    if (!group) return NextResponse.json({ error: "Active group not found." }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const type = String(body.type ?? "adjustment");
    const direction = String(body.direction ?? "");
    const reason = String(body.reason ?? "").trim().slice(0, 500);
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!["adjustment", "refund"].includes(type) || !["in", "out"].includes(direction)) {
      return NextResponse.json({ error: "Choose a supported adjustment type and direction." }, { status: 400 });
    }
    if (type === "refund" && direction !== "out") return NextResponse.json({ error: "Refunds must be outgoing." }, { status: 400 });
    if (reason.length < 5) return NextResponse.json({ error: "A financial adjustment reason is required." }, { status: 400 });
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
    let amountMinor: number;
    try { amountMinor = toMinorUnits(body.amount, group.currency); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid amount." }, { status: 400 }); }

    const memberId = body.memberId ? String(body.memberId) : "";
    const roundId = body.roundId ? String(body.roundId) : "";
    if (memberId && !Types.ObjectId.isValid(memberId)) return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    if (roundId && !Types.ObjectId.isValid(roundId)) return NextResponse.json({ error: "Invalid round id." }, { status: 400 });
    if (memberId && !(await ChamaMemberModel.exists({ _id: memberId, groupId }))) {
      return NextResponse.json({ error: "Member does not belong to this group." }, { status: 404 });
    }
    if (roundId && !(await ChamaRoundModel.exists({ _id: roundId, groupId }))) {
      return NextResponse.json({ error: "Round does not belong to this group." }, { status: 404 });
    }
    const transactionDate = body.transactionDate ? new Date(body.transactionDate) : new Date();
    if (Number.isNaN(transactionDate.getTime())) return NextResponse.json({ error: "Invalid transaction date." }, { status: 400 });

    const result = await runInFinancialTransaction(async (session) => {
      const existing = await ChamaFinancialTransactionModel.findOne({ groupId, idempotencyKey }).session(session).lean();
      if (existing) {
        if (
          existing.type !== type || existing.direction !== direction || existing.amountMinor !== amountMinor ||
          String(existing.memberId ?? "") !== memberId || String(existing.roundId ?? "") !== roundId ||
          existing.correctionReason !== reason
        ) throw new Error("IDEMPOTENCY_KEY_REUSED");
        return { id: String(existing._id), status: existing.status, replayed: true };
      }
      const [transaction] = await ChamaFinancialTransactionModel.create([{
        groupId: new Types.ObjectId(groupId),
        type,
        direction,
        amountMinor,
        currency: group.currency,
        memberId: memberId ? new Types.ObjectId(memberId) : null,
        roundId: roundId ? new Types.ObjectId(roundId) : null,
        recordedBy: user.id,
        method: String(body.method ?? "manual").trim().slice(0, 50),
        reference: String(body.reference ?? "").trim().slice(0, 120),
        transactionDate,
        status: "verified",
        verifiedBy: user.id,
        verifiedAt: new Date(),
        idempotencyKey,
        description: String(body.description ?? "").trim().slice(0, 500),
        correctionReason: reason,
        evidenceReference: String(body.evidenceReference ?? "").trim().slice(0, 500),
      }], { session });
      await writeFinanceAudit({
        groupId,
        actorId: user.id,
        action: type === "refund" ? "refund.recorded" : "adjustment.recorded",
        entityType: "financial_transaction",
        entityId: String(transaction._id),
        reason,
        newValues: { type, direction, amountMinor, currency: group.currency, memberId, roundId },
      }, session);
      return { id: String(transaction._id), status: transaction.status, replayed: false };
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
      return NextResponse.json({ error: "This idempotency key was already used for a different adjustment." }, { status: 409 });
    }
    if (error instanceof Error && /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) {
      return NextResponse.json({ error: "Financial writes require MongoDB replica-set or sharded-cluster transaction support." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to record financial adjustment." }, { status: 500 });
  }
}
