import {
  DEFAULT_AUDIENCE,
  DEFAULT_USER_NAME,
  defaultUserContext,
  normalizeUserId,
  type UserContext,
} from "@cardstack/core";
import { DEMO_TENANT_ID } from "./config/store.js";

const TENANT_HEADER = "x-cardstack-tenant-id";
const USER_ID_HEADER = "x-cardstack-user-id";
const USER_EMAIL_HEADER = "x-cardstack-user-email";
const USER_NAME_HEADER = "x-cardstack-user-name";
const AUDIENCE_HEADER = "x-cardstack-audience";

/**
 * Whether request headers may name the caller.
 *
 * They may not in production, at all. `x-cardstack-tenant-id` is a claim, not a
 * proof, so honoring it lets any caller who reaches the server read and write
 * ANY workspace's records — cross-tenant spoofing by design.
 *
 * `CARDSTACK_ALLOW_HEADER_IDENTITY=1` used to re-enable exactly that in
 * production. Nothing in the repo ever set it and the documentation said never
 * to use it, so it was a switch that could only ever be flipped by mistake or
 * by an attacker who had already reached the environment. It is gone.
 *
 * What remains is the local development path, and it now needs TWO conditions:
 * a non-production build AND an explicit `CARDSTACK_DEV_IDENTITY=1`. The demo
 * scripts and `pnpm dev` set it; nothing else does. Production identity comes
 * from the OAuth bearer token (see oauth-provider.ts).
 */
function headerIdentityAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CARDSTACK_DEV_IDENTITY === "1";
}

/**
 * Identity for the non-OAuth lane: local demos and pre-OAuth single-tenant
 * deployments. In OAuth mode this is never reached — `/mcp` 401s a token that
 * carries no identity rather than falling through to here.
 *
 * `CARDSTACK_TENANT_ID` is read here ONLY because a legacy single-tenant
 * deployment has exactly one workspace and no other way to name it. It is not a
 * default for a multi-workspace deployment, and CLAUDE.md says as much.
 */
export function userContextFromHeaders(headers: {
  get(name: string): string | string[] | undefined;
}): UserContext {
  const demo = defaultUserContext(process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID);
  const allowHeaders = headerIdentityAllowed();
  const header = (name: string): string | undefined => {
    if (!allowHeaders) return undefined;
    const value = headers.get(name);
    return Array.isArray(value) ? value[0] : value;
  };
  const email = first(header(USER_EMAIL_HEADER), process.env.CARDSTACK_USER_EMAIL);
  const rawUserId =
    first(
      header(USER_ID_HEADER),
      email,
      process.env.CARDSTACK_USER_ID,
      demo.userId,
    ) ?? demo.userId;
  const userId = normalizeUserId(rawUserId) || demo.userId;
  const name =
    first(header(USER_NAME_HEADER), process.env.CARDSTACK_USER_NAME, email, DEFAULT_USER_NAME) ??
    DEFAULT_USER_NAME;
  return {
    tenantId: first(header(TENANT_HEADER), process.env.CARDSTACK_TENANT_ID, demo.tenantId) ?? demo.tenantId,
    userId,
    name,
    ...(email ? { email } : {}),
    audience: first(header(AUDIENCE_HEADER), process.env.CARDSTACK_AUDIENCE, DEFAULT_AUDIENCE) ?? DEFAULT_AUDIENCE,
  };
}

function first(...values: (string | null | undefined)[]): string | undefined {
  return values.find((value) => value !== null && value !== undefined && value.trim() !== "")?.trim();
}
