export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "users.read",
  "users.write",
  "users.suspend",
  "users.sessions.revoke",
  "groups.read",
  "groups.write",
  "finance.read",
  "staff.read",
  "staff.write",
  "audit.read",
  "system.read",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminGrantShape = { role: AdminRole; permissions: AdminPermission[] };

export function canAccessPermission(grant: Pick<AdminGrantShape, "role" | "permissions"> | null, permission: AdminPermission) {
  if (!grant) return false;
  if (grant.role === "SUPER_ADMIN") return true;
  return grant.permissions.includes(permission);
}

export function parsePageParams(params: URLSearchParams, defaultSize = 25) {
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(params.get("pageSize") ?? String(defaultSize), 10) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
