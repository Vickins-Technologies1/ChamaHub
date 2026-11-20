import { describe, expect, it } from "vitest";
import { hasRecentSecondFactor, impersonationTerminationQuery, impersonationTerminationUpdate, isImpersonationSessionLive, validateImpersonationTarget } from "./impersonation-policy";

describe("impersonation policy", () => {
  it("requires both recent verified factors", () => {
    expect(hasRecentSecondFactor([20, 45], 600)).toBe(true);
    expect(hasRecentSecondFactor([20, -1], 600)).toBe(false);
    expect(hasRecentSecondFactor([20, 601], 600)).toBe(false);
    expect(hasRecentSecondFactor(null, 600)).toBe(false);
  });

  it("blocks self, suspended, Super Admin, and unauthorized staff targets", () => {
    const base = { actorId: "admin-1", targetUserId: "user-1", targetExists: true, targetSuspended: false, targetAdminRole: null, targetHasAdminGrant: false, actorCanImpersonateStaff: false };
    expect(validateImpersonationTarget({ ...base, targetUserId: "admin-1" })?.status).toBe(400);
    expect(validateImpersonationTarget({ ...base, targetSuspended: true })?.status).toBe(404);
    expect(validateImpersonationTarget({ ...base, targetAdminRole: "SUPER_ADMIN", targetHasAdminGrant: true })?.status).toBe(403);
    expect(validateImpersonationTarget({ ...base, targetAdminRole: "SUPPORT", targetHasAdminGrant: true })?.status).toBe(403);
    expect(validateImpersonationTarget({ ...base, targetAdminRole: "SUPPORT", targetHasAdminGrant: true, actorCanImpersonateStaff: true })).toBeNull();
  });

  it("requires the original administrator and an unexpired active session", () => {
    const now = Date.now();
    const session = { actorId: "admin-1", status: "active", expiresAt: new Date(now + 60_000) };
    expect(isImpersonationSessionLive(session, "admin-1", now)).toBe(true);
    expect(isImpersonationSessionLive(session, "admin-2", now)).toBe(false);
    expect(isImpersonationSessionLive({ ...session, expiresAt: new Date(now) }, "admin-1", now)).toBe(false);
    expect(isImpersonationSessionLive({ ...session, status: "ended" }, "admin-1", now)).toBe(false);
  });

  it("terminates only the active session owned by its original administrator", () => {
    const endedAt = new Date("2026-11-20T12:00:00Z");
    expect(impersonationTerminationQuery("hashed-token", "admin-1")).toEqual({ _id: "hashed-token", actorId: "admin-1", status: "active" });
    expect(impersonationTerminationUpdate(endedAt)).toEqual({ $set: { status: "ended", endedAt, endReason: "administrator_exit" } });
  });
});
