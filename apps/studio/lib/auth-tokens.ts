/**
 * One-time tokens for verify / reset / pending-link, riding the store's KV.
 * The RAW token goes in the email/URL; the KV key is sha256(raw), so a store
 * dump alone cannot mint a usable link (spec §3, §7). Single-use is
 * delete-on-consume; TTL is the KV's own expiry.
 */
import { createHash, randomBytes } from "node:crypto";
import type { AdminConfigStore } from "@cardstack/config-store";

export type KvStore = Pick<AdminConfigStore, "kvGet" | "kvSet" | "kvDelete">;

export const EMAIL_VERIFY_NS = "studio-email-verify";
export const PASSWORD_RESET_NS = "studio-password-reset";
export const PENDING_LINK_NS = "studio-pending-link";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
/** Passwordless-claim links travel by email like verification; same window. */
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
export const LINK_TTL_MS = 10 * 60 * 1000;

const digest = (raw: string): string => createHash("sha256").update(raw).digest("hex");

export async function issueToken(
  store: KvStore,
  ns: string,
  payload: Record<string, unknown>,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await store.kvSet(ns, digest(raw), payload, new Date(Date.now() + ttlMs).toISOString());
  return raw;
}

export async function peekToken(
  store: KvStore,
  ns: string,
  raw: string,
): Promise<Record<string, unknown> | undefined> {
  return store.kvGet(ns, digest(raw));
}

export async function consumeToken(
  store: KvStore,
  ns: string,
  raw: string,
): Promise<Record<string, unknown> | undefined> {
  const key = digest(raw);
  const value = await store.kvGet(ns, key);
  if (value) await store.kvDelete(ns, key);
  return value;
}
