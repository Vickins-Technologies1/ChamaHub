import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  authSignUp: vi.fn(),
  connect: vi.fn(),
  collection: vi.fn(),
  findInvite: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getAuth: vi.fn(async () => ({ api: { signUpEmail: mocks.authSignUp } })) }));
vi.mock("@/lib/mongodb", () => ({ default: mocks.connect }));
vi.mock("@/lib/admin/access", () => ({
  checkSameOrigin: vi.fn(() => null),
  enforceUserRateLimit: mocks.rateLimit,
  ensureAdminIndexes: vi.fn(async () => undefined),
}));

import { POST } from "./route";

const token = "a".repeat(43);
const inviteId = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
const inviteEmail = "invited@example.com";
const validInvite = { inviteId, email: inviteEmail };

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/admin/invitations/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  }));
}

describe("administrator invitation registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.findInvite.mockImplementation(async (query: Record<string, unknown>) => {
      const hash = createHash("sha256").update(token).digest("hex");
      return query.inviteTokenHash === hash ? validInvite : null;
    });
    mocks.collection.mockReturnValue({ findOne: mocks.findInvite });
    mocks.connect.mockResolvedValue({ collection: mocks.collection });
    mocks.authSignUp.mockResolvedValue({ user: { id: "admin-user" } });
  });

  it("creates an account only for the invited email and returns a fragment callback", async () => {
    const response = await post({ token, name: "Casey Admin", email: "Invited@Example.com", password: "a very long safe passphrase" });
    expect(response.status).toBe(201);
    expect(mocks.authSignUp).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        name: "Casey Admin",
        email: inviteEmail,
        callbackURL: `/auth/admin-invite?verified=1#inviteId=${inviteId}`,
      }),
    }));
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });

  it("does not create an account when the email differs from the invitation", async () => {
    const response = await post({ token, name: "Casey Admin", email: "other@example.com", password: "a very long safe passphrase" });
    expect(response.status).toBe(400);
    expect(mocks.authSignUp).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("invitation") });
  });

  it("does not create an account for an invalid or expired invitation", async () => {
    mocks.findInvite.mockResolvedValue(null);
    const response = await post({ token, name: "Casey Admin", email: inviteEmail, password: "a very long safe passphrase" });
    expect(response.status).toBe(400);
    expect(mocks.authSignUp).not.toHaveBeenCalled();
  });

  it("returns only a masked email when checking an invitation", async () => {
    const response = await post({ token, action: "inspect" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.emailHint).toBe("in•••••@example.com");
    expect(body.inviteId).toBe(inviteId);
    expect(JSON.stringify(body)).not.toContain(inviteEmail);
  });
});
