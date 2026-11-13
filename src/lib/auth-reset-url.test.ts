import { describe, expect, it } from "vitest";
import { getPasswordResetEmailUrl } from "./auth-reset-url";

describe("getPasswordResetEmailUrl", () => {
  it("routes Better Auth reset callbacks through the mounted auth API", () => {
    expect(getPasswordResetEmailUrl(
      "https://chamapulse.example/reset-password/abc123?callbackURL=https%3A%2F%2Fchamapulse.example%2Freset-password%3Frole%3Dmoderator"
    )).toBe(
      "https://chamapulse.example/api/auth/reset-password/abc123?callbackURL=https%3A%2F%2Fchamapulse.example%2Freset-password%3Frole%3Dmoderator"
    );
  });

  it("does not duplicate the auth API path", () => {
    expect(getPasswordResetEmailUrl(
      "https://chamapulse.example/api/auth/reset-password/abc123?callbackURL=%2Freset-password"
    )).toBe(
      "https://chamapulse.example/api/auth/reset-password/abc123?callbackURL=%2Freset-password"
    );
  });
});
