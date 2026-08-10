/**
 * Deploy touch 2026-07-26b: quick-actions diff fix is packages-only; watch patterns need an apps/ change.
 * HTTP entry: streamable HTTP, stateless JSON — a fresh McpServer + transport
 * per request, nothing held in memory between calls (PLAN.md multi-tenancy rule).
 *
 * NOTE: runtime behavior also depends on @cardstack/crm-adapters (objects,
 * describe, relationships, reference-name resolution read from the CRM) and on
 * @cardstack/widgets (the inlined record card). Railway's deploy watch pattern
 * only covers /apps/**, so a packages-only change is SKIPPED — touch this file to
 * force a rebuild that picks up the bundled package changes.
 */
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  cardstackSalesforceLoginApp,
  describeSalesforceAuthError,
  createAdapterForConnection,
  createDevSalesforceAdapter,
  devSalesforceOrg,
  salesforceUsesOAuth,
  type ConnectionSettings,
} from "@cardstack/crm-adapters";
import {
  createPostgresConfigStore,
  encryptionEnabled,
  type AdminConfigStore,
} from "@cardstack/config-store";
import { createCardstackServer } from "./server.js";
import { defaultConfigPath, FileConfigStore, DEMO_TENANT_ID } from "./config/store.js";
import { userContextFromHeaders } from "./auth.js";
import { resolveMcpAuth } from "./auth-config.js";
import { CardstackOAuthProvider, userContextFromStoredUser } from "./oauth-provider.js";
import { escapeHtml, renderConsent, renderConsentExpired } from "./consent.js";
import {
  InMemoryAuditLog,
  FileAuditLog,
  createPostgresAuditLog,
  defaultAuditPath,
  type AuditLog,
} from "./audit.js";
import { ConfigPreferenceStore } from "./config/preferences.js";

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Sign-in failures are shown to a rep in a browser tab, so escape the cause —
 * and translate Salesforce's policy refusals, which are the ones a rep can
 * actually do something about (by asking the right person for the right thing).
 */
function renderSignInFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const guidance = describeSalesforceAuthError(raw, {
    name: "Cardstack",
    clientId: cardstackSalesforceLoginApp()?.clientId,
  });
  const next = guidance.needsSalesforceAdmin
    ? "Once that is done, connect Cardstack again from your chat app."
    : "Close this tab and try connecting again from your chat app.";
  return `<h3>Cardstack sign-in failed</h3><p>${escapeHtml(guidance.message)}</p><p>${escapeHtml(next)}</p>`;
}

// Durable-ish state shared across stateless requests. Config comes from the
// store Studio writes to — published layouts are read at render time, so a
// Studio publish changes the next render with no restart (GP3).
// DATABASE_URL → Postgres (Railway/Neon); otherwise the file-backed store.
// The adapter is resolved PER REQUEST from the tenant's connection: mock
// portal (a shared singleton so demo writes persist) or a live HubSpot /
// Salesforce adapter (cached per credential set by the factory).
// Durable audit: Postgres when DATABASE_URL is set (survives Railway redeploys),
// file-backed locally, in-memory only as a last resort.
const auditLog: AuditLog = process.env.DATABASE_URL
  ? await createPostgresAuditLog(process.env.DATABASE_URL)
  : process.env.CARDSTACK_AUDIT_PATH || !process.env.NO_FILE_AUDIT
    ? new FileAuditLog(defaultAuditPath())
    : new InMemoryAuditLog();
console.log(`audit log: ${process.env.DATABASE_URL ? "postgres" : "file"}`);
const configStore: AdminConfigStore = process.env.DATABASE_URL
  ? await createPostgresConfigStore(process.env.DATABASE_URL)
  : new FileConfigStore(defaultConfigPath());
console.log(`config store: ${process.env.DATABASE_URL ? "postgres" : "file"}`);
if (process.env.NODE_ENV === "production" && !encryptionEnabled()) {
  throw new Error(
    "Refusing to start in production without CARDSTACK_ENCRYPTION_KEY; CRM and OAuth secrets must be encrypted at rest.",
  );
}
const preferences = new ConfigPreferenceStore(configStore);

