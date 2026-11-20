import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { enforceAdminRateLimit, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";
const timezone = "Africa/Nairobi";

function parseRange(url: URL) {
  const now = new Date();
  const toParam = url.searchParams.get("to");
  const fromParam = url.searchParams.get("from");
  const to = toParam ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam + "T23:59:59.999+03:00" : toParam) : now;
  const from = fromParam ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam + "T00:00:00.000+03:00" : fromParam) : new Date(now.getTime() - 89 * 24 * 60 * 60_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  const maxRange = 730 * 24 * 60 * 60_000;
  if (to.getTime() - from.getTime() > maxRange) return null;
  const daily = to.getTime() - from.getTime() <= 180 * 24 * 60 * 60_000;
  const format = daily ? "%Y-%m-%d" : "%Y-%m";
  return { from, to, daily, format };
}

function buckets(from: Date, to: Date, daily: boolean) {
  const values: string[] = [];
  const cursor = new Date(from.getTime() + 3 * 60 * 60_000);
  cursor.setUTCHours(0, 0, 0, 0);
  if (!daily) cursor.setUTCDate(1);
  const end = new Date(to.getTime() + 3 * 60 * 60_000);
  end.setUTCHours(0, 0, 0, 0);
  if (!daily) end.setUTCDate(1);
  while (cursor <= end && values.length < 740) {
    values.push(daily ? cursor.toISOString().slice(0, 10) : cursor.toISOString().slice(0, 7));
    if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return values;
}

async function timeCounts(db: Awaited<ReturnType<typeof connectToDatabase>>, collection: string, dateField: string, from: Date, to: Date, format: string) {
  return db.collection(collection).aggregate([
    { $match: { [dateField]: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateToString: { format, date: "$" + dateField, timezone } }, count: { $sum: 1 } } },
  ]).toArray();
}

