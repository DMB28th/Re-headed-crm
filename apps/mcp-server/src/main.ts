/**
 * HTTP entry: streamable HTTP, stateless JSON — a fresh McpServer + transport
 * per request, nothing held in memory between calls (PLAN.md multi-tenancy rule).
 *
 * Auth (M7):
 *   1. Bearer `cs_live_…` MCP token → tenantId + RunningUser (preferred)
 *   2. Legacy MCP_SHARED_SECRET (header or Bearer) → DEMO_TENANT_ID
 *   3. No secret configured → open demo mode (warns)
 */
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAdapterForConnection } from "@cardstack/crm-adapters";
import { createPostgresConfigStore, type ConfigStore } from "@cardstack/config-store";
import {
  createMcpTokenStore,
  demoRunningUser,
  type McpTokenStore,
  type ResolvedMcpAuth,
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
if (process.env.DATABASE_URL) {
  mcpTokens = await createMcpTokenStore(process.env.DATABASE_URL);
  console.log("mcp tokens: postgres");
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

/**
 * Resolve tenant + running user for this request.
 * Returns null when the caller is not authorized.
 */
async function resolveAuth(req: express.Request): Promise<ResolvedMcpAuth | null> {
  const bearer = extractBearer(req);
  const keyHeader = req.header("x-cardstack-key");

  // Prefer MCP tokens (multi-tenant).
  if (bearer?.startsWith("cs_live_") && mcpTokens) {
    const resolved = await mcpTokens.resolve(bearer);
    if (resolved) return resolved;
    return null;
  }

  // Legacy shared secret → demo tenant.
  if (MCP_SECRET) {
    if (keyHeader === MCP_SECRET || bearer === MCP_SECRET) {
      return {
        tenantId: DEMO_TENANT_ID,
        user: demoRunningUser("shared_secret"),
      };
    }
    // Secret configured but wrong/missing — reject (unless a valid token already matched above).
    return null;
  }

  // Open demo mode: no shared secret required. Prefer tokens when presented;
  // otherwise serve the demo tenant so existing deploys keep working.
  return {
    tenantId: DEMO_TENANT_ID,
    user: demoRunningUser("demo"),
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
  const adapter = createAdapterForConnection({
    crm: connection.crm,
    ...(connection.credentials ? { credentials: connection.credentials } : {}),
    cacheNonce: connection.changedAt,
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
