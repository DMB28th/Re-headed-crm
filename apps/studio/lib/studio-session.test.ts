import { describe, expect, it } from "vitest";
import { createStudioSession, readStudioSession } from "./studio-session";

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
});