const app = express();

// CORS: scope to the chat hosts that legitimately embed widgets when
// CORS_ORIGINS is set (comma-separated); otherwise wildcard, with a warning.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins }));
} else {
  console.warn("⚠ CORS is wildcard — set CORS_ORIGINS to the chat host origins.");
  app.use(cors());
}
app.use(express.json({ limit: "4mb" }));

// Reports the running build so "is my change actually live?" is one curl.
//
// ORDER MATTERS, and it used to be backwards. CARDSTACK_RELEASE_SHA is set by
// hand, so whenever it was set it WON over the SHA Railway injects for the
// deploy that is actually running — and a hand-set value is stale the moment
// the next deploy lands. On 2026-08-10 this endpoint reported 9003a2bf1fc8 for
// hours while serving 6aeb6be, during an incident where "is production running
// my code?" was the whole question. A health endpoint that can lie about the
// build is worse than one that admits it doesn't know, so the platform's own
// value comes first and the manual override is only a fallback for
// `railway up` tarball deploys, where Railway injects nothing.
const BOOTED_AT = new Date().toISOString();
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.CARDSTACK_RELEASE_SHA ??
      "local",
    bootedAt: BOOTED_AT,
  });
});

// Shared-secret fallback for deployments that do not use per-user OAuth.
const { secret: MCP_SECRET, warnOpen } = resolveMcpAuth(process.env);
function authorized(req: express.Request): boolean {
  if (!MCP_SECRET) return true;
  const header = req.header("x-cardstack-key");
  if (header && header === MCP_SECRET) return true;
  const bearer = req.header("authorization");
  return bearer === `Bearer ${MCP_SECRET}`;
}

// --- Per-user OAuth (CARDSTACK_USER_AUTH=oauth): Salesforce is the IdP. ---
// Opt-in by env so a half-configured deploy degrades to the shared-secret
// mode instead of crash-looping (the 6a8913b lesson: never fail closed at
// boot). Requires CARDSTACK_MCP_URL (public origin) and the Salesforce
// Connected App to allowlist `<origin>/oauth/salesforce/callback`.
const USER_AUTH_MODE = process.env.CARDSTACK_USER_AUTH === "oauth";
const MCP_ORIGIN = (process.env.CARDSTACK_MCP_URL ?? "").trim().replace(/\/$/, "");
// The legacy connected-app fallback is for deployments that predate the
// Cardstack-owned app and still keep one on their tenant's admin connection.
// It used to default to DEMO_TENANT_ID, which armed it on EVERY deployment
// including ones that never had a legacy tenant. Arm it only when a legacy
// tenant is named explicitly.
const LEGACY_TENANT = process.env.CARDSTACK_TENANT_ID?.trim() || undefined;
const oauthProvider =
  USER_AUTH_MODE && MCP_ORIGIN
    ? new CardstackOAuthProvider({
        // No tenantId: the workspace is resolved from the Salesforce org the
        // rep signs in to, so one server serves every workspace.
        store: configStore,
        mcpOrigin: MCP_ORIGIN,
        ...(LEGACY_TENANT ? { legacyTenantId: LEGACY_TENANT } : {}),
      })
    : undefined;
