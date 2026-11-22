import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), handler: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: vi.fn(() => ({ GET: mocks.handler, POST: mocks.handler })) }));

import { POST } from "./route";

describe("public auth signup boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks the public Better Auth account-creation endpoint", async () => {
    const response = await POST(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: expect.stringContaining("member invitation") });
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it("continues to use Better Auth for non-signup routes", async () => {
    mocks.getAuth.mockResolvedValue({});
    mocks.handler.mockResolvedValue(new Response("ok"));
    const response = await POST(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
    expect(mocks.handler).toHaveBeenCalled();
  });
});
