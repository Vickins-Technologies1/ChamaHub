import { describe, expect, it } from "vitest";
import {
  getExportIdentityEmail,
  indexIdentityExport,
  matchExportIdentity,
  normalizeAuthEmail,
} from "./auth-migration";

describe("legacy authentication identity mapping", () => {
  it("normalizes email addresses before matching", () => {
    expect(normalizeAuthEmail("  Member@Example.COM ")).toBe("member@example.com");
    expect(normalizeAuthEmail(null)).toBe("");
  });

  it("preserves the application account ID as the preferred identity key", () => {
    const byApplicationId = { id: "provider-new", externalId: "chama-user-123" };
    const byLegacyProviderId = { id: "provider-old", externalId: null };
    const identities = indexIdentityExport([byApplicationId, byLegacyProviderId]);

    expect(matchExportIdentity({ id: "chama-user-123", clerkId: "provider-old" }, identities)).toBe(byApplicationId);
  });

  it("uses the legacy provider ID only when the stable application ID is unavailable", () => {
    const identity = { id: "provider-old", externalId: null };
    const identities = indexIdentityExport([identity]);

    expect(matchExportIdentity({ id: "chama-user-123", legacyProviderId: "provider-old" }, identities)).toBe(identity);
    expect(matchExportIdentity({ id: "unmatched" }, identities)).toBeUndefined();
  });

  it("marks an address verified only when the export confirms the primary address", () => {
    expect(getExportIdentityEmail({
      primaryEmailAddress: "Member@Example.com",
      emailAddresses: [{ emailAddress: "member@example.com", verification: { status: "verified" } }],
    })).toEqual({ email: "member@example.com", verified: true });
    expect(getExportIdentityEmail({
      primaryEmailAddress: "member@example.com",
      emailAddresses: [{ emailAddress: "other@example.com", verification: { status: "verified" } }],
    })).toEqual({ email: "member@example.com", verified: false });
  });
});
