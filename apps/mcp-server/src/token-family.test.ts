import { describe, expect, it } from "vitest";
import { decideRotation, FAMILY_MAX_AGE_MS, familyId, type TokenFamily } from "./token-family.js";

const NOW = Date.UTC(2026, 7, 8, 12);
const family = (overrides: Partial<TokenFamily> = {}): TokenFamily => ({
  familyId: "dana@example.com::csk_1",
  createdAt: new Date(NOW - 1_000).toISOString(),
  current: "csr_live",
  ...overrides,
});

describe("decideRotation", () => {
  /**
   * Written first, and the reason this module has tests at all: treating a
   * pre-rotation token as reuse would revoke every live rep on deploy day.
   */
  it("rotates a token minted before rotation existed, rather than calling it reuse", () => {
    expect(decideRotation(undefined, "csr_old", false, NOW)).toEqual({
      reuseDetected: false,
      expired: false,
    });
  });

  it("accepts the family's current refresh token", () => {
    expect(decideRotation(family(), "csr_live", false, NOW)).toEqual({
      reuseDetected: false,
      expired: false,
    });
  });

  it("treats a retired token as reuse", () => {
    expect(decideRotation(family(), "csr_previous", true, NOW).reuseDetected).toBe(true);
  });

  it("treats an unknown token against a known family as reuse", () => {
    // Superseded long enough ago that its retirement record aged out.
    expect(decideRotation(family(), "csr_ancient", false, NOW).reuseDetected).toBe(true);
  });

  it("reports reuse even for a family that is also past its ceiling", () => {
    const old = family({ createdAt: new Date(NOW - FAMILY_MAX_AGE_MS - 1).toISOString() });
    expect(decideRotation(old, "csr_previous", true, NOW).reuseDetected).toBe(true);
  });

  it("expires a grant past the absolute ceiling even while its token is current", () => {
    const old = family({ createdAt: new Date(NOW - FAMILY_MAX_AGE_MS - 1).toISOString() });
    expect(decideRotation(old, "csr_live", false, NOW)).toEqual({
      reuseDetected: false,
      expired: true,
    });
  });

  it("does not expire a grant just inside the ceiling", () => {
    const old = family({ createdAt: new Date(NOW - FAMILY_MAX_AGE_MS + 1_000).toISOString() });
    expect(decideRotation(old, "csr_live", false, NOW).expired).toBe(false);
  });

  it("tolerates an unparseable creation date rather than expiring the grant", () => {
    expect(decideRotation(family({ createdAt: "not a date" }), "csr_live", false, NOW).expired).toBe(
      false,
    );
  });
});

describe("familyId", () => {
  it("is per account and per client, so allowing one app does not bind another", () => {
    expect(familyId("dana", "csk_1")).not.toBe(familyId("dana", "csk_2"));
    expect(familyId("dana", "csk_1")).not.toBe(familyId("rex", "csk_1"));
  });
});
