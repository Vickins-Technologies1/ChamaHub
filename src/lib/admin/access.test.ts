import { describe, expect, it } from "vitest";
import { canAccessPermission, parsePageParams, type AdminRole, type AdminPermission } from "./policy";

const grant = (role: AdminRole, permissions: AdminPermission[] = []) => ({
  role,
  permissions,
});

describe("platform admin permission checks", () => {
  it("grants a Super Admin every defined module without role metadata", () => {
    const superAdmin = grant("SUPER_ADMIN");
    expect(canAccessPermission(superAdmin, "finance.read")).toBe(true);
    expect(canAccessPermission(superAdmin, "users.suspend")).toBe(true);
  });

  it("requires exact database permissions for all other admin roles", () => {
    const moderator = grant("MODERATOR", ["groups.read"]);
    expect(canAccessPermission(moderator, "groups.read")).toBe(true);
    expect(canAccessPermission(moderator, "groups.write")).toBe(false);
    expect(canAccessPermission(grant("ADMIN"), "staff.write")).toBe(false);
    expect(canAccessPermission(grant("SUPPORT"), "users.read")).toBe(false);
  });

  it("does not treat missing grants as platform roles", () => {
    expect(canAccessPermission(null, "dashboard.read")).toBe(false);
  });
});

describe("admin pagination bounds", () => {
  it("uses defaults and limits a page to one hundred rows", () => {
    expect(parsePageParams(new URLSearchParams())).toEqual({ page: 1, pageSize: 25, skip: 0 });
    expect(parsePageParams(new URLSearchParams("page=3&pageSize=1000"))).toEqual({ page: 3, pageSize: 100, skip: 200 });
  });

  it("clamps invalid and negative values instead of returning unbounded data", () => {
    expect(parsePageParams(new URLSearchParams("page=-4&pageSize=0"))).toEqual({ page: 1, pageSize: 25, skip: 0 });
    expect(parsePageParams(new URLSearchParams("page=not-a-number&pageSize=not-a-number"))).toEqual({ page: 1, pageSize: 25, skip: 0 });
  });
});
