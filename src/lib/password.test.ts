import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("Better Auth password hashing", () => {
  it("creates Argon2id hashes and verifies the matching password", async () => {
    const encoded = await hashPassword("Correct horse battery staple 2026");

    expect(encoded).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword({ password: "Correct horse battery staple 2026", hash: encoded })).resolves.toBe(true);
  });

  it("does not accept a different password", async () => {
    const encoded = await hashPassword("Another strong passphrase 2026");

    await expect(verifyPassword({ password: "incorrect password", hash: encoded })).resolves.toBe(false);
  });
});
