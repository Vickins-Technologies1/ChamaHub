import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { enforceAdminRateLimit, isSuperAdmin, requireAdminPermission } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const access = await requireAdminPermission("staff.read");
  if (access.response) return access.response;
  if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only the Super Admin can review administrative staff history." }, { status: 403 });
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "staff-history-read", limit: 60 });
  if (limited) return limited;
  const { userId } = await context.params;
  const db = await connectToDatabase();
  const [grant, activity, totals, tickets] = await Promise.all([
    db.collection("admin_access").findOne({ userId }, { projection: { userId: 1, email: 1, name: 1, role: 1, permissions: 1, status: 1, expiresAt: 1, createdAt: 1, updatedAt: 1 } }),
    db.collection("admin_audit").find({ actorId: userId }, { projection: { actorRole: 1, action: 1, entityType: 1, entityId: 1, occurredAt: 1, ipAddress: 1, metadata: 1 } }).sort({ occurredAt: -1 }).limit(200).toArray(),
    db.collection("admin_audit").aggregate([
      { $match: { actorId: userId } },
      { $group: {
        _id: null,
        actions: { $sum: 1 },
        usersManaged: { $sum: { $cond: [{ $and: [{ $eq: ["$entityType", "user"] }, { $ne: ["$action", "user.note.added"] }] }, 1, 0] } },
        groupsReviewed: { $sum: { $cond: [{ $eq: ["$action", "group.reviewed"] }, 1, 0] } },
        suspensions: { $sum: { $cond: [{ $eq: ["$action", "user.suspended"] }, 1, 0] } },
      } },
    ]).toArray(),
    db.collection("admin_audit").countDocuments({ actorId: userId, action: { $in: ["support.ticket.resolved", "support.ticket.closed"] } }),
  ]);
  if (!grant) return NextResponse.json({ error: "Administrative grant not found." }, { status: 404 });
  return NextResponse.json({
    staff: { userId, name: grant.name ?? "", email: grant.email ?? "", role: grant.role, permissions: grant.permissions ?? [], status: grant.status, expiresAt: grant.expiresAt ?? null, createdAt: grant.createdAt ?? null, updatedAt: grant.updatedAt ?? null },
    metrics: {
      actions: totals[0]?.actions ?? 0,
      usersManaged: totals[0]?.usersManaged ?? 0,
      groupsReviewed: totals[0]?.groupsReviewed ?? 0,
      ticketsResolved: tickets,
      suspensions: totals[0]?.suspensions ?? 0,
    },
    activity: activity.map((item) => ({ id: String(item._id), actorRole: item.actorRole, action: item.action, entityType: item.entityType, entityId: item.entityId, occurredAt: item.occurredAt, ipAddress: item.ipAddress ?? null, metadata: item.metadata ?? null })),
  }, { headers: { "Cache-Control": "no-store" } });
}
