import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./auth-navigation";

describe("safeInternalPath", () => {
  it("keeps safe internal routes with their query and fragment", () => {
    expect(safeInternalPath("/member-setup?step=finish#token=abc")).toBe("/member-setup?step=finish#token=abc");
  });

  it.each([
    "https://example.com",
    "//example.com/path",
    "/\\example.com/path",
    "javascript:alert(1)",
    "/path\nheader",
  ])("uses a safe fallback for an unsafe callback: %s", (value) => {
    expect(safeInternalPath(value, "/member-login")).toBe("/member-login");
  });
});
