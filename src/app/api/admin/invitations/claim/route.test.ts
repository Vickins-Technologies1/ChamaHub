import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  syncUser: vi.fn(),
  inviteFind: vi.fn(),
  inviteUpdate: vi.fn(),
  grantFind: vi.fn(),
  grantInsert: vi.fn(),
  auditInsert: vi.fn(),
  database: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthSession: mocks.getSession, syncAppUser: mocks.syncUser }));
vi.mock("@/lib/mongodb", () => ({ default: mocks.database }));
vi.mock("@/lib/admin/access", () => ({ checkSameOrigin: vi.fn(() => null), enforceUserRateLimit: vi.fn(async () => null), ensureAdminIndexes: vi.fn(async () => undefined) }));

import { POST } from "./route";

const inviteId = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
const invitedEmail = "staff@example.com";
const user = { id: "staff-user", email: invitedEmail, emailVerified: true, name: "Staff" };
const invite = { inviteId, email: invitedEmail, status: "pending", expiresAt: new Date(Date.now() + 60_000), role: "SUPPORT", permissions: ["support.tickets.read"], createdBy: "admin-user" };

function post() {
  return POST(new Request("http://localhost/api/admin/invitations/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteId }),
  }));
}

describe("administrator invitation claiming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user });
    mocks.syncUser.mockResolvedValue({ id: user.id, email: user.email, name: user.name });
    mocks.inviteFind.mockImplementation(async (query: Record<string, unknown>) => query.email === invitedEmail ? invite : null);
    mocks.inviteUpdate.mockResolvedValue({ modifiedCount: 1 });
    mocks.grantFind.mockResolvedValue(null);
    mocks.grantInsert.mockResolvedValue({ acknowledged: true });
    mocks.auditInsert.mockResolvedValue({ acknowledged: true });
    const collections: Record<string, object> = {
      admin_access_invites: { findOne: mocks.inviteFind, updateOne: mocks.inviteUpdate },
      admin_access: { findOne: mocks.grantFind, insertOne: mocks.grantInsert },
      admin_audit: { insertOne: mocks.auditInsert },
    };
    mocks.database.mockResolvedValue({ collection: (name: string) => collections[name] });
  });

  it("claims an invitation only for a verified session using the invited email", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.inviteFind).toHaveBeenCalledWith({ inviteId, email: invitedEmail });
    expect(mocks.inviteUpdate).toHaveBeenCalledWith(expect.objectContaining({ inviteId, status: "pending", email: invitedEmail, expiresAt: expect.any(Object) }), expect.objectContaining({ $set: expect.objectContaining({ status: "claimed", claimedBy: user.id }), $unset: { inviteTokenHash: "" } }));
    expect(mocks.grantInsert).toHaveBeenCalled();
  });

  it("rejects a different email without changing the invitation", async () => {
    mocks.inviteFind.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue({ user: { ...user, email: "someone-else@example.com" } });
    const response = await post();
    expect(response.status).toBe(403);
    expect(mocks.inviteUpdate).not.toHaveBeenCalled();
    expect(mocks.grantInsert).not.toHaveBeenCalled();
  });

  it("requires email verification before claim", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...user, emailVerified: false } });
    const response = await post();
    expect(response.status).toBe(403);
    expect(mocks.database).not.toHaveBeenCalled();
  });
});
