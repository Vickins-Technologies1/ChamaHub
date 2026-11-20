import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { parsePageParams, requireAdminPermission } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("groups.read");
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  const { page, pageSize, skip } = parsePageParams(params);
  const clauses: Record<string, unknown>[] = [];
  const search = params.get("search")?.trim().slice(0, 120);
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    clauses.push({ $or: [{ name: expression }, { createdBy: expression }, { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: escapeRegex(search), options: "i" } } }] });
  }
  const status = params.get("status");
  if (status === "active" || status === "archived") clauses.push({ status });
  const filter = clauses.length ? { $and: clauses } : {};
  const db = await connectToDatabase();
  const groups = db.collection("chamagroups");
  const [total, rows] = await Promise.all([
    groups.countDocuments(filter),
    groups.find(filter, { projection: { name: 1, description: 1, contributionAmount: 1, frequency: 1, numberOfMembers: 1, expectedMemberCount: 1, startDate: 1, currency: 1, createdBy: 1, status: 1, createdAt: 1, archivedAt: 1 } })
      .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  const groupIds = rows.map((group) => group._id);
  const [memberRows, roundRows, transactionRows] = await Promise.all([
    db.collection("chamamembers").aggregate([
      { $match: { groupId: { $in: groupIds }, status: { $ne: "rejected" } } },
      { $group: { _id: "$groupId", memberCount: { $sum: 1 }, activeMembers: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } } } },
    ]).toArray(),
    db.collection("chamarounds").find({ groupId: { $in: groupIds }, status: "open" }, { projection: { groupId: 1, roundNumber: 1, dueDate: 1, potAmount: 1 } }).toArray(),
    db.collection("chamafinancialtransactions").aggregate([
      { $match: { groupId: { $in: groupIds }, type: "contribution", status: "verified", amountMinor: { $type: "number" } } },
      { $group: { _id: { groupId: "$groupId", currency: "$currency" }, count: { $sum: 1 }, amountMinor: { $sum: "$amountMinor" }, lastAt: { $max: "$transactionDate" } } },
    ]).toArray(),
  ]);
  const memberMap = new Map(memberRows.map((row) => [String(row._id), row]));
  const roundMap = new Map(roundRows.map((row) => [String(row.groupId), row]));
  const transactionMap = new Map(transactionRows.map((row) => [`${String(row._id.groupId)}:${row._id.currency}`, row]));
  const items = rows.map((group) => {
    const members = memberMap.get(String(group._id));
    const round = roundMap.get(String(group._id));
    const tx = transactionMap.get(`${String(group._id)}:${group.currency}`);
    return {
      id: String(group._id),
      name: group.name ?? "",
      status: group.status ?? "active",
      currency: group.currency ?? "KES",
      contributionAmount: group.contributionAmount ?? null,
      frequency: group.frequency ?? "",
      membersCount: members?.memberCount ?? 0,
      activeMembers: members?.activeMembers ?? 0,
      createdBy: group.createdBy ?? "",
      createdAt: group.createdAt ?? null,
      archivedAt: group.archivedAt ?? null,
      openRound: round ? { number: round.roundNumber, dueDate: round.dueDate ?? null, potAmount: round.potAmount ?? null } : null,
      verifiedContributionCount: tx?.count ?? 0,
      verifiedContributionAmountMinor: tx?.amountMinor ?? 0,
      lastContributionAt: tx?.lastAt ?? null,
    };
  });
  return NextResponse.json({ items, total, page, pageSize });
}