function toSeries(keys: string[], rows: Array<{ _id: string; count: number }>) {
  const byKey = new Map(rows.map((row) => [row._id, row.count]));
  return keys.map((date) => ({ date, count: byKey.get(date) ?? 0 }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isCsv = url.searchParams.get("format") === "csv";
  const access = await requireAdminPermission(isCsv ? "reports.export" : "analytics.read");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: isCsv ? "analytics-export" : "analytics-read", limit: isCsv ? 10 : 60 });
  if (limited) return limited;
  const range = parseRange(url);
  if (!range) return NextResponse.json({ error: "Choose a valid date range no longer than two years." }, { status: 400 });
  const db = await connectToDatabase();
  const start = range.from.getTime();
  const duration = range.to.getTime() - start;
  const previousTo = new Date(start - 1);
  const previousFrom = new Date(start - duration - 1);
  const keys = buckets(range.from, range.to, range.daily);
  const [users, groups, members, previousUsers, previousGroups, previousMembers, financial, staff, support, totals] = await Promise.all([
    timeCounts(db, "user", "createdAt", range.from, range.to, range.format),
    timeCounts(db, "chamagroups", "createdAt", range.from, range.to, range.format),
    timeCounts(db, "chamamembers", "joinedAt", range.from, range.to, range.format),
    timeCounts(db, "user", "createdAt", previousFrom, previousTo, range.format),
    timeCounts(db, "chamagroups", "createdAt", previousFrom, previousTo, range.format),
    timeCounts(db, "chamamembers", "joinedAt", previousFrom, previousTo, range.format),
    db.collection("chamafinancialtransactions").aggregate([
      { $match: { transactionDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { currency: "$currency", type: "$type", status: "$status" }, count: { $sum: 1 }, amountMinor: { $sum: { $ifNull: ["$amountMinor", 0] } } } },
      { $sort: { "_id.currency": 1, "_id.type": 1, "_id.status": 1 } },
    ]).toArray(),
    db.collection("admin_audit").aggregate([
      { $match: { occurredAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { bucket: { $dateToString: { format: range.format, date: "$occurredAt", timezone } }, role: "$actorRole", action: "$action" }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection("admin_support_tickets").aggregate([
      { $match: { resolvedAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: null, resolved: { $sum: 1 }, averageResolutionMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } } } },
    ]).toArray(),
    Promise.all([
      db.collection("user").countDocuments({ createdAt: { $gte: range.from, $lte: range.to } }),
      db.collection("chamagroups").countDocuments({ createdAt: { $gte: range.from, $lte: range.to } }),
      db.collection("chamamembers").countDocuments({ joinedAt: { $gte: range.from, $lte: range.to }, status: "active" }),
      db.collection("user").countDocuments({ createdAt: { $gte: previousFrom, $lte: previousTo } }),
      db.collection("chamagroups").countDocuments({ createdAt: { $gte: previousFrom, $lte: previousTo } }),
      db.collection("chamamembers").countDocuments({ joinedAt: { $gte: previousFrom, $lte: previousTo }, status: "active" }),
    ]),
  ]);
  const staffActivity = staff.map((row) => ({ date: row._id.bucket, role: row._id.role, action: row._id.action, count: row.count }));
  const finance = financial.map((row) => ({ currency: row._id.currency ?? "Unknown", type: row._id.type ?? "unknown", status: row._id.status ?? "unknown", count: row.count, amountMinor: row.amountMinor }));
  const financeSummary = new Map<string, { currency: string; recordedContributionsMinor: number; verifiedContributionsMinor: number; recordedPayoutsMinor: number; confirmedPayoutsMinor: number }>();
  for (const row of finance) {
    const summary = financeSummary.get(row.currency) ?? { currency: row.currency, recordedContributionsMinor: 0, verifiedContributionsMinor: 0, recordedPayoutsMinor: 0, confirmedPayoutsMinor: 0 };
    if (row.type === "contribution") {
      summary.recordedContributionsMinor += Number(row.amountMinor ?? 0);
      if (row.status === "verified") summary.verifiedContributionsMinor += Number(row.amountMinor ?? 0);
    }
    if (row.type === "payout") {
      summary.recordedPayoutsMinor += Number(row.amountMinor ?? 0);
      if (row.status === "confirmed") summary.confirmedPayoutsMinor += Number(row.amountMinor ?? 0);
    }
    financeSummary.set(row.currency, summary);
  }
  const summary = {
    usersAcquired: totals[0], previousUsersAcquired: totals[3],
    groupsCreated: totals[1], previousGroupsCreated: totals[4],
    activeMemberJoins: totals[2], previousActiveMemberJoins: totals[5],
    resolvedTickets: support[0]?.resolved ?? 0,
    averageResolutionHours: support[0]?.averageResolutionMs ? Math.round(support[0].averageResolutionMs / 3_600_000 * 10) / 10 : null,
  };
  const analytics = {
    range: { from: range.from, to: range.to, timezone, granularity: range.daily ? "day" : "month" },
    summary,
    growth: {
      userAcquisitions: toSeries(keys, users as Array<{ _id: string; count: number }>),
      newGroups: toSeries(keys, groups as Array<{ _id: string; count: number }>),
      activeMemberJoins: toSeries(keys, members as Array<{ _id: string; count: number }>),
    },
    finance,
    financeSummary: Array.from(financeSummary.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
    operations: { staffActivity, supportResolution: { resolvedTickets: summary.resolvedTickets, averageResolutionHours: summary.averageResolutionHours } },
    availability: {
      activeUsers: "not available: the current app does not persist user activity events",
      retention: "not available: account sign-in and activity history are not stored",
      featureAdoption: "not available: feature usage events are not stored",
      systemErrors: "not available: application and background-job failures are not persisted",
      subscriptionRevenue: "not available: no subscription or billing records exist",
      platformCashHeld: "not available: ChamaPulse ledger records are not platform-held funds",
    },
  };
  if (isCsv) {
    const rows = ["series,date,count,currency,type,status,amount_minor"];
    for (const row of analytics.growth.userAcquisitions) rows.push(["user_acquisitions", row.date, row.count, "", "", "", ""].join(","));
    for (const row of analytics.growth.newGroups) rows.push(["new_groups", row.date, row.count, "", "", "", ""].join(","));
    for (const row of analytics.growth.activeMemberJoins) rows.push(["active_member_joins", row.date, row.count, "", "", "", ""].join(","));
    for (const row of finance) rows.push(["ledger_activity", "", row.count, row.currency, row.type, row.status, row.amountMinor].map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(","));
    await writeAdminAudit({ actor: access.session, action: "analytics.exported", entityType: "analytics_report", entityId: range.from.toISOString() + "/" + range.to.toISOString(), request, metadata: { from: range.from, to: range.to, rows: rows.length - 1 } });
    return new Response(rows.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=chamapulse-analytics.csv", "Cache-Control": "no-store" } });
  }
  return NextResponse.json(analytics, { headers: { "Cache-Control": "no-store" } });
}
