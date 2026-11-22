import type { FeatureKey } from "./config";

export function featureForRequest(path: string, method: string): FeatureKey | null {
  const normalizedMethod = method.toUpperCase();
  if (["/member-signup", "/moderator-signup", "/auth/enroll"].includes(path) && normalizedMethod === "GET") return "registration";
  if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) return null;
  if (path === "/api/chama/moderator-signup") return "registration";
  if (path === "/api/chama/moderator-registration") return "registration";
  if (path === "/api/chama/groups") return "group_creation";
  if (/^\/api\/chama\/groups\/[^/]+\/members(?:\/[^/]+){0,2}$/.test(path)) return "group_invitations";
  if (/^\/api\/chama\/groups\/[^/]+\/(?:contributions(?:\/[^/]+)?|finance\/adjustments)$/.test(path)) return "contributions";
  if (/^\/api\/chama\/groups\/[^/]+\/(?:payouts|rounds)(?:\/[^/]+)?$/.test(path)) return "payouts";
  if (/^\/api\/chama\/groups\/[^/]+\/(?:calls|calls\/[^/]+\/attendance(?:\/sync)?)$/.test(path)) return "meeting_management";
  if (/^\/api\/chama\/groups\/[^/]+\/announcements$/.test(path) || path === "/api/admin/notifications") return "notifications";
  return null;
}

function isPathWithin(path: string, prefix: string) {
  return prefix === "/" || path === prefix || path.startsWith(prefix + "/");
}

export function isMaintenanceRouteAffected(path: string, affectedRoutes: string[]) {
  return affectedRoutes.some((prefix) => isPathWithin(path, prefix));
}
