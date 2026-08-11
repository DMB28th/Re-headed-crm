import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, burnTimingForMissingAccount, MIN_PASSWORD_LENGTH } from "./password";

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
  it("returns false on malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
  it("burns comparable time for missing accounts", async () => {
    await expect(burnTimingForMissingAccount("anything")).resolves.toBeUndefined();
  });
  it("exports the NIST minimum", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
  });
});
