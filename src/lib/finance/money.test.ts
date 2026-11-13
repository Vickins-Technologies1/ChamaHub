import { describe, expect, it } from "vitest";
import { fromMinorUnits, toMinorUnits, toNonNegativeMinorUnits } from "./money";

describe("currency minor-unit conversion", () => {
  it("preserves supported KES decimal precision exactly", () => {
    expect(toMinorUnits("1234.56", "KES")).toBe(123456);
    expect(fromMinorUnits(123456, "KES")).toBe(1234.56);
  });

  it("supports zero-decimal currencies", () => {
    expect(toMinorUnits("2500", "JPY")).toBe(2500);
    expect(() => toMinorUnits("2500.1", "JPY")).toThrow(/decimal places/);
  });

  it("rejects invalid, negative, zero, and over-precise amounts", () => {
    for (const value of ["", "-1", "1e3", "1,000", "0", "0.001"]) {
      expect(() => toMinorUnits(value, "KES")).toThrow();
    }
    expect(() => toMinorUnits("1.234", "USD")).toThrow(/decimal places/);
  });

  it("allows non-negative reconciliation balances only", () => {
    expect(toNonNegativeMinorUnits("0", "KES")).toBe(0);
    expect(toNonNegativeMinorUnits("0.01", "KES")).toBe(1);
    expect(() => toNonNegativeMinorUnits("-0.01", "KES")).toThrow();
  });
});
