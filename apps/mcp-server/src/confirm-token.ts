/**
 * Confirm tokens — the server-side half of "every write is preceded by a
 * confirmation diff" (CLAUDE.md hard rule 8).
 *
 * Before this module, `requireConfirmation` was enforced entirely by widget
 * flow: the record card computed a diff locally, showed it, and then called
 * `crm_update_record`. A direct model tool call carrying the same arguments was
 * indistinguishable — to the server AND to the audit log — from a write a rep
 * had actually looked at and approved. The compliance spine recorded a claim it
 * could not check.
 *
 * The fix: `crm_preview_update` computes the diff server-side and mints a token
 * bound to exactly that diff. `crm_update_record` verifies it and records the
 * outcome as `via: "widget"`. No token still writes — model-driven writes are a
 * supported path — but the audit entry says `via: "model"`, honestly.
 *
 * Design notes:
 * - **Bound, not just signed.** The payload commits to tenant, object, record,
 *   actor, and a hash of the exact patch. A token minted for one diff cannot
 *   authorize a different field, value, record, or workspace.
 * - **Deliberately replayable within its 5-minute life.** Single-use would need
 *   a KV round trip on every write, costing the server its statelessness
 *   (PLAN.md spike #2) — and buys little: the only write a captured token can
 *   authorize is the byte-identical one the rep already confirmed. It also
 *   keeps "Edit & retry" after a partial failure working, which re-submits the
 *   same confirmed diff.
 * - **Never degrades to unsigned.** `signInterviewState` passes tokens through
 *   unsigned when no key is configured; doing that here would let anything
 *   forge widget provenance and make the audit log lie, which is worse than
 *   having no feature. With no `CARDSTACK_ENCRYPTION_KEY` we fall back to a
 *   per-process random secret: still unforgeable, just doesn't survive a
 *   restart — harmless against a 5-minute TTL.
 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/** Short enough that a token is only ever good for the diff on screen. */
const TTL_MS = 5 * 60 * 1000;

let ephemeralSecret: string | undefined;

function secret(): string {
  const configured = process.env.CARDSTACK_ENCRYPTION_KEY?.trim();
  if (configured) return configured;
  ephemeralSecret ??= randomBytes(32).toString("base64url");
  return ephemeralSecret;
}

/** For tests: forget the per-process fallback after mutating process.env. */
export function resetConfirmTokenSecret(): void {
  ephemeralSecret = undefined;
}

export interface ConfirmTokenSubject {
  tenantId: string;
  object: string;
  recordId: string;
  /** Field API name → value being written. Hashed, never stored in the token. */
  patch: Record<string, unknown>;
  /** Authenticated app user, when there is one — a token is not transferable. */
  actorUserId?: string;
}

interface TokenBody {
  jti: string;
  t: string;
  o: string;
  r: string;
  /** sha256 over the canonical patch. */
  p: string;
  a: string;
  iat: number;
  exp: number;
}

/**
 * Canonical form of a patch: key-sorted JSON. Two objects that write the same
 * values hash the same regardless of key order, so a widget echoing the patch
 * back in a different order still verifies.
 */
function hashPatch(patch: Record<string, unknown>): string {
  const canonical = Object.keys(patch)
    .sort()
    .map((k) => [k, patch[k] ?? null] as const);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export interface MintedConfirmToken {
  token: string;
  confirmationId: string;
  previewedAt: string;
  expiresAt: string;
}

export function mintConfirmToken(
  subject: ConfirmTokenSubject,
  now = Date.now(),
): MintedConfirmToken {
  const body: TokenBody = {
    jti: randomUUID(),
    t: subject.tenantId,
    o: subject.object,
    r: subject.recordId,
    p: hashPatch(subject.patch),
    a: subject.actorUserId ?? "",
    iat: now,
    exp: now + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return {
    token: `${encoded}.${sign(encoded)}`,
    confirmationId: body.jti,
    previewedAt: new Date(body.iat).toISOString(),
    expiresAt: new Date(body.exp).toISOString(),
  };
}

export class ConfirmTokenError extends Error {}

export interface VerifiedConfirmToken {
  confirmationId: string;
  previewedAt: string;
}

/**
 * Verify a token against the write actually being attempted. Throws
 * ConfirmTokenError with rep-facing wording on any mismatch — a token that
 * doesn't match its write is a bug or an attack, never something to wave
 * through, because waving it through is precisely the false "rep confirmed
 * this" the audit log must never record.
 */
export function verifyConfirmToken(
  token: string,
  subject: ConfirmTokenSubject,
  now = Date.now(),
): VerifiedConfirmToken {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new ConfirmTokenError("Malformed confirmation token — re-open the record and try again.");
  }
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ConfirmTokenError(
      "Confirmation token failed verification — nothing was written. Re-open the record and try again.",
    );
  }

  let body: TokenBody;
  try {
    body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenBody;
  } catch {
    throw new ConfirmTokenError("Malformed confirmation token — re-open the record and try again.");
  }

  if (now > body.exp) {
    throw new ConfirmTokenError(
      "This confirmation expired before it was submitted — nothing was written. Review the changes and confirm again.",
    );
  }
  const matches =
    body.t === subject.tenantId &&
    body.o === subject.object &&
    body.r === subject.recordId &&
    body.a === (subject.actorUserId ?? "") &&
    body.p === hashPatch(subject.patch);
  if (!matches) {
    throw new ConfirmTokenError(
      "This confirmation doesn't match the changes being written — nothing was written. Review the changes and confirm again.",
    );
  }
  return { confirmationId: body.jti, previewedAt: new Date(body.iat).toISOString() };
}
