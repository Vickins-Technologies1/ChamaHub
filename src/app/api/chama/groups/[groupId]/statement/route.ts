import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { Types } from "mongoose";
import FinancialStatementPdf, { type FinancialStatementEntry } from "@/components/chama/FinancialStatementPdf";
import { connectMongoose } from "@/lib/mongoose";
import ChamaContributionModel from "@/lib/models/chama-contribution";
import ChamaFinancialAuditModel from "@/lib/models/chama-financial-audit";
import ChamaFinancialTransactionModel from "@/lib/models/chama-financial-transaction";
import ChamaGroupModel from "@/lib/models/chama-group";
import ChamaMemberModel from "@/lib/models/chama-member";
import ChamaReconciliationModel from "@/lib/models/chama-reconciliation";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";
import { toMinorUnits } from "@/lib/finance/money";
import { ensureFinanceIndexes, writeFinanceAudit } from "@/lib/finance/service";

type Params = { params: Promise<{ groupId: string }> };
const MAX_STATEMENT_ENTRIES = 20_000;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    await ensureFinanceIndexes();
    const siteAdmin = isSiteAdmin(user);
    const member = await getGroupMember(groupId, user);
    if (!siteAdmin && !member) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    const canReview = siteAdmin || hasGroupRole(member, ["admin", "treasurer"]);
    const group = await ChamaGroupModel.findById(groupId).lean();
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const memberFilter = searchParams.get("memberId");
    const roundFilter = searchParams.get("roundId");
    const typeFilter = searchParams.get("type");
    const methodFilter = searchParams.get("method");
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo
      ? /^\d{4}-\d{2}-\d{2}$/.test(dateTo)
        ? new Date(`${dateTo}T23:59:59.999Z`)
        : new Date(dateTo)
      : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
      return NextResponse.json({ error: "Invalid statement date range." }, { status: 400 });
    }
    if (memberFilter && !Types.ObjectId.isValid(memberFilter)) return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    if (roundFilter && !Types.ObjectId.isValid(roundFilter)) return NextResponse.json({ error: "Invalid round id." }, { status: 400 });
    const effectiveMemberId = canReview ? memberFilter : String(member?._id);
    const query: Record<string, unknown> = { groupId: new Types.ObjectId(groupId) };
    if (effectiveMemberId) query.memberId = new Types.ObjectId(effectiveMemberId);
    if (roundFilter) query.roundId = new Types.ObjectId(roundFilter);
    if (typeFilter) {
      if (!["contribution", "payout", "refund", "adjustment", "reversal"].includes(typeFilter)) {
        return NextResponse.json({ error: "Invalid transaction type." }, { status: 400 });
      }
      query.type = typeFilter;
    }
    if (methodFilter) query.method = methodFilter.slice(0, 50);
    if (from || to) query.transactionDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

    const count = await ChamaFinancialTransactionModel.countDocuments(query);
    if (count > MAX_STATEMENT_ENTRIES) {
      return NextResponse.json({
        error: `This statement has ${count.toLocaleString()} records, above the ${MAX_STATEMENT_ENTRIES.toLocaleString()} record PDF limit. Narrow the date range or filters; no records were omitted from a generated statement.`,
      }, { status: 413 });
    }
    const transactions = await ChamaFinancialTransactionModel.find(query)
      .sort({ transactionDate: 1, _id: 1 })
      .limit(MAX_STATEMENT_ENTRIES + 1)
      .lean();
    const legacyQuery: Record<string, unknown> = {
      groupId: new Types.ObjectId(groupId),
      $or: [{ financialTransactionId: null }, { financialTransactionId: { $exists: false } }],
    };
    if (effectiveMemberId) legacyQuery.memberId = new Types.ObjectId(effectiveMemberId);
    if (roundFilter) legacyQuery.roundId = new Types.ObjectId(roundFilter);
    if (typeFilter && typeFilter !== "contribution") legacyQuery._id = { $in: [] };
    if (methodFilter) legacyQuery.method = methodFilter.slice(0, 50);
    if (from || to) legacyQuery.paidAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const legacyCount = typeFilter && typeFilter !== "contribution" ? 0 : await ChamaContributionModel.countDocuments(legacyQuery);
    if (count + legacyCount > MAX_STATEMENT_ENTRIES) {
      return NextResponse.json({ error: "The complete statement exceeds the PDF limit. Narrow the date range or filters; no partial export was created." }, { status: 413 });
    }
    const legacy = legacyCount
      ? await ChamaContributionModel.find(legacyQuery).sort({ paidAt: 1, _id: 1 }).lean()
      : [];
    const memberIds = [...new Set([...transactions, ...legacy].filter((item) => item.memberId).map((item) => String(item.memberId)))];
    const members = memberIds.length ? await ChamaMemberModel.find({ _id: { $in: memberIds } }).lean() : [];
    const memberMap = new Map(members.map((item) => [String(item._id), item.name || item.email || "Member"]));
    const entries: FinancialStatementEntry[] = [
      ...transactions.map((item) => ({
        id: String(item._id),
        type: item.type,
        status: item.status,
        direction: item.direction,
        amountMinor: item.amountMinor ?? null,
        legacyAmountMajor: item.legacyAmountMajor ?? null,
        currency: item.currency,
        memberName: item.memberId ? memberMap.get(String(item.memberId)) ?? "Member" : "Group",
        reference: item.reference ?? "",
        method: item.method ?? "",
        transactionDate: item.transactionDate.toISOString(),
        description: item.description ?? "",
      })),
      ...legacy.map((item) => ({
        id: String(item._id),
        type: "contribution",
        status: item.status === "pending" ? "pending_verification" : "legacy_unverified",
        direction: "in",
        amountMinor: (() => {
          try { return toMinorUnits(item.amount, group.currency ?? "KES"); } catch { return null; }
        })(),
        legacyAmountMajor: item.amount,
        currency: group.currency ?? "KES",
        memberName: memberMap.get(String(item.memberId)) ?? "Member",
        reference: item.reference ?? "",
        method: item.method ?? "manual",
        transactionDate: (item.paidAt ?? item.createdAt ?? new Date(0)).toISOString(),
        description: "Historical record awaiting finance migration/review.",
      })),
    ].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id));
    const periodStart = from ?? (entries[0] ? new Date(entries[0].transactionDate) : new Date(0));
    const periodEnd = to ?? (entries.at(-1) ? new Date(entries.at(-1)!.transactionDate) : new Date());
    const reconciliation = await ChamaReconciliationModel.findOne({
      groupId: new Types.ObjectId(groupId),
      periodStart,
      periodEnd,
      status: "matched",
    }).sort({ createdAt: -1 }).lean();
    const generatedAt = new Date();
    const statementReference = `CH-${groupId.slice(-6).toUpperCase()}-${generatedAt.getTime().toString(36).toUpperCase()}`;
    const document = createElement(FinancialStatementPdf, {
      groupName: group.name,
      groupId,
      statementReference,
      periodLabel: `${periodStart.toLocaleDateString("en-KE")} — ${periodEnd.toLocaleDateString("en-KE")}`,
      generatedAt: generatedAt.toISOString(),
      entries,
      reconciliationStatus: reconciliation?.status ?? "not reconciled",
    }) as unknown as ReactElement<DocumentProps>;
    const pdf = await renderToBuffer(document);
    await ChamaFinancialAuditModel.create({
      groupId: new Types.ObjectId(groupId),
      actorId: user.id,
      action: "statement.exported",
      entityType: "statement",
      entityId: statementReference,
      occurredAt: generatedAt,
      reason: "Server-generated financial activity statement.",
      newValues: { entries: entries.length, periodStart, periodEnd, reconciliationStatus: reconciliation?.status ?? "not reconciled" },
    });
    const filename = `chamahub-statement-${groupId.slice(-6)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to generate financial statement." }, { status: 500 });
  }
}