if (USER_AUTH_MODE && !oauthProvider) {
  console.warn(
    "⚠ CARDSTACK_USER_AUTH=oauth but CARDSTACK_MCP_URL is unset — per-user auth DISABLED, serving shared-secret mode.",
  );
}
if (process.env.NODE_ENV === "production" && !oauthProvider && !MCP_SECRET) {
  throw new Error(
    "Refusing to expose /mcp in production without configured per-user OAuth or MCP_SHARED_SECRET.",
  );
}
if (oauthProvider) {
  console.log("MCP auth: per-user OAuth");
} else if (!MCP_SECRET) {
  console.warn(
    (warnOpen ? "⚠ PRODUCTION: " : "⚠ ") +
      "/mcp is UNAUTHENTICATED — set MCP_SHARED_SECRET or configure per-user OAuth.",
  );
}
if (oauthProvider) {
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(MCP_ORIGIN),
      resourceName: "Cardstack CRM",
    }),
  );
  app.get("/oauth/salesforce/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    try {
      if (error) throw new Error(error_description ?? error);
      if (!code || !state) throw new Error("Salesforce callback was missing code or state.");
      const { redirect } = await oauthProvider.completeSalesforceCallback(state, code);
      res.redirect(redirect);
    } catch (err) {
      res.status(400).send(renderSignInFailure(err));
    }
  });

  // C2: production or sandbox, chosen before the Salesforce leg. Only reachable
  // with a signed pointer at a pending authorization this browser started.
  app.get("/oauth/login-host", async (req, res) => {
    const { t, env } = req.query as Record<string, string | undefined>;
    const redirect = t ? await oauthProvider.chooseLoginHost(t, env ?? "production") : undefined;
    if (!redirect) {
      res.status(400).send(renderConsentExpired());
      return;
    }
    res.redirect(redirect);
  });

  // A1: the consent interstitial. GET renders it, POST applies the decision.
  // No cookie is involved, so there is nothing for a cross-site POST to ride —
  // the signed continuation token is the only thing that authorizes either.
  app.get("/oauth/consent", async (req, res) => {
    const token = (req.query as Record<string, string | undefined>).t;
    const prompt = token ? await oauthProvider.describeConsent(token) : undefined;
    if (!prompt) {
      res.status(400).send(renderConsentExpired());
      return;
    }
    res.send(renderConsent(prompt, `${MCP_ORIGIN}/oauth/consent`));
  });

  app.post("/oauth/consent", express.urlencoded({ extended: false }), async (req, res) => {
    const { token, decision } = (req.body ?? {}) as { token?: string; decision?: string };
    const outcome = token
      ? await oauthProvider.completeConsent(token, decision === "allow" ? "allow" : "deny")
      : undefined;
    if (!outcome) {
      res.status(400).send(renderConsentExpired());
      return;
    }
    res.redirect(outcome.redirect);
  });
  const bearer = requireBearerAuth({ verifier: oauthProvider });
  app.use("/mcp", (req, res, next) => bearer(req, res, next));
  console.log("Per-user OAuth is ON — /mcp requires a Cardstack bearer token (Salesforce sign-in).");
}

// Fixed-window in-memory rate limit per IP (no new deps). Env-tunable; a
// runaway or abusive caller can't burn the portal's CRM quota.
const RATE_LIMIT = Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? 120);
const windows = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const w = windows.get(ip);
  if (!w || now >= w.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + 60_000 });
    // Opportunistic prune so the map stays bounded.
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k);
    }
    return false;
  }
  w.count += 1;
  return w.count > RATE_LIMIT;
}

