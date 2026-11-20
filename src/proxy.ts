import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { createHash } from "node:crypto";
import { featureForRequest, isMaintenanceRouteAffected } from "@/lib/platform/policy";

let maintenanceCache: { value: Record<string, unknown> | null; expiresAt: number } | null = null;
let flagCache = new Map<string, { enabled: boolean; expiresAt: number }>();

const authRoutes = ["/auth", "/member-login", "/member-signup", "/moderator-login", "/moderator-signup", "/forgot-password", "/maintenance"];
const alwaysAvailablePrefixes = ["/admin", "/api/admin", "/api/jobs", "/api/webhooks", "/api/payments/callback"];

function isPrefix(path: string, prefix: string) {
  return prefix === "/" || path === prefix || path.startsWith(prefix + "/");
}

async function readMaintenance() {
  if (maintenanceCache && maintenanceCache.expiresAt > Date.now()) return maintenanceCache.value;
  const db = await connectToDatabase();
  const value = await db.collection<{ _id: string; [key: string]: unknown }>("platform_settings").findOne({ _id: "maintenance" });
  maintenanceCache = { value, expiresAt: Date.now() + 5000 };
  return value;
}

async function featureIsEnabled(key: string) {
  const cached = flagCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;
  const db = await connectToDatabase();
  const value = await db.collection("platform_feature_flags").findOne({ key }, { projection: { enabled: 1 } });
  const enabled = typeof value?.enabled === "boolean" ? value.enabled : true;
  flagCache.set(key, { enabled, expiresAt: Date.now() + 5000 });
  return enabled;
}

async function isPlatformAdmin(clerkUserId: string | null) {
  if (!clerkUserId) return false;
  const db = await connectToDatabase();
  const user = await db.collection("user").findOne({ clerkId: clerkUserId }, { projection: { id: 1 } });
  if (typeof user?.id !== "string") return false;
  return Boolean(await db.collection("admin_access").findOne({
    userId: user.id,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }, { projection: { _id: 1 } }));
}

export default clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  const isAuthRoute = authRoutes.some((prefix) => isPrefix(path, prefix));
  const alwaysAvailable = alwaysAvailablePrefixes.some((prefix) => isPrefix(path, prefix)) || /\/(?:callback|webhook)(?:\/|$)/i.test(path);
  const feature = featureForRequest(path, request.method);
  const impersonationToken = request.cookies.get("chp_admin_impersonation")?.value;
  if (impersonationToken && path !== "/admin" && path !== "/api/admin/impersonation") {
    try {
      const authState = await auth();
      const db = await connectToDatabase();
      const actor = authState.userId ? await db.collection("user").findOne({ clerkId: authState.userId }, { projection: { id: 1 } }) : null;
      const session = actor?.id ? await db.collection<{ _id: string }>("admin_impersonation_sessions").findOne({
        _id: createHash("sha256").update(impersonationToken).digest("hex"),
        actorId: String(actor.id),
        status: "active",
        expiresAt: { $gt: new Date() },
      }, { projection: { _id: 1 } }) : null;
      if (session) {
        if (path.startsWith("/api/")) return NextResponse.json({ error: "This request is unavailable during a restricted troubleshooting session." }, { status: 423 });
        return NextResponse.redirect(new URL("/admin", request.url));
      }
    } catch {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "The troubleshooting session could not be verified." }, { status: 503 });
    }
  }

  const backgroundOrCallback = isPrefix(path, "/api/jobs") || isPrefix(path, "/api/webhooks") || /\/(?:callback|webhook)(?:\/|$)/i.test(path);
  if (feature && !backgroundOrCallback && !(await featureIsEnabled(feature))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "This feature is temporarily unavailable.", featureDisabled: feature }, { status: 503 });
    const unavailable = new URL("/feature-unavailable", request.url);
    unavailable.searchParams.set("feature", feature);
    return NextResponse.redirect(unavailable);
  }

  if (isAuthRoute || alwaysAvailable) return;
  let maintenance: Record<string, unknown> | null;
  try {
    maintenance = await readMaintenance();
  } catch {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Platform availability could not be verified." }, { status: 503 });
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }
  if (maintenance?.enabled !== true) return;
  const configuredRoutes = Array.isArray(maintenance.affectedRoutes) ? maintenance.affectedRoutes.filter((item): item is string => typeof item === "string") : ["/"];
  if (!isMaintenanceRouteAffected(path, configuredRoutes)) return;
  const authState = await auth();
  if (maintenance.exemptAdmins !== false && await isPlatformAdmin(authState.userId ?? null)) return;
  if (path.startsWith("/api/")) {
    return NextResponse.json({
      error: typeof maintenance.announcement === "string" ? maintenance.announcement : "ChamaPulse is undergoing scheduled maintenance.",
      maintenance: true,
      expectedRestorationAt: maintenance.expectedRestorationAt ?? null,
    }, { status: 503, headers: { "Retry-After": "300" } });
  }
  const redirect = new URL("/maintenance", request.url);
  redirect.searchParams.set("from", path);
  return NextResponse.redirect(redirect);
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files. All app/API authorization is
    // still checked at the route using the centralized session helper.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
