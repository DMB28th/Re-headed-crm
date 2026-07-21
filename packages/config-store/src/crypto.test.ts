import { afterEach, describe, expect, it } from "vitest";
import {
  encryptionEnabled,
  openConnection,
  openField,
  resetEncryptionKeyCache,
  sealConnection,
  sealField,
} from "./crypto.js";

// Deterministic 32-byte test key (base64).
const KEY = Buffer.alloc(32, 7).toString("base64");

function withKey(key: string | undefined): void {
  if (key === undefined) delete process.env.CARDSTACK_ENCRYPTION_KEY;
  else process.env.CARDSTACK_ENCRYPTION_KEY = key;
  resetEncryptionKeyCache();
}

afterEach(() => withKey(undefined));

describe("crypto at-rest sealing", () => {
  it("round-trips a secret field when a key is configured", () => {
    withKey(KEY);
    const secret = { refreshToken: "rt-123", clientSecret: "cs-456" };
    const sealed = sealField(secret);
    expect(typeof sealed).toBe("string");
    expect(sealed).toMatch(/^enc:v1:/);
    // The plaintext secret must not appear in the sealed blob.
    expect(String(sealed)).not.toContain("rt-123");
    expect(openField(sealed)).toEqual(secret);
  });

  it("is a no-op passthrough when no key is set (dev/demo)", () => {
    withKey(undefined);
    expect(encryptionEnabled()).toBe(false);
    const secret = { token: "plain" };
    expect(sealField(secret)).toEqual(secret);
    expect(openField(secret)).toEqual(secret);
  });

  it("reads legacy plaintext objects unchanged even with a key set", () => {
    withKey(KEY);
    // A row written before encryption existed: credentials is a plain object.
    expect(openField({ token: "legacy" })).toEqual({ token: "legacy" });
  });

  it("fails to open a blob sealed with a different key", () => {
    withKey(KEY);
    const sealed = sealField({ a: "b" });
    withKey(Buffer.alloc(32, 9).toString("base64"));
    expect(() => openField(sealed)).toThrow();
  });

  it("throws if a sealed blob is read with no key configured", () => {
    withKey(KEY);
    const sealed = sealField({ a: "b" });
    withKey(undefined);
    expect(() => openField(sealed)).toThrow(/CARDSTACK_ENCRYPTION_KEY/);
  });

  it("seals and opens connection credentials + pendingAuth without mutating input", () => {
    withKey(KEY);
    const conn = {
      tenantId: "t1",
      status: "connected" as const,
      crm: "salesforce" as const,
      label: "admin OAuth",
      changedAt: "2026-07-20T00:00:00.000Z",
      credentials: { refreshToken: "rt", clientSecret: "cs" },
      pendingAuth: { state: "st", codeVerifier: "cv" },
    };
    const sealed = sealConnection(conn);
    expect(typeof sealed.credentials).toBe("string");
    expect(typeof sealed.pendingAuth).toBe("string");
    // Input untouched.
    expect(conn.credentials).toEqual({ refreshToken: "rt", clientSecret: "cs" });
    expect(openConnection(sealed)).toEqual(conn);
  });

  it("leaves a connection without secrets untouched", () => {
    withKey(KEY);
    const conn = {
      tenantId: "t1",
      status: "disconnected" as const,
      crm: "hubspot" as const,
      label: "none",
      changedAt: "2026-07-20T00:00:00.000Z",
    };
    expect(sealConnection(conn)).toEqual(conn);
    expect(openConnection(conn)).toEqual(conn);
  });
});