app.all("/mcp", async (req, res) => {
  // OAuth mode: requireBearerAuth already validated the user token (the
  // Authorization header carries it, so the shared-secret check must not run).
  if (!oauthProvider && !authorized(req)) {
    res.status(401).json({ error: "Unauthorized — missing or wrong x-cardstack-key." });
    return;
  }
  if (rateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Rate limit exceeded — retry shortly." });
    return;
  }
  // Identity: the VERIFIED token in OAuth mode; spoofable headers otherwise
  // (legacy/demo mode only — per-user auth is the production posture).
  const tokenUser = oauthProvider
    ? (req.auth?.extra?.user as Parameters<typeof userContextFromStoredUser>[0] | undefined)
    : undefined;
  // B1: in OAuth mode this must FAIL, not fall through. A token that verifies
  // but carries no user used to resolve to CARDSTACK_TENANT_ID as the default
  // user — serving the legacy tenant's records to an unidentified caller. There
  // is no safe default here; 401 is the only correct answer.
  if (oauthProvider && !tokenUser) {
    res.status(401).json({ error: "This token carries no identity. Sign in again." });
    return;
  }
  const userContext = tokenUser
    ? userContextFromStoredUser(tokenUser)
    : userContextFromHeaders({ get: (name) => req.header(name) });
  const connection = await configStore.getConnection(userContext.tenantId);
  let adapterSettings: ConnectionSettings = {
    crm: connection.crm,
    ...(connection.credentials ? { credentials: connection.credentials } : {}),
    // Shared with Studio via the store: a refresh bumps changedAt, which busts
    // this process's cached adapter on its next request too.
    cacheNonce: connection.changedAt,
    // Rotation-enabled orgs: a rotated token that isn't persisted strands a
    // dead one in the store, killing every other process's next refresh.
    onCredentialsRefreshed: async (credentials) => {
      await configStore.setConnection({
        ...connection,
        credentials,
        changedAt: new Date().toISOString(),
      });
    },
    getFreshCredentials: async () =>
      (await configStore.getConnection(userContext.tenantId)).credentials ?? null,
  };
  let runtimeAuth: Parameters<typeof createCardstackServer>[0]["runtimeAuth"] | undefined;
  if (
    connection.status === "connected" &&
    connection.crm === "salesforce" &&
    salesforceUsesOAuth(connection.credentials)
  ) {
    const userConnection = await configStore.getUserConnection(
      userContext.tenantId,
      userContext.userId,
      "salesforce",
    );
    // A per-user token can only be refreshed with the secret of the app that
    // MINTED it. Chat sign-in uses the Cardstack-owned app while a BYO
    // workspace's admin lane uses its own, so match the stored clientId against
    // both and carry the matching secret — comparing only against the admin
    // connection silently ignored every chat-signed-in rep.
    const loginApp = cardstackSalesforceLoginApp();
    const userClientId = userConnection?.credentials?.clientId;
    const userClientSecret = !userClientId
      ? undefined
      : userClientId === loginApp?.clientId
        ? loginApp.clientSecret
        : userClientId === connection.credentials?.clientId
          ? connection.credentials?.clientSecret
          : undefined;
    if (userConnection?.status === "connected" && userConnection.credentials && userClientSecret) {
      const liveUserConnection = userConnection;
      adapterSettings = {
        crm: "salesforce",
        credentials: {
          ...userConnection.credentials,
          // The secret is never stored per user — merge in the one belonging
          // to the app that minted this token so refresh works.
          clientSecret: userClientSecret,
        },
        cacheNonce: userConnection.changedAt,
        // Persist rotated tokens back to the per-user connection (minus the
        // shared client secret, which is never stored per user).
        onCredentialsRefreshed: async (credentials) => {
          const { clientSecret: _omit, ...userCreds } = credentials;
          await configStore.setUserConnection({
            ...liveUserConnection,
            credentials: userCreds,
            changedAt: new Date().toISOString(),
          });
        },
        getFreshCredentials: async () => {
          const latest = await configStore.getUserConnection(
            userContext.tenantId,
            userContext.userId,
            "salesforce",
          );
          if (latest?.status !== "connected" || !latest.credentials) return null;
          return { ...latest.credentials, clientSecret: userClientSecret };
        },
      };
    } else {
      const studioBase = (process.env.CARDSTACK_STUDIO_URL ?? "http://localhost:3002").replace(/\/$/, "");
      // C1: this branch already knows whose problem it is, and the card used to
      // throw that away. A rep signed in through a chat host owns their own
      // per-user grant; the Studio link only helps when the WORKSPACE's shared
      // connection is what broke, and only an admin can follow it anyway.
      runtimeAuth = {
        missingUserAuth: true,
        crmLabel: "Salesforce",
        reauthKind: "user",
        connectUrl: `${studioBase}/me/connection`,
      };
    }
  }
  // LOCAL DEV: CARDSTACK_DEV_SF_ORG routes every tool call at a real Salesforce
  // org through the sf CLI's own auth, bypassing the stored connection so no
  // deployed refresh token is read or rotated. Unset everywhere else.
  const devOrg = devSalesforceOrg();
  const adapter = devOrg
    ? createDevSalesforceAdapter(devOrg)
    : createAdapterForConnection(adapterSettings);
  const server = await createCardstackServer({
    adapter,
    configStore,
    auditLog,
    preferences,
    tenantId: userContext.tenantId,
    userContext,
    ...(runtimeAuth ? { runtimeAuth } : {}),
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(
    `Cardstack MCP server on http://localhost:${PORT}/mcp (default tenant ${process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID})`,
  );
});
