/**
 * HTTP entry: streamable HTTP, stateless JSON — a fresh McpServer + transport
 * per request, nothing held in memory between calls (PLAN.md multi-tenancy rule).
 *
 * Auth (M7):
 *   1. Bearer `cs_live_…` MCP token → tenantId + RunningUser (preferred)
 *   2. Legacy MCP_SHARED_SECRET (header or Bearer) → DEMO_TENANT_ID
 *   3. No secret configured → open demo mode (warns)
 *
 * Adapter credentials:
 *   Prefer per-rep HubSpot OAuth tokens (user_crm_tokens) when present for the
 *   RunningUser; otherwise the workspace integration connection.
 */
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createAdapterForConnection,
  refreshHubSpotAccessToken,
} from "@cardstack/crm-adapters";
import { createPostgresConfigStore, type ConfigStore } from "@cardstack/config-store";
import {
  createMcpTokenStore,
  createUserCrmStore,
  demoRunningUser,
  type McpTokenStore,
  type ResolvedMcpAuth,
  type RunningUser,
  type UserCrmStore,
} from "@cardstack/auth";
import { createCardstackServer } from "./server.js";
import { defaultConfigPath, FileConfigStore, DEMO_TENANT_ID } from "./config/store.js";
import {
  InMemoryAuditLog,
  FileAuditLog,
  createPostgresAuditLog,
  defaultAuditPath,
  type AuditLog,
} from "./audit.js";
import { InMemoryPreferenceStore } from "./config/preferences.js";

const PORT = Number(process.env.PORT ?? 3001);

const auditLog: AuditLog = process.env.DATABASE_URL
  ? await createPostgresAuditLog(process.env.DATABASE_URL)
  : process.env.CARDSTACK_AUDIT_PATH || !process.env.NO_FILE_AUDIT
    ? new FileAuditLog(defaultAuditPath())
    : new InMemoryAuditLog();
console.log(`audit log: ${process.env.DATABASE_URL ? "postgres" : "file"}`);
const preferences = new InMemoryPreferenceStore();
const configStore: ConfigStore = process.env.DATABASE_URL
  ? await createPostgresConfigStore(process.env.DATABASE_URL)
  : new FileConfigStore(defaultConfigPath());
console.log(`config store: ${process.env.DATABASE_URL ? "postgres" : "file"}`);

let mcpTokens: McpTokenStore | null = null;
let userCrm: UserCrmStore | null = null;
if (process.env.DATABASE_URL) {
  mcpTokens = await createMcpTokenStore(process.env.DATABASE_URL);
  userCrm = await createUserCrmStore(process.env.DATABASE_URL);
  console.log("mcp tokens + user CRM: postgres");
}

const app = express();

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

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

const MCP_SECRET = process.env.MCP_SHARED_SECRET;
if (!MCP_SECRET) {
  console.warn(
    "⚠ /mcp accepts unauthenticated demo traffic — set MCP_SHARED_SECRET or require Studio MCP tokens.",
  );
}

function extractBearer(req: express.Request): string | null {
  const header = req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return null;
}

async function resolveAuth(req: express.Request): Promise<ResolvedMcpAuth | null> {
  const bearer = extractBearer(req);
  const keyHeader = req.header("x-cardstack-key");

  if (bearer?.startsWith("cs_live_") && mcpTokens) {
    const resolved = await mcpTokens.resolve(bearer);
    if (resolved) return resolved;
    return null;
  }

  if (MCP_SECRET) {
    if (keyHeader === MCP_SECRET || bearer === MCP_SECRET) {
      return {
        tenantId: DEMO_TENANT_ID,
        user: demoRunningUser("shared_secret"),
      };
    }
    return null;
  }

  return {
    tenantId: DEMO_TENANT_ID,
    user: demoRunningUser("demo"),
  };
}

/**
 * Prefer per-rep HubSpot OAuth credentials when the RunningUser has connected
 * "as me"; otherwise fall back to the workspace integration connection.
 */
async function credentialsForRequest(
  tenantId: string,
  user: RunningUser,
  workspace: { crm: "hubspot" | "salesforce"; credentials?: Record<string, string>; changedAt: string },
): Promise<{
  crm: "hubspot" | "salesforce";
  credentials?: Record<string, string>;
  cacheNonce: string;
  asUser: boolean;
}> {
  if (
    workspace.crm === "hubspot" &&
    user.authMethod === "mcp_token" &&
    user.userId !== "system" &&
    userCrm &&
    process.env.HUBSPOT_CLIENT_ID &&
    process.env.HUBSPOT_CLIENT_SECRET
  ) {
    const tok = await userCrm.getToken(tenantId, user.userId, "hubspot");
    if (tok?.accessToken) {
      let access = tok.accessToken;
      let expiresAt = tok.expiresAt;
      let refresh = tok.refreshToken;
      const stale =
        !expiresAt || new Date(expiresAt).getTime() < Date.now() + 60_000;
      if (stale && refresh) {
        try {
          const refreshed = await refreshHubSpotAccessToken(
            {
              clientId: process.env.HUBSPOT_CLIENT_ID,
              clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
            },
            refresh,
          );
          access = refreshed.accessToken;
          expiresAt = refreshed.expiresAt;
          refresh = refreshed.refreshToken;
          await userCrm.upsertToken({
            tenantId,
            userId: user.userId,
            crm: "hubspot",
            accessToken: access,
            refreshToken: refresh,
            expiresAt,
            scopes: refreshed.scopes ?? tok.scopes,
            portalId: tok.portalId,
          });
        } catch (error) {
          console.warn("per-rep HubSpot refresh failed; falling back to workspace connection", error);
          return {
            crm: workspace.crm,
            ...(workspace.credentials ? { credentials: workspace.credentials } : {}),
            cacheNonce: workspace.changedAt,
            asUser: false,
          };
        }
      }
      return {
        crm: "hubspot",
        credentials: { accessToken: access },
        cacheNonce: `user:${user.userId}:${expiresAt ?? tok.updatedAt}`,
        asUser: true,
      };
    }
  }

  return {
    crm: workspace.crm,
    ...(workspace.credentials ? { credentials: workspace.credentials } : {}),
    cacheNonce: workspace.changedAt,
    asUser: false,
  };
}

const RATE_LIMIT = Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? 120);
const windows = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const w = windows.get(ip);
  if (!w || now >= w.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + 60_000 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k);
    }
    return false;
  }
  w.count += 1;
  return w.count > RATE_LIMIT;
}

app.all("/mcp", async (req, res) => {
  const auth = await resolveAuth(req);
  if (!auth) {
    res.status(401).json({
      error:
        "Unauthorized — pass Authorization: Bearer <cs_live_…> (from Studio → My team) or x-cardstack-key.",
    });
    return;
  }
  if (rateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Rate limit exceeded — retry shortly." });
    return;
  }
  const connection = await configStore.getConnection(auth.tenantId);
  const resolved = await credentialsForRequest(auth.tenantId, auth.user, connection);
  const adapter = createAdapterForConnection({
    crm: resolved.crm,
    ...(resolved.credentials ? { credentials: resolved.credentials } : {}),
    cacheNonce: resolved.cacheNonce,
  });
  const server = await createCardstackServer({
    adapter,
    configStore,
    auditLog,
    preferences,
    tenantId: auth.tenantId,
    runningUser: auth.user,
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
  console.log(`Cardstack MCP server on http://localhost:${PORT}/mcp`);
});
