import { describe, expect, it } from "vitest";
import { featureForRequest, isMaintenanceRouteAffected } from "./policy";

describe("platform enforcement policy", () => {
  it("maps write endpoints to registered feature flags and leaves reads available", () => {
    expect(featureForRequest("/api/chama/groups/abc/contributions/txn", "PATCH")).toBe("contributions");
    expect(featureForRequest("/api/chama/groups/abc/payouts", "POST")).toBe("payouts");
    expect(featureForRequest("/api/chama/groups/abc/members", "POST")).toBe("group_invitations");
    expect(featureForRequest("/api/chama/groups/abc/contributions", "GET")).toBeNull();
    expect(featureForRequest("/member-signup", "GET")).toBe("registration");
  });

  it("matches maintenance route prefixes without matching neighboring paths", () => {
    expect(isMaintenanceRouteAffected("/chama/groups", ["/chama"])).toBe(true);
    expect(isMaintenanceRouteAffected("/chama2", ["/chama"])).toBe(false);
    expect(isMaintenanceRouteAffected("/admin", ["/"])).toBe(true);
    expect(isMaintenanceRouteAffected("/chama", [])).toBe(false);
  });
});
