import { describe, expect, it } from "vitest";
import { classifyEmailDelivery, normalizeAudienceIds } from "./notifications";

describe("platform notification targeting and delivery states", () => {
  it("normalizes selected audience IDs and removes duplicates", () => {
    expect(normalizeAudienceIds([" user-1 ", "user-1", "", null, "user-2"])).toEqual(["user-1", "user-2"]);
    expect(normalizeAudienceIds(undefined)).toEqual([]);
  });

  it("reports only confirmed SMTP acceptance as accepted", () => {
    expect(classifyEmailDelivery({ transportAvailable: true, addressAvailable: true, recipientAccepted: true })).toBe("accepted_by_smtp");
    expect(classifyEmailDelivery({ transportAvailable: true, addressAvailable: true, recipientAccepted: false })).toBe("failed");
    expect(classifyEmailDelivery({ transportAvailable: true, addressAvailable: false, recipientAccepted: false })).toBe("failed");
    expect(classifyEmailDelivery({ transportAvailable: false, addressAvailable: true, recipientAccepted: false })).toBe("unavailable");
  });
});
