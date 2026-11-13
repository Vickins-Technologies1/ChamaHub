import { describe, expect, it } from "vitest";
import { canAdvanceRound, getContributionStatus, getOutstandingMinor } from "./ledger";

describe("contribution obligations", () => {
  it("distinguishes unpaid, partial, full, overpaid and pending verification", () => {
    expect(getContributionStatus(10000, 0, 0)).toBe("unpaid");
    expect(getContributionStatus(10000, 0, 1000)).toBe("pending_verification");
    expect(getContributionStatus(10000, 5000)).toBe("partially_paid");
    expect(getContributionStatus(10000, 10000)).toBe("fully_paid");
    expect(getContributionStatus(10000, 12000)).toBe("overpaid");
  });

  it("never reports a negative outstanding obligation", () => {
    expect(getOutstandingMinor(10000, 4000)).toBe(6000);
    expect(getOutstandingMinor(10000, 12000)).toBe(0);
  });
});

describe("round advancement gate", () => {
  it("requires fully cleared obligations and a recipient-confirmed payout", () => {
    expect(canAdvanceRound({ outstandingMinor: 1, payoutStatus: "confirmed" })).toBe(false);
    expect(canAdvanceRound({ outstandingMinor: 0, payoutStatus: "transferred" })).toBe(false);
    expect(canAdvanceRound({ outstandingMinor: 0, payoutStatus: null })).toBe(false);
    expect(canAdvanceRound({ outstandingMinor: 0, payoutStatus: "confirmed" })).toBe(true);
  });
});
