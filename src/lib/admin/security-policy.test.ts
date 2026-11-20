import { describe, expect, it } from "vitest";
import { buildSecurityAlertCandidates } from "./security-policy";

describe("security alert thresholds", () => {
  it("creates alerts for repeated privileged denial, permission changes, impersonation and rate limits", () => {
    const alerts = buildSecurityAlertCandidates({
      denied: Array.from({ length: 5 }, () => ({ actorId: "staff-1", permission: "users.write" })),
      permissionChanges: Array.from({ length: 3 }, () => ({ actorId: "admin-1" })),
      impersonations: Array.from({ length: 5 }, (_, index) => ({ actorId: "admin-2", targetUserId: "user-" + index })),
      rateLimits: Array.from({ length: 3 }, () => ({ actorId: "admin-3", action: "staff-access" })),
      highActivity: [{ _id: "admin-4", count: 70 }],
      hourKey: "2026-11-20T14",
      dayKey: "2026-11-20",
    });
    expect(alerts.map((alert) => alert.type)).toEqual([
      "repeated_privileged_access", "multiple_permission_changes", "repeated_impersonation", "rate_limit_violations", "unusual_admin_activity",
    ]);
  });

  it("does not alert below repeated-event thresholds", () => {
    const alerts = buildSecurityAlertCandidates({
      denied: Array.from({ length: 4 }, () => ({ actorId: "staff-1" })),
      permissionChanges: Array.from({ length: 2 }, () => ({ actorId: "admin-1" })),
      impersonations: Array.from({ length: 4 }, () => ({ actorId: "admin-2" })),
      rateLimits: Array.from({ length: 2 }, () => ({ actorId: "admin-3" })),
      highActivity: [], hourKey: "hour", dayKey: "day",
    });
    expect(alerts).toEqual([]);
  });
});
