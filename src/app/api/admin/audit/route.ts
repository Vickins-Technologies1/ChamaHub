import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { parsePageParams, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("audit.read");
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  const { page, pageSize, skip } = parsePageParams(params, 50);
  const filter: Record<string, unknown> = {};
  for (const field of ["action", "entityType", "actorId"]) {
    const value = params.get(field)?.trim().slice(0, 120);
    if (value) filter[field] = field === "action" || field === "entityType" ? { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } : value;
  }
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    const occurredAt: Record<string, Date> = {};
    if (from && !Number.isNaN(new Date(from).getTime())) occurredAt.$gte = new Date(from);
    if (to && !Number.isNaN(new Date(to).getTime())) occurredAt.$lt = new Date(to);
    if (Object.keys(occurredAt).length) filter.occurredAt = occurredAt;
  }
  const collection = (await connectToDatabase()).collection("admin_audit");
  const [total, records] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  const items = records.map((record) => ({
    id: String(record._id), actorId: record.actorId, actorRole: record.actorRole, action: record.action,
    entityType: record.entityType, entityId: record.entityId, occurredAt: record.occurredAt,
    ipAddress: record.ipAddress ?? null, before: record.before ?? null, after: record.after ?? null,
    metadata: record.metadata ?? null, impersonation: record.impersonation ?? null,
  }));
  if (params.get("format") === "csv") {
    const columns = ["id", "actorId", "actorRole", "action", "entityType", "entityId", "occurredAt", "ipAddress", "before", "after", "metadata", "impersonation"] as const;
    const csv = [columns, ...items.map((item) => columns.map((column) => item[column]))].map((line) => line.map(csvCell).join(",")).join("\r\n");
    await writeAdminAudit({ actor: access.session, action: "report.exported", entityType: "admin_audit", entityId: "filtered", request, metadata: { count: items.length, total } });
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=chamapulse-admin-audit.csv", "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ items, total, page, pageSize });
}
