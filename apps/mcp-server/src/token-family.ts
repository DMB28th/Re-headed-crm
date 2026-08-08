/**
 * Rotation and reuse detection for **Cardstack's own opaque bearer tokens**.
 *
 * SCOPE, because the neighbouring code makes this easy to get wrong: this file
 * has nothing to do with Salesforce refresh tokens. The Cardstack-owned
 * connected app rotates those with reuse detection of its own, and a careless
 * refresh there revokes the live deployment's entire grant family. Nothing here
 * reads, refreshes, or persists a Salesforce credential.
 *
 * What it fixes (B5): `exchangeRefreshToken` returned the SAME refresh token
 * forever. A stolen one was usable for the remainder of its life, silently,
 * alongside the legitimate one, and nothing would ever reveal the theft — we
 * depend on Salesforce having this property and did not have it ourselves.
 *
 * A family is one (account, client) grant. Rotating issues a new refresh token
 * and retires the old one; presenting a retired token is proof that either the
 * legitimate holder or a thief is replaying, and since we cannot tell which,
 * the whole family dies and the rep signs in again.
 */

/** Rotated-away tokens are remembered this long, purely to detect replay. */
export const RETIRED_MEMORY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard ceiling on a grant, measured from when the family was created. Rotation
 * extends a refresh token on use, so without this an active grant would live
 * forever. Before rotation the 30-day TTL was never extended at all — an
 * accident that behaved like a policy; this makes it one.
 */
export const FAMILY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface TokenFamily {
  /** Stable id for the (account, client) grant. */
  familyId: string;
  createdAt: string;
  /** The refresh token currently valid for this family. */
  current: string;
}

export const familyId = (userId: string, clientId: string): string => `${userId}::${clientId}`;

export interface RotationDecision {
  /** Refuse the grant outright and revoke everything in the family. */
  reuseDetected: boolean;
  /** Refuse because the grant is older than the ceiling. */
  expired: boolean;
}

/**
 * What to do with a presented refresh token.
 *
 * `family` is undefined for tokens minted before rotation existed. Those are
 * rotated normally on first use rather than treated as reuse — the opposite
 * choice would revoke every live rep the moment this deploys, which is the one
 * outcome this change must not have.
 */
export function decideRotation(
  family: TokenFamily | undefined,
  presented: string,
  retired: boolean,
  now: number = Date.now(),
): RotationDecision {
  if (retired) return { reuseDetected: true, expired: false };
  if (!family) return { reuseDetected: false, expired: false };
  if (family.current !== presented) {
    // Known family, unknown token: it was superseded and its memory has aged
    // out, or it never belonged here. Either way it is not the live one.
    return { reuseDetected: true, expired: false };
  }
  const age = now - Date.parse(family.createdAt);
  return { reuseDetected: false, expired: Number.isFinite(age) && age > FAMILY_MAX_AGE_MS };
}
