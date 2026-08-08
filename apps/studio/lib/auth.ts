/**
 * Who is making this Studio request.
 *
 * Was: whatever the caller claimed. `x-cardstack-user-id` / `x-cardstack-tenant-id`
 * headers (or the matching cookies) were read straight into a UserContext with
 * no verification, and the workspace fell back to a process-wide env var — so
 * anyone who could reach Studio could act as any user in any workspace, and a
 * deployment could only ever serve one customer.
 *
 * Now: the session cookie names a session record in the config store, and that
 * record is the only source of account + workspace. Headers are ignored.
 *
 * **This module is the authorization choke point for Studio.** Every page,
 * route handler, and server component reaches identity through
 * `getStudioIdentity` or `getUserContext`, both of which end up in
 * `resolveStudioSession` — so a session that fails the checks there has no
 * `tenantId` to query with and a new route cannot forget to ask.
 *
 * That is deliberate. The role check used to live in the sign-in callback
 * alone: correct, but one route handler out of twenty-six, and nothing behind
 * it enforced anything. A `requireAdmin()` helper would have been twenty-six
 * call sites to remember. Refusing to resolve the session at all is one.
 *
 * The single exception is local development, where `pnpm dev` / `dev:sf` / the
 * demo scripts have no browser login to go through. It needs TWO conditions —
 * a non-production build AND an explicit `CARDSTACK_DEV_IDENTITY=1` — and it
 * reads ENV VARS ONLY. It used to read `x-cardstack-*` headers and cookies too,
 * which meant a request could name its own identity on any non-production
 * build: fine on a laptop, and exactly the shape you do not want reachable if a
 * staging box is ever built without NODE_ENV set.
 */
import { cookies } from "next/headers";
import {
  DEFAULT_AUDIENCE,
  DEFAULT_USER_NAME,
  defaultUserContext,
  normalizeUserId,
  type UserContext,
} from "@cardstack/core";
import {
  DEMO_TENANT_ID,
  type Account,
  type MembershipRole,
  type Workspace,
} from "@cardstack/config-store";
import type { AdminConfigStore } from "@cardstack/config-store";
import { getStore } from "./backend";
import {
  readStudioSession,
  SESSION_IDLE_SECONDS,
  SESSION_LAST_SEEN_THROTTLE_SECONDS,
  SESSION_TTL_SECONDS,
  sessionSigningSecrets,
  STUDIO_SESSION_COOKIE,
  STUDIO_SESSION_NS,
  type StudioSessionRecord,
} from "./studio-session";

/** A verified, signed-in Studio principal. */
export interface StudioIdentity {
  account: Account;
  workspace: Workspace;
  role: MembershipRole;
}

/** Both conditions, deliberately. See the module comment. */
const devIdentityAllowed = (): boolean =>
  process.env.NODE_ENV !== "production" && process.env.CARDSTACK_DEV_IDENTITY === "1";

/**
 * Resolve the signed-in identity, or null. Verifies the cookie signature, then
 * loads the session record — a revoked or expired session resolves to null even
 * while the cookie is still cryptographically valid.
 */
export async function getStudioIdentity(): Promise<StudioIdentity | null> {
  const secrets = sessionSigningSecrets();
  if (secrets.length === 0) return null;
  const jar = await cookies();
  const sessionId = await readStudioSession(jar.get(STUDIO_SESSION_COOKIE)?.value, secrets);
  if (!sessionId) return null;
  return resolveSessionId(sessionId);
}

export async function resolveSessionId(sessionId: string): Promise<StudioIdentity | null> {
  return resolveStudioSession(await getStore(), sessionId);
}

/**
 * The one identity resolution that admits members: `/me/connection`, where a
 * rep manages their OWN CRM authorization and nothing else.
 *
 * Written as a separate entry point rather than a flag on `resolveStudioSession`
 * on purpose. The choke point stays absolute — there is no parameter that makes
 * it let a member through — so this is a decision each caller makes explicitly
 * and a reviewer can find by grepping for one name.
 */
export async function getSelfServiceIdentity(): Promise<StudioIdentity | null> {
  const secrets = sessionSigningSecrets();
  if (secrets.length === 0) return null;
  const jar = await cookies();
  const sessionId = await readStudioSession(jar.get(STUDIO_SESSION_COOKIE)?.value, secrets);
  if (!sessionId) return null;
  return resolveStudioSession(await getStore(), sessionId, Date.now(), { allowMembers: true });
}

/**
 * Store-level session resolution — the choke point itself, taking its store so
 * it can be tested without a running Next.js.
 *
 * Returns null, meaning "not signed in", for four distinct reasons. They are
 * deliberately indistinguishable to the caller: a page that could tell "your
 * session expired" from "you are not an admin" would be a page that leaks
 * membership to anyone holding a stale cookie.
 */
