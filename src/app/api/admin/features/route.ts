import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { FEATURE_REGISTRY } from "@/lib/platform/config";
import { checkSameOrigin, enforceAdminRateLimit, isSuperAdmin, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireAdminPermission("system.read");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "feature-flags-read", limit: 60 });
  if (limited) return limited;
  const db = await connectToDatabase();
  const [stored, history] = await Promise.all([
    db.collection("platform_feature_flags").find({}).toArray(),
    db.collection("platform_feature_flag_history").find({}).sort({ changedAt: -1 }).limit(100).toArray(),
  ]);
  const byKey = new Map(stored.map((item) => [String(item.key), item]));
  return NextResponse.json({
    flags: FEATURE_REGISTRY.map((definition) => {
      const value = byKey.get(definition.key);
      return { ...definition, enabled: typeof value?.enabled === "boolean" ? value.enabled : definition.enabledByDefault, lastModifiedBy: value?.updatedBy ?? null, lastModifiedAt: value?.updatedAt ?? null };
    }),
    history: history.map((item) => ({ ...item, id: String(item._id), _id: undefined })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("features.write");
  if (access.response) return access.response;
  if (!isSuperAdmin(access.session.grant)) return NextResponse.json({ error: "Only the Super Admin can change feature flags." }, { status: 403 });
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "feature-flag", limit: 20 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as { key?: unknown; enabled?: unknown };
  const definition = FEATURE_REGISTRY.find((item) => item.key === body.key);
  if (!definition || typeof body.enabled !== "boolean") return NextResponse.json({ error: "Provide a registered feature key and a boolean state." }, { status: 400 });
  const db = await connectToDatabase();
  const current = await db.collection("platform_feature_flags").findOne({ key: definition.key });
  const now = new Date();
  const next = { key: definition.key, enabled: body.enabled, updatedBy: access.session.user.id, updatedAt: now, description: definition.description };
  await db.collection("platform_feature_flags").updateOne({ key: definition.key }, { $set: next }, { upsert: true });
  await db.collection("platform_feature_flag_history").insertOne({ key: definition.key, before: typeof current?.enabled === "boolean" ? current.enabled : definition.enabledByDefault, after: body.enabled, changedBy: access.session.user.id, changedAt: now });
  await writeAdminAudit({ actor: access.session, action: "feature_flag.changed", entityType: "feature_flag", entityId: definition.key, request, before: { enabled: current?.enabled ?? definition.enabledByDefault }, after: { enabled: body.enabled } });
  return NextResponse.json({ ok: true, key: definition.key, enabled: body.enabled, updatedAt: now });
}
