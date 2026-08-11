/**
 * The ONE place a Studio session record is written. Every lane that
 * authenticates an account — email sign-in, signup, reset, Salesforce — mints
 * through here, so the record shape and expiry can never drift between lanes.
 */
import type { AdminConfigStore } from "@cardstack/config-store";
import {
  createStudioSession,
  newSessionId,
  SESSION_TTL_SECONDS,
  sessionSigningSecrets,
  STUDIO_SESSION_NS,
  type StudioSessionRecord,
} from "./studio-session";

export async function mintStudioSession(
  store: Pick<AdminConfigStore, "kvSet">,
  accountId: string,
  workspaceId: string,
): Promise<string | undefined> {
  const secret = sessionSigningSecrets()[0];
  if (!secret) return undefined;
  const sessionId = newSessionId();
  const now = new Date().toISOString();
  const record: StudioSessionRecord = {
    accountId,
    workspaceId,
    role: "admin", // vestigial snapshot; authority is ownership at the choke point
    createdAt: now,
    lastSeenAt: now,
  };
  await store.kvSet(
    STUDIO_SESSION_NS,
    sessionId,
    record as unknown as Record<string, unknown>,
    new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  );
  return createStudioSession(sessionId, secret);
}
