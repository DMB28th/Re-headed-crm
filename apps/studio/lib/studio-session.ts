/**
 * Studio browser sessions.
 *
 * Was: an HMAC over a timestamp, proving only "you knew the one shared access
 * key" — every admin was the same anonymous principal and the workspace came
 * from an env var. Now the cookie names a session record, so Studio knows WHICH
 * account is signed in and which workspace they are acting on.
 *
 * Two-layer on purpose:
 *
 * - The cookie is `<sessionId>.<issuedAt>.<hmac>`, verifiable with nothing but
 *   the signing secret. `middleware.ts` runs on the edge runtime and gates every
 *   route on that check alone — no database round trip on static assets.
 * - The authoritative identity (account, workspace, role) lives in the config
 *   store's KV, keyed by that session id. Server components and route handlers
 *   resolve it there, so signing out and role changes take effect immediately
 *   rather than waiting for a cookie to expire.
 *
 * The HMAC alone is therefore NOT proof of a live session — it proves the id
 * wasn't forged. Anything that acts on a user's behalf must resolve the KV
 * record (see `lib/auth.ts`), never trust the cookie's shape.
 */
const SESSION_PREFIX = "cardstack-studio";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14d; KV expiry matches.

export const STUDIO_SESSION_COOKIE = "cardstack_studio_session";
/** KV namespace holding the live session records. */
export const STUDIO_SESSION_NS = "studio-sessions";

export const SESSION_TTL_SECONDS = SESSION_MAX_AGE_SECONDS;

/** What a session id resolves to in the store. */
export interface StudioSessionRecord {
  accountId: string;
  workspaceId: string;
  role: "admin" | "member";
  createdAt: string;
}

/**
 * Secret the cookie is signed with. `CARDSTACK_SESSION_SECRET` is the real one;
 * `STUDIO_SHARED_SECRET` is accepted so deployments that already set it keep
 * working through this change. Undefined means auth is misconfigured — callers
 * must fail closed and say so, never fall back to a constant (a predictable
 * signing key would let anyone mint a session for any account).
 */
export function sessionSigningSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env.CARDSTACK_SESSION_SECRET?.trim() || env.STUDIO_SHARED_SECRET?.trim() || undefined;
}

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).slice().buffer as ArrayBuffer;
}

function toBase64Url(value: ArrayBuffer): string {
  const input = new Uint8Array(value);
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signature(secret: string, sessionId: string, issuedAt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    await crypto.subtle.sign("HMAC", key, bytes(`${SESSION_PREFIX}:${sessionId}:${issuedAt}`)),
  );
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

/** Unguessable session id — this is the bearer of the session, so it must be random. */
export function newSessionId(): string {
  const raw = new Uint8Array(24);
  crypto.getRandomValues(raw);
  return toBase64Url(raw.buffer);
}

export async function createStudioSession(
  sessionId: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const issuedAt = String(Math.floor(now / 1000));
  return `${sessionId}.${issuedAt}.${await signature(secret, sessionId, issuedAt)}`;
}

/**
 * Returns the session id when the cookie is authentic and unexpired, else
 * undefined. Does NOT prove the session still exists — resolve it in the store.
 */
export async function readStudioSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<string | undefined> {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [sessionId, issuedAt, supplied] = parts;
  if (!sessionId || !issuedAt || !supplied || !/^\d+$/.test(issuedAt)) return undefined;
  const age = Math.floor(now / 1000) - Number(issuedAt);
  if (age < 0 || age > SESSION_MAX_AGE_SECONDS) return undefined;
  if (!equal(supplied, await signature(secret, sessionId, issuedAt))) return undefined;
  return sessionId;
}

export function studioSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function expiredSessionCookieOptions() {
  return { ...studioSessionCookieOptions(), maxAge: 0 };
}
