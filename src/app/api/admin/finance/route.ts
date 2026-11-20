import { NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import { parsePageParams, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function csvCell(value: unknown) {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("finance.read");
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  const { page, pageSize, skip } = parsePageParams(params, 50);
  const filter: Record<string, unknown> = {};
  const type = params.get("type");
  if (type && ["contribution", "payout", "refund", "adjustment", "reversal"].includes(type)) filter.type = type;
  const status = params.get("status");
  if (status && ["pending_verification", "verified", "pending_transfer", "transferred", "confirmed", "failed", "reversed", "legacy_unverified"].includes(status)) filter.status = status;
  const currency = params.get("currency")?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) filter.currency = currency;
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    const transactionDate: Record<string, Date> = {};
    if (from && !Number.isNaN(new Date(from).getTime())) transactionDate.$gte = new Date(from);
    if (to && !Number.isNaN(new Date(to).getTime())) transactionDate.$lt = new Date(to);
    if (Object.keys(transactionDate).length) filter.transactionDate = transactionDate;
  }
  const minRaw = params.get("minMinor");
  const maxRaw = params.get("maxMinor");
  const minMinor = minRaw === null ? NaN : Number(minRaw);
  const maxMinor = maxRaw === null ? NaN : Number(maxRaw);
  if ((Number.isFinite(minMinor) && minMinor >= 0) || (Number.isFinite(maxMinor) && maxMinor >= 0)) {
    const amountMinor: Record<string, number> = {};
    if (Number.isFinite(minMinor) && minMinor >= 0) amountMinor.$gte = minMinor;
    if (Number.isFinite(maxMinor) && maxMinor >= 0) amountMinor.$lte = maxMinor;
    filter.amountMinor = amountMinor;
  }

  const db = await connectToDatabase();
  const search = params.get("search")?.trim().slice(0, 120);
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    const [matchedGroups, matchedMembers] = await Promise.all([
      db.collection("chamagroups").find({ name: expression }, { projection: { _id: 1 } }).limit(500).toArray(),
      db.collection("chamamembers").find({ $or: [{ name: expression }, { email: expression }, { userId: expression }] }, { projection: { _id: 1 } }).limit(500).toArray(),
    ]);
    const alternatives: Record<string, unknown>[] = [{ reference: expression }];
    if (Types.ObjectId.isValid(search)) alternatives.push({ _id: new Types.ObjectId(search) });
    if (matchedGroups.length) alternatives.push({ groupId: { $in: matchedGroups.map((group) => group._id) } });
    if (matchedMembers.length) alternatives.push({ memberId: { $in: matchedMembers.map((member) => member._id) } });
    filter.$or = alternatives;
  }
  const transactions = db.collection("chamafinancialtransactions");
  const [total, rows] = await Promise.all([
    transactions.countDocuments(filter),
    transactions.find(filter, { projection: { groupId: 1, type: 1, direction: 1, amountMinor: 1, legacyAmountMajor: 1, currency: 1, memberId: 1, recordedBy: 1, reference: 1, method: 1, transactionDate: 1, status: 1, verifiedBy: 1, confirmedBy: 1, reversalOf: 1, legacy: 1 } })
      .sort({ transactionDate: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  const groups = await db.collection("chamagroups").find({ _id: { $in: rows.map((row) => row.groupId) } }, { projection: { name: 1 } }).toArray();
  const groupMap = new Map(groups.map((group) => [String(group._id), group.name ?? "Group"]));
  const items = rows.map((row) => ({
    id: String(row._id), groupId: String(row.groupId), groupName: groupMap.get(String(row.groupId)) ?? "Group",
    type: row.type, direction: row.direction, amountMinor: row.amountMinor ?? null,
    legacyAmountMajor: row.legacyAmountMajor ?? null, currency: row.currency, memberId: row.memberId ? String(row.memberId) : null,
    recordedBy: row.recordedBy, reference: row.reference ?? "", method: row.method ?? "manual",
    transactionDate: row.transactionDate, status: row.status, verifiedBy: row.verifiedBy ?? null,
    confirmedBy: row.confirmedBy ?? null, reversalOf: row.reversalOf ? String(row.reversalOf) : null, legacy: row.legacy === true,
  }));
  if (params.get("format") === "csv") {
    const header = ["id", "groupId", "groupName", "type", "direction", "amountMinor", "legacyAmountMajor", "currency", "memberId", "recordedBy", "reference", "method", "transactionDate", "status", "verifiedBy", "confirmedBy", "reversalOf", "legacy"];
    const body = [header, ...items.map((item) => header.map((key) => item[key as keyof typeof item]))]
      .map((row) => row.map(csvCell).join(",")).join("\r\n");
    await writeAdminAudit({ actor: access.session, action: "report.exported", entityType: "financial_transactions", entityId: "filtered", request, metadata: { count: items.length, total } });
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=chamapulse-financial-transactions.csv", "Cache-Control": "no-store" } });
  }
  const aggregate = await transactions.aggregate([
    { $match: filter },
    { $group: { _id: { type: "$type", status: "$status", currency: "$currency" }, count: { $sum: 1 }, amountMinor: { $sum: { $ifNull: ["$amountMinor", 0] } } } },
    { $sort: { "_id.currency": 1, "_id.type": 1, "_id.status": 1 } },
  ]).toArray();
  return NextResponse.json({ items, total, page, pageSize, summaries: aggregate.map((row) => ({ ...row._id, count: row.count, amountMinor: row.amountMinor })) });
}
