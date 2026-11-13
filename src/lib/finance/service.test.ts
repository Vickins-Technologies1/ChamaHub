import { describe, expect, it } from "vitest";
import { buildRoundSnapshot } from "./round-snapshot";

describe("round money snapshots", () => {
  it("locks one currency obligation per eligible member", () => {
    const snapshot = buildRoundSnapshot(
      { contributionAmount: 125.5, currency: "KES" },
      ["64b000000000000000000001", "64b000000000000000000002"],
      new Date("2026-01-01T00:00:00Z")
    );
    expect(snapshot.currencySnapshot).toBe("KES");
    expect(snapshot.contributionAmountMinor).toBe(12550);
    expect(snapshot.expectedTotalMinor).toBe(25100);
    expect(snapshot.memberObligations).toHaveLength(2);
    expect(snapshot.memberObligations.every((item) => item.amountMinor === 12550)).toBe(true);
    expect(snapshot.snapshotStatus).toBe("confirmed");
  });

  it("rejects snapshots without eligible members", () => {
    expect(() => buildRoundSnapshot({ contributionAmount: 100, currency: "KES" }, [])).toThrow(/no eligible members/);
  });
});
