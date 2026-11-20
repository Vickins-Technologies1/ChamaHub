import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { getMaintenanceSettings } from "@/lib/platform/config";
import { checkSameOrigin, enforceAdminRateLimit, isSuperAdmin, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireAdminPermission("system.read");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "maintenance-settings-read", limit: 60 });
  if (limited) return limited;
  return NextResponse.json(await getMaintenanceSettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("system.settings.write");
  if (access.response) return access.response;
  if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only the Super Admin can change maintenance controls." }, { status: 403 });
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "maintenance-settings", limit: 10 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.enabled !== "boolean" || typeof body.announcement !== "string" || body.announcement.trim().length < 10 || body.announcement.length > 1000) {
    return NextResponse.json({ error: "Provide the maintenance state and an announcement of 10 to 1,000 characters." }, { status: 400 });
  }
  const routes = Array.isArray(body.affectedRoutes) ? Array.from(new Set(body.affectedRoutes.map(String).map((route) => route.trim()).filter((route) => route.startsWith("/") && !route.includes("..") && route.length <= 150))).slice(0, 30) : [];
  if (routes.length === 0) return NextResponse.json({ error: "Choose at least one affected route prefix." }, { status: 400 });
  let expectedRestorationAt: Date | null = null;
  if (body.expectedRestorationAt) {
    expectedRestorationAt = new Date(String(body.expectedRestorationAt));
    if (Number.isNaN(expectedRestorationAt.getTime())) return NextResponse.json({ error: "The restoration time is invalid." }, { status: 400 });
  }
  const db = await connectToDatabase();
  const settings = db.collection<{ _id: string; [key: string]: unknown }>("platform_settings");
  const before = await settings.findOne({ _id: "maintenance" });
  const now = new Date();
  const after = { _id: "maintenance", enabled: body.enabled, announcement: body.announcement.trim(), expectedRestorationAt, affectedRoutes: routes, exemptAdmins: body.exemptAdmins !== false, updatedBy: access.session.user.id, updatedAt: now };
  await settings.updateOne({ _id: "maintenance" }, { $set: after }, { upsert: true });
  await writeAdminAudit({ actor: access.session, action: body.enabled ? "maintenance.enabled" : "maintenance.disabled", entityType: "platform_setting", entityId: "maintenance", request, before, after: { enabled: after.enabled, announcement: after.announcement, expectedRestorationAt, affectedRoutes: routes, exemptAdmins: after.exemptAdmins } });
  return NextResponse.json({ ok: true, ...after });
}
