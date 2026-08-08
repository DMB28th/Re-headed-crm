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
 * The single exception is local development (NODE_ENV !== "production"), where
 * `pnpm dev` / `dev:sf` / the demo scripts have no browser login to go through.
 * That fallback is compiled the same way but can never engage in a production
 * build, which is what keeps it from being a bypass.
 */
import { cookies, headers } from "next/headers";
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
import { getStore } from "./backend";
import {
  readStudioSession,
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

const isDev = (): boolean => process.env.NODE_ENV !== "production";

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
  const store = await getStore();
  const record = (await store.kvGet(STUDIO_SESSION_NS, sessionId)) as
    | StudioSessionRecord
    | undefined;
  if (!record) return null;

  const [account, workspace, membership] = await Promise.all([
    store.getAccount(record.accountId),
    store.getWorkspace(record.workspaceId),
    store.getMembership(record.accountId, record.workspaceId),
  ]);
  // Membership is re-read rather than trusted from the session: removing
  // someone from a workspace must take effect on their next request, not when
  // their cookie happens to expire.
  if (!account || !workspace || !membership) return null;
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
  if (!isDev()) {
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

/** LOCAL DEV ONLY — the pre-login behavior, unreachable in a production build. */
async function devUserContext(): Promise<UserContext> {
  const [headerList, jar] = await Promise.all([headers(), cookies()]);
  const demo = defaultUserContext(process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID);
  const pick = (header: string, cookie: string, env?: string): string | undefined =>
    first(headerList.get(header), jar.get(cookie)?.value, env);

  const email = pick("x-cardstack-user-email", "cardstack_user_email", process.env.CARDSTACK_USER_EMAIL);
  const rawUserId =
    pick("x-cardstack-user-id", "cardstack_user_id", process.env.CARDSTACK_USER_ID) ??
    email ??
    demo.userId;
  return {
    tenantId:
      pick("x-cardstack-tenant-id", "cardstack_tenant_id", process.env.CARDSTACK_TENANT_ID) ??
      demo.tenantId,
    userId: normalizeUserId(rawUserId) || demo.userId,
    name:
      pick("x-cardstack-user-name", "cardstack_user_name", process.env.CARDSTACK_USER_NAME) ??
      email ??
      DEFAULT_USER_NAME,
    ...(email ? { email } : {}),
    audience:
      pick("x-cardstack-audience", "cardstack_audience", process.env.CARDSTACK_AUDIENCE) ??
      DEFAULT_AUDIENCE,
  };
}

function first(...values: (string | null | undefined)[]): string | undefined {
  return values.find((v) => v !== null && v !== undefined && v.trim() !== "")?.trim();
}
