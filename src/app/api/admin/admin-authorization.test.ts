import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/admin/access", () => ({
  requireAdminPermission: vi.fn(),
  checkSameOrigin: vi.fn(() => null),
  enforceAdminRateLimit: vi.fn(() => null),
  writeAdminAudit: vi.fn(),
}));
vi.mock("@/lib/mongodb", () => ({ default: vi.fn() }));

import { requireAdminPermission } from "@/lib/admin/access";
import connectToDatabase from "@/lib/mongodb";
import { GET as getUsers } from "./users/route";
import { PATCH as patchGroup } from "./groups/[groupId]/route";
import { POST as postStaff } from "./staff/route";
import { POST as postNotifications } from "./notifications/route";
import { PUT as putMaintenance } from "./maintenance/route";
import { PATCH as patchFeatures } from "./features/route";
import { GET as getSupportTickets } from "./support/tickets/route";
import { GET as getSecurity } from "./security/route";
import { GET as getAnalytics } from "./analytics/route";

describe("admin API access boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects user directory reads before opening the data store", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({
      session: null,
      response: NextResponse.json({ error: "Administrative access is required." }, { status: 403 }),
    } as never);
    const response = await getUsers(new Request("http://localhost/api/admin/users"));
    expect(response.status).toBe(403);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("rejects group mutations before parsing or changing the group", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({
      session: null,
      response: NextResponse.json({ error: "Permission denied." }, { status: 403 }),
    } as never);
    const response = await patchGroup(
      new Request("http://localhost/api/admin/groups/507f1f77bcf86cd799439011", { method: "PATCH", body: "not-json" }),
      { params: Promise.resolve({ groupId: "invalid" }) },
    );
    expect(response.status).toBe(403);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["staff invitations", () => postStaff(new Request("http://localhost/api/admin/staff", { method: "POST", body: "not-json" }))],
    ["platform notifications", () => postNotifications(new Request("http://localhost/api/admin/notifications", { method: "POST", body: "not-json" }))],
    ["maintenance controls", () => putMaintenance(new Request("http://localhost/api/admin/maintenance", { method: "PUT", body: "not-json" }))],
    ["feature flags", () => patchFeatures(new Request("http://localhost/api/admin/features", { method: "PATCH", body: "not-json" }))],
    ["support tickets", () => getSupportTickets(new Request("http://localhost/api/admin/support/tickets"))],
    ["security monitoring", () => getSecurity(new Request("http://localhost/api/admin/security"))],
    ["analytics", () => getAnalytics(new Request("http://localhost/api/admin/analytics"))],
  ])("rejects unauthorized %s before opening the data store", async (_name, call) => {
    vi.mocked(requireAdminPermission).mockResolvedValue({
      session: null,
      response: NextResponse.json({ error: "Permission denied." }, { status: 403 }),
    } as never);
    const response = await call();
    expect(response.status).toBe(403);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });
});
