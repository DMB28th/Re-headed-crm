/**
 * At-rest encryption for CRM secret blobs (connection.credentials / pendingAuth,
 * user_connection.credentials). These hold Salesforce refresh tokens, the app
 * client secret, and HubSpot private-app tokens — the security requirement is
 * "CRM tokens encrypted at rest" (PLAN.md §Security).
 *
 * Envelope: AES-256-GCM over a 32-byte key from CARDSTACK_ENCRYPTION_KEY (hex or
 * base64). A sealed field is a compact `enc:v1:<base64(iv|tag|ciphertext)>`
 * string; anything else is treated as legacy plaintext and passed through, so
 * existing rows keep working and get re-encrypted on their next write.
 *
 * When no key is configured (local/demo), sealing is a no-op — the object is
 * stored as-is, exactly as before this change.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null | undefined;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.CARDSTACK_ENCRYPTION_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return cachedKey;
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "CARDSTACK_ENCRYPTION_KEY must decode to 32 bytes (64 hex chars or base64). Generate one with: openssl rand -base64 32",
    );
  }
  cachedKey = key;
  return cachedKey;
}

/** For tests: forget the cached key after mutating process.env. */
export function resetEncryptionKeyCache(): void {
  cachedKey = undefined;
}

export function encryptionEnabled(): boolean {
  return getKey() !== null;
}

function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt one secret sub-object. Returns the object unchanged when no key is set. */
export function sealField(
  value: Record<string, string> | undefined,
): Record<string, string> | string | undefined {
  if (value === undefined) return undefined;
  const key = getKey();
  if (!key) return value; // plaintext passthrough (dev/demo)
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a sealed field, or pass through a legacy plaintext object. */
export function openField(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (isSealed(value)) {
    const key = getKey();
    if (!key) {
      throw new Error(
        "Encrypted credentials found but CARDSTACK_ENCRYPTION_KEY is not set. Set the key used to write them.",
      );
    }
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
  }
  return value as Record<string, string>;
}

interface SecretBearing {
  credentials?: Record<string, string>;
  pendingAuth?: Record<string, string>;
}

/** Return a shallow copy with secret fields sealed for storage. Never mutates input. */
export function sealConnection<T extends SecretBearing>(state: T): T {
  const sealed: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  if (state.credentials !== undefined) sealed.credentials = sealField(state.credentials);
  if (state.pendingAuth !== undefined) sealed.pendingAuth = sealField(state.pendingAuth);
  return sealed as unknown as T;
}

/** Return a shallow copy with secret fields opened after load. Never mutates input. */
export function openConnection<T extends SecretBearing>(raw: T): T {
  const opened: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if (raw.credentials !== undefined) opened.credentials = openField(raw.credentials);
  if (raw.pendingAuth !== undefined) opened.pendingAuth = openField(raw.pendingAuth);
  return opened as unknown as T;
}

/**
 * Seal an arbitrary JSON object for KV storage (MCP OAuth codes/tokens hold
 * live bearer secrets). Same AES-256-GCM path as connection credentials;
 * plaintext passthrough when no key is configured (dev/demo).
 */
export function sealKvValue(value: Record<string, unknown>): Record<string, unknown> {
  const sealed = sealField({ blob: JSON.stringify(value) });
  return typeof sealed === "string" ? { __sealed: sealed } : value;
}

export function openKvValue(raw: Record<string, unknown>): Record<string, unknown> {
  const sealed = raw.__sealed;
  if (typeof sealed === "string") {
    const opened = openField(sealed);
    return JSON.parse((opened as { blob?: string } | undefined)?.blob ?? "{}") as Record<
      string,
      unknown
    >;
  }
  return raw;
}