export async function resolveStudioSession(
  store: Pick<AdminConfigStore, "kvGet" | "kvSet" | "kvDelete" | "getAccount" | "getWorkspace" | "getMembership">,
  sessionId: string,
  now: number = Date.now(),
  /** Set ONLY by `getSelfServiceIdentity`. See its comment. */
  options: { allowMembers?: boolean } = {},
): Promise<StudioIdentity | null> {
  const record = (await store.kvGet(STUDIO_SESSION_NS, sessionId)) as
    | StudioSessionRecord
    | undefined;
  if (!record) return null;

  // 1. Idle. Records written before idle expiry existed have no lastSeenAt;
  //    fall back to createdAt so a deploy does not log out a live admin.
  const lastSeen = Date.parse(record.lastSeenAt ?? record.createdAt);
  if (Number.isFinite(lastSeen) && now - lastSeen > SESSION_IDLE_SECONDS * 1_000) {
    await store.kvDelete(STUDIO_SESSION_NS, sessionId);
    return null;
  }

  const [account, workspace, membership] = await Promise.all([
    store.getAccount(record.accountId),
    store.getWorkspace(record.workspaceId),
    store.getMembership(record.accountId, record.workspaceId),
  ]);
  // 2. Membership is re-read rather than trusted from the session: removing
  //    someone from a workspace must take effect on their next request, not
  //    when their cookie happens to expire.
  if (!account || !workspace || !membership) return null;

  // 3. Studio is for workspace admins. A member holds no Studio session at all
  //    — not a read-only one — so this is where a demotion takes effect, on the
  //    next request rather than in fourteen days.
  if (membership.role !== "admin" && !options.allowMembers) return null;

  // 4. Touch, throttled. The absolute expiry is recomputed from createdAt so a
  //    refresh can never push the session past its 14-day cap.
  if (!Number.isFinite(lastSeen) || now - lastSeen > SESSION_LAST_SEEN_THROTTLE_SECONDS * 1_000) {
    const absoluteExpiry = Date.parse(record.createdAt) + SESSION_TTL_SECONDS * 1_000;
    await store.kvSet(
      STUDIO_SESSION_NS,
      sessionId,
      { ...record, lastSeenAt: new Date(now).toISOString() } as unknown as Record<string, unknown>,
      new Date(Number.isFinite(absoluteExpiry) ? absoluteExpiry : now + SESSION_TTL_SECONDS * 1_000).toISOString(),
    );
  }

  return { account, workspace, role: membership.role };
}

/**
 * The UserContext the rest of Studio already consumes. Derived from the
 * session; in local dev only, falls back to the previous header/env behavior so
 * the credential-free dev loop and demo scripts keep working.
 */
export async function getUserContext(): Promise<UserContext> {
  const identity = await getStudioIdentity();
  if (identity) return userContextFor(identity);
  if (!devIdentityAllowed()) {
    throw new Error("Not signed in.");
  }
  return devUserContext();
}

/**
 * Route-handler flavor. The `req` argument is vestigial — identity now comes
 * from the verified session cookie via `next/headers`, never from anything the
 * caller puts on the request — but it is kept so the ~20 existing call sites
 * read unchanged apart from the added `await`.
 */
export async function getUserContextFromRequest(_req?: Request): Promise<UserContext> {
  return getUserContext();
}

export function userContextFor(identity: StudioIdentity): UserContext {
  return {
    tenantId: identity.workspace.id,
    userId: identity.account.id,
    name: identity.account.name,
    ...(identity.account.email ? { email: identity.account.email } : {}),
    audience: DEFAULT_AUDIENCE,
  };
}

/**
 * LOCAL DEV ONLY — unreachable in a production build and without an explicit
 * opt-in. Env vars only: no header, no cookie, so nothing a REQUEST carries can
 * choose who it is, even here.
 */
function devUserContext(): UserContext {
  const demo = defaultUserContext(process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID);
  const email = process.env.CARDSTACK_USER_EMAIL?.trim() || undefined;
  const rawUserId = process.env.CARDSTACK_USER_ID?.trim() || email || demo.userId;
  return {
    tenantId: process.env.CARDSTACK_TENANT_ID?.trim() || demo.tenantId,
    userId: normalizeUserId(rawUserId) || demo.userId,
    name: process.env.CARDSTACK_USER_NAME?.trim() || email || DEFAULT_USER_NAME,
    ...(email ? { email } : {}),
    audience: process.env.CARDSTACK_AUDIENCE?.trim() || DEFAULT_AUDIENCE,
  };
}
