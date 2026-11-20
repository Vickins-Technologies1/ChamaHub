import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { requireAdminPermission } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

function readDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("dashboard.read");
  if (access.response) return access.response;

  const params = new URL(request.url).searchParams;
  const now = new Date();
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  const from = readDate(params.get("from"), defaultFrom);
  const to = readDate(params.get("to"), defaultTo);
  if (!from || !to || from >= to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Choose a valid date range of at most 366 days." }, { status: 400 });
  }

  const duration = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - duration);
  const previousTo = from;
  const db = await connectToDatabase();
  const users = db.collection("user");
  const groups = db.collection("chamagroups");
  const members = db.collection("chamamembers");
  const transactions = db.collection("chamafinancialtransactions");
  const dateRange = { $gte: from, $lt: to };
  const previousRange = { $gte: previousFrom, $lt: previousTo };

  const [
    totalUsers,
    newUsers,
    previousNewUsers,
    suspendedUsers,
    totalGroups,
    activeGroups,
    archivedGroups,
    newGroups,
    previousNewGroups,
    totalMembers,
    activeMembers,
    openRounds,
    contributionRows,
    payoutRows,
    registrationTrend,
    groupTrend,
    transactionTrend,
    latestUsers,
    latestGroups,
    latestTransactions,
  ] = await Promise.all([
    users.countDocuments(),
    users.countDocuments({ createdAt: dateRange }),
    users.countDocuments({ createdAt: previousRange }),
    users.countDocuments({ $or: [{ status: "suspended" }, { banned: true }] }),
    db.collection("chamagroups").countDocuments(),
    db.collection("chamagroups").countDocuments({ status: "active" }),
    db.collection("chamagroups").countDocuments({ status: "archived" }),
    db.collection("chamagroups").countDocuments({ createdAt: dateRange }),
    db.collection("chamagroups").countDocuments({ createdAt: previousRange }),
    members.countDocuments({ status: { $ne: "rejected" } }),
    members.countDocuments({ status: "active" }),
    db.collection("chamarounds").countDocuments({ status: "open" }),
    transactions.aggregate([
      { $match: { type: "contribution", transactionDate: dateRange } },
      { $group: { _id: { currency: "$currency", status: "$status" }, count: { $sum: 1 }, amountMinor: { $sum: { $ifNull: ["$amountMinor", 0] } } } },
    ]).toArray(),
    transactions.aggregate([
      { $match: { type: "payout", transactionDate: dateRange } },
      { $group: { _id: { currency: "$currency", status: "$status" }, count: { $sum: 1 }, amountMinor: { $sum: { $ifNull: ["$amountMinor", 0] } } } },
    ]).toArray(),
    users.aggregate([
      { $match: { createdAt: dateRange } },
      { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    db.collection("chamagroups").aggregate([
      { $match: { createdAt: dateRange } },
      { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "UTC" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    transactions.aggregate([
      { $match: { transactionDate: dateRange } },
      { $group: { _id: { day: { $dateToString: { date: "$transactionDate", format: "%Y-%m-%d", timezone: "UTC" } }, type: "$type" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    users.find({}, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(5).toArray(),
    db.collection("chamagroups").find({}, { projection: { name: 1, status: 1, createdAt: 1, currency: 1 } }).sort({ createdAt: -1 }).limit(5).toArray(),
    transactions.find({}, { projection: { groupId: 1, type: 1, direction: 1, amountMinor: 1, currency: 1, status: 1, reference: 1, transactionDate: 1 } }).sort({ transactionDate: -1 }).limit(5).toArray(),
  ]);

  const currentRate = previousNewUsers === 0 ? null : Math.round(((newUsers - previousNewUsers) / previousNewUsers) * 1000) / 10;

  const activity = [
    ...latestUsers.map((item) => ({ id: String(item.id ?? item._id), kind: "user", title: item.name || item.email || "New account", detail: item.email ?? "Registered user", occurredAt: item.createdAt ?? null })),
    ...latestGroups.map((item) => ({ id: String(item._id), kind: "group", title: item.name || "Savings group", detail: `${item.status || "active"} group`, occurredAt: item.createdAt ?? null })),
    ...latestTransactions.map((item) => ({ id: String(item._id), kind: "transaction", title: `${item.type} · ${item.status}`, detail: `${item.currency} ${item.amountMinor == null ? "amount review" : item.amountMinor} minor units${item.reference ? ` · ${item.reference}` : ""}`, occurredAt: item.transactionDate ?? null })),
  ].sort((a, b) => new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime()).slice(0, 10);

  return NextResponse.json({
    range: { from, to, previousFrom, previousTo },
    metrics: {
      totalUsers,
      newUsers,
      newUsersChangePercent: currentRate,
      suspendedUsers,
      totalGroups,
      activeGroups,
      archivedGroups,
      newGroups,
      newGroupsChangePercent: previousNewGroups === 0 ? null : Math.round(((newGroups - previousNewGroups) / previousNewGroups) * 1000) / 10,
      totalMembers,
      activeMembers,
      openRounds,
      activeUsers: null,
    },
    financial: {
      contributions: contributionRows.map((row) => ({ currency: row._id.currency, status: row._id.status, count: row.count, amountMinor: row.amountMinor })),
      payouts: payoutRows.map((row) => ({ currency: row._id.currency, status: row._id.status, count: row.count, amountMinor: row.amountMinor })),
    },
    trends: { registrations: registrationTrend, groups: groupTrend, transactions: transactionTrend },
    activity,
    dataAvailability: { subscriptions: false, supportTickets: false, loginHistory: false, paymentGateway: false },
  });
}
