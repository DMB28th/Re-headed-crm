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

/**
 * Idle cutoff, enforced on the KV record rather than the cookie.
 *
 * The absolute cap above deliberately does NOT slide: `issuedAt` is inside the
 * HMAC, so a cookie can never be extended indefinitely. That is the property
 * worth keeping, and it is also why there was no idle timeout at all — an admin
 * session on a laptop left open stayed live for the full fourteen days. This
 * adds the missing axis without touching the cookie format.
 */
const IDLE_TIMEOUT_SECONDS = 60 * 60 * 24 * 3; // 3d of no requests ends a session.

/**
 * How stale `lastSeenAt` may get before a request refreshes it. Writing on
 * every request would be a store write on every request; the effective idle
 * window is therefore IDLE_TIMEOUT_SECONDS plus this, which is the accepted
 * imprecision (see the redesign spec, section 8.4).
 */
const LAST_SEEN_THROTTLE_SECONDS = 5 * 60;

export const STUDIO_SESSION_COOKIE = "cardstack_studio_session";
/** KV namespace holding the live session records. */
export const STUDIO_SESSION_NS = "studio-sessions";

export const SESSION_TTL_SECONDS = SESSION_MAX_AGE_SECONDS;
export const SESSION_IDLE_SECONDS = IDLE_TIMEOUT_SECONDS;
export const SESSION_LAST_SEEN_THROTTLE_SECONDS = LAST_SEEN_THROTTLE_SECONDS;

/**
 * What a session id resolves to in the store.
 *
 * `role` is a snapshot from sign-in kept for debugging only — **never read it
 * to make an authorization decision.** The membership is re-read on every
 * request precisely so that a demotion takes effect on the next one rather than
 * when a cookie happens to expire (see `lib/auth.ts`).
 *
 * `lastSeenAt` is absent on records written before idle expiry existed; treat
 * that as `createdAt` rather than as "idle forever", so a live admin is not
 * logged out by a deploy.
 */
export interface StudioSessionRecord {
  accountId: string;
  workspaceId: string;
  role: "admin" | "member";
  createdAt: string;
  lastSeenAt?: string;
}

/**
 * Secrets the cookie may be verified with. **Signing always uses the first.**
 *
 * `CARDSTACK_SESSION_SECRET` is the real one. `STUDIO_SHARED_SECRET` is still
 * ACCEPTED FOR VERIFICATION so that cookies signed before a deployment set the
 * real key keep working for the length of one session lifetime. Once the real
 * key IS set it sorts first, so every newly minted cookie is bound to it and the
 * shared secret decays into a verify-only key. A deployment that has not set the
 * real key yet still signs with the shared secret, because the alternative is
 * refusing to serve — that is the state the migration exists to leave.
 *
 * That distinction is the whole point. `STUDIO_SHARED_SECRET` is also the
 * human-typed access key on the login page: a value transcribed into chat, a
 * ticket, a screenshot. Using it as an HMAC key means anyone who ever saw it
 * can forge a session cookie for any session id. Once the migration window has
 * elapsed it must be dropped from this list entirely (see
 * docs/superpowers/specs/2026-08-08-auth-redesign.md, section 5 step 5).
 *
 * An empty list means auth is misconfigured — callers must fail closed and say
 * so, never fall back to a constant. A predictable signing key would let anyone
 * mint a session for any account.
 */
export function sessionSigningSecrets(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return [env.CARDSTACK_SESSION_SECRET?.trim(), env.STUDIO_SHARED_SECRET?.trim()].filter(
    (value): value is string => !!value,
  );
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
  secret: string | string[],
  now = Date.now(),
): Promise<string | undefined> {
  if (!token) return undefined;
  const secrets = (Array.isArray(secret) ? secret : [secret]).filter(Boolean);
  if (secrets.length === 0) return undefined; // Misconfigured: fail closed.
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [sessionId, issuedAt, supplied] = parts;
  if (!sessionId || !issuedAt || !supplied || !/^\d+$/.test(issuedAt)) return undefined;
  const age = Math.floor(now / 1000) - Number(issuedAt);
  // Cheap checks first: an expired or malformed cookie short-circuits before
  // any HMAC work, so a retired secret costs nothing on the common path.
  if (age < 0 || age > SESSION_MAX_AGE_SECONDS) return undefined;
  for (const candidate of secrets) {
    if (equal(supplied, await signature(candidate, sessionId, issuedAt))) return sessionId;
  }
  return undefined;
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
