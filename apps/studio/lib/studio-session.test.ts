import { describe, expect, it } from "vitest";
import {
  createStudioSession,
  readStudioSession,
  sessionSigningSecrets,
} from "./studio-session";

describe("Studio session", () => {
  const now = Date.UTC(2026, 6, 27, 12);

  it("accepts a valid signed token", async () => {
    const token = await createStudioSession("session-123", "correct horse battery staple", now);
    expect(await readStudioSession(token, "correct horse battery staple", now + 1_000)).toBe(
      "session-123",
    );
  });

  it("rejects tampering, the wrong secret, and expiration", async () => {
    const token = await createStudioSession("session-123", "secret", now);
    expect(await readStudioSession(`${token}x`, "secret", now)).toBeUndefined();
    expect(await readStudioSession(token, "other", now)).toBeUndefined();
    expect(
      await readStudioSession(token, "secret", now + 15 * 24 * 60 * 60 * 1_000),
    ).toBeUndefined();
  });

  // A3, migration step 1: a deployment can adopt a real signing key without
  // logging every admin out, but only new-key cookies are ever MINTED.
  it("verifies a cookie signed with a retired secret", async () => {
    const token = await createStudioSession("session-123", "old-secret", now);
    expect(await readStudioSession(token, ["new-secret", "old-secret"], now + 1_000)).toBe(
      "session-123",
    );
  });

  it("does not accept a secret that is not in the list", async () => {
    const token = await createStudioSession("session-123", "new-secret", now);
    expect(await readStudioSession(token, ["old-secret"], now)).toBeUndefined();
  });

  it("fails closed on an empty secret list", async () => {
    const token = await createStudioSession("session-123", "secret", now);
    expect(await readStudioSession(token, [], now)).toBeUndefined();
  });

  it("signs with the real key when both are configured", () => {
    expect(
      sessionSigningSecrets({ CARDSTACK_SESSION_SECRET: "real", STUDIO_SHARED_SECRET: "shared" })[0],
    ).toBe("real");
  });

  it("reports no secret at all when neither is configured", () => {
    expect(sessionSigningSecrets({})).toEqual([]);
  });
});
