import { NextResponse } from "next/server";
import {
  createStudioSession,
  expiredSessionCookieOptions,
  newSessionId,
  readStudioSession,
  sessionSigningSecrets,
  STUDIO_SESSION_NS,
  STUDIO_SESSION_COOKIE,
  studioSessionCookieOptions,
} from "../../../lib/studio-session";
import { getStore, LEGACY_TENANT_ID } from "../../../lib/backend";
import { clientKey, rateLimited } from "../../../lib/request-guard";
import { parseSalesforceIdentityUrl } from "@cardstack/crm-adapters";

/**
 * Failed access-key attempts per minute per source address before this route
 * starts refusing. Low on purpose: nobody types the key ten times a minute, and
 * the value it guards is a workspace-admin session.
 */
const MAX_FAILURES_PER_MINUTE = 5;

export async function POST(req: Request) {
  const signingSecret = sessionSigningSecrets(process.env)[0];
  const accessKey = process.env.STUDIO_SHARED_SECRET?.trim();
  if (!signingSecret || !accessKey) {
    return NextResponse.json(
      { error: "Studio authentication is not configured." },
      { status: 503 },
    );
  }
  const source = clientKey(req);
  const body = (await req.json().catch(() => ({}))) as { secret?: string };
  if (!body.secret || body.secret !== accessKey) {
    // Guessing this key used to be an unlimited online attack that left no
    // trace anywhere. Count the failure, refuse past the limit, and always say
    // so out loud — the log line matters more than the limit, because it is
    // what makes an attempt visible at all.
    const limited = rateLimited(`session-key:${source}`, { max: MAX_FAILURES_PER_MINUTE });
    console.warn(
      `[security] rejected workspace access key from ${source}${limited ? " (rate limited)" : ""}`,
    );
    if (limited) {
      return NextResponse.json(
        { error: "Too many attempts. Wait a minute and try again." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "That access key is not valid." }, { status: 401 });
  }
  const store = await getStore();
  const accountId = process.env.CARDSTACK_USER_ID ?? "access-key-admin";
  const workspaceId = process.env.CARDSTACK_TENANT_ID ?? LEGACY_TENANT_ID;
  const createdAt = new Date().toISOString();

  // Self-retiring. Once someone has signed in to this workspace with a real
  // Salesforce identity, the migration this bridge exists for is done — and
  // leaving it open would keep a shared secret as a permanent second door into
  // an account model whose whole point is that identity is verified.
  if (await hasSalesforceAdmin(store, workspaceId)) {
    console.warn(`[security] access-key sign-in refused for ${workspaceId}: it has a Salesforce admin`);
    return NextResponse.json(
      {
        error:
          "This workspace has a Salesforce admin now. Sign in with Salesforce instead — the access key is no longer accepted.",
      },
      { status: 410 },
    );
  }

  // Compatibility bridge for deployments that predate Cardstack accounts.
  // The shared access key represents the existing workspace administrator, so
  // create the additive identity rows once and let normal session resolution
  // use them from then on. These store operations are idempotent.
  if (!(await store.getWorkspace(workspaceId))) {
    const connection = await store.getConnection(workspaceId);
    const salesforceOrgId =
      connection.crm === "salesforce"
        ? parseSalesforceIdentityUrl(connection.credentials?.identityUrl)?.orgId
        : undefined;
    await store.createWorkspace({
      id: workspaceId,
      // A live Salesforce admin connection already contains the authoritative
      // org id. Reuse it so future Salesforce sign-ins resolve to this legacy
      // tenant instead of creating an empty parallel workspace.
      salesforceOrgId: salesforceOrgId ?? `legacy-workspace-${workspaceId}`,
      name: process.env.CARDSTACK_WORKSPACE_NAME ?? "Cardstack workspace",
      createdAt,
    });
  }
  await store.upsertAccount({
    id: accountId,
    salesforceUserId: `legacy-user-${accountId}`,
    name: process.env.CARDSTACK_USER_NAME ?? "Workspace admin",
    ...(process.env.CARDSTACK_USER_EMAIL
      ? { email: process.env.CARDSTACK_USER_EMAIL }
      : {}),
    createdAt,
  });
  // Grant admin once, on first use. Do NOT clobber an existing membership: if
  // this account has since been demoted on the People page, the access key must
  // not silently re-promote it — that would make the bridge a permanent way
  // around the role model rather than a migration step out of it.
  const existing = await store.getMembership(accountId, workspaceId);
  if (!existing) {
    await store.setMembership({ accountId, workspaceId, role: "admin", createdAt });
  }
  // Read the role back rather than asserting it. The store is authoritative
  // everywhere else; a session record that disagrees with it would be the one
  // place a claim outranks the data.
  const membership = await store.getMembership(accountId, workspaceId);
  if (membership?.role !== "admin") {
    return NextResponse.json(
      { error: "That account is no longer an admin of this workspace." },
      { status: 403 },
    );
  }

  const sessionId = newSessionId();
  const now = new Date();
  await store.kvSet(
    STUDIO_SESSION_NS,
    sessionId,
    {
      accountId,
      workspaceId,
      role: membership.role,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    },
    new Date(now.getTime() + studioSessionCookieOptions().maxAge * 1_000).toISOString(),
  );
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    STUDIO_SESSION_COOKIE,
    await createStudioSession(sessionId, signingSecret),
    studioSessionCookieOptions(),
  );
  return response;
}

export async function DELETE(req: Request) {
  const secrets = sessionSigningSecrets(process.env);
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STUDIO_SESSION_COOKIE}=`))
    ?.slice(STUDIO_SESSION_COOKIE.length + 1);
  const sessionId =
    secrets.length > 0
      ? await readStudioSession(cookie ? decodeURIComponent(cookie) : undefined, secrets)
      : undefined;
  if (sessionId) await (await getStore()).kvDelete(STUDIO_SESSION_NS, sessionId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STUDIO_SESSION_COOKIE, "", {
    ...expiredSessionCookieOptions(),
  });
  return response;
}

/**
 * True when any admin of this workspace signed in through Salesforce rather
 * than being minted by this bridge. The bridge writes a synthetic
 * `legacy-user-` id; `resolveSignIn` writes a real 18-char Salesforce user id.
 */
async function hasSalesforceAdmin(
  store: Awaited<ReturnType<typeof getStore>>,
  workspaceId: string,
): Promise<boolean> {
  const memberships = await store.listMembershipsForWorkspace(workspaceId).catch(() => []);
  for (const membership of memberships) {
    if (membership.role !== "admin") continue;
    const account = await store.getAccount(membership.accountId);
    if (account && !account.salesforceUserId.startsWith("legacy-user-")) return true;
  }
  return false;
}
