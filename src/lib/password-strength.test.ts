import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("password strength feedback", () => {
  it("asks for the minimum length before rating a password", () => {
    expect(passwordStrength("short")).toEqual({ score: 0, label: "Too short" });
  });

  it("recognizes variety and length without requiring one exact format", () => {
    expect(passwordStrength("Yellow!Jelly9")).toEqual({ score: 2, label: "Good" });
    expect(passwordStrength("correct-horse-battery-staple-2036")).toEqual({ score: 3, label: "Strong" });
  });
});
