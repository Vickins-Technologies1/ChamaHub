export type SecurityAlertCandidate = { fingerprint: string; type: string; severity: string; title: string; evidence: Record<string, unknown> };

export function buildSecurityAlertCandidates(input: {
  denied: Array<{ actorId?: unknown; ipAddress?: unknown; permission?: unknown }>;
  permissionChanges: Array<{ actorId?: unknown }>;
  impersonations: Array<{ actorId?: unknown; targetUserId?: unknown }>;
  rateLimits: Array<{ actorId?: unknown; action?: unknown }>;
  highActivity: Array<{ _id?: unknown; count?: unknown }>;
  hourKey: string;
  dayKey: string;
}) {
  const alerts: SecurityAlertCandidate[] = [];
  const groupByActor = <T extends { actorId?: unknown }>(rows: T[], fallback?: (row: T) => string) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const key = String(row.actorId ?? fallback?.(row) ?? "unknown-source");
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return grouped;
  };

  for (const [source, rows] of groupByActor(input.denied, (row) => String(row.ipAddress ?? "unknown-source"))) {
    if (rows.length >= 5) alerts.push({ fingerprint: `privileged-access:${source}:${input.hourKey}`, type: "repeated_privileged_access", severity: "high", title: "Repeated denied privileged access", evidence: { actorId: source === "unknown-source" ? null : source, attempts: rows.length, permission: rows[0]?.permission } });
  }
  for (const [actorId, rows] of groupByActor(input.permissionChanges)) {
    if (rows.length >= 3) alerts.push({ fingerprint: `permission-changes:${actorId}:${input.hourKey}`, type: "multiple_permission_changes", severity: "high", title: "Several staff permission changes in one hour", evidence: { actorId, changes: rows.length } });
  }
  for (const [actorId, rows] of groupByActor(input.impersonations)) {
    if (rows.length >= 5) alerts.push({ fingerprint: `impersonation:${actorId}:${input.dayKey}`, type: "repeated_impersonation", severity: "medium", title: "Repeated impersonation sessions", evidence: { actorId, starts: rows.length, targetUserIds: rows.map((row) => row.targetUserId) } });
  }
  for (const [actorId, rows] of groupByActor(input.rateLimits)) {
    if (rows.length >= 3) alerts.push({ fingerprint: `rate-limit:${actorId}:${input.dayKey}`, type: "rate_limit_violations", severity: "medium", title: "Repeated administrative rate-limit events", evidence: { actorId, events: rows.length, actions: rows.map((row) => row.action) } });
  }
  for (const entry of input.highActivity) alerts.push({ fingerprint: `high-activity:${String(entry._id)}:${input.hourKey}`, type: "unusual_admin_activity", severity: "medium", title: "Unusually high administrative activity", evidence: { actorId: entry._id, actions: entry.count } });
  return alerts;
}
