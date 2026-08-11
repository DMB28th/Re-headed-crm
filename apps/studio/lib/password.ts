/**
 * argon2id via @node-rs/argon2 (native — Node runtime only, NEVER import from
 * middleware.ts). Parameters are the OWASP argon2id baseline: m=19 MiB, t=2,
 * p=1. verifyPassword never throws: a malformed stored hash is "wrong
 * password", not a 500 a caller can distinguish.
 */
import { hash, verify } from "@node-rs/argon2";

const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 256;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/**
 * Sign-in with an unknown email must cost the same as a wrong password —
 * otherwise response time answers "does this account exist" (spec §3).
 */
let dummyHash: Promise<string> | undefined;
export async function burnTimingForMissingAccount(password: string): Promise<void> {
  dummyHash ??= hash("cardstack-timing-dummy", OPTIONS);
  await verifyPassword(await dummyHash, password);
}
