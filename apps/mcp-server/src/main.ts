/**
 * HTTP entry: streamable HTTP, stateless JSON — a fresh McpServer + transport
 * per request, nothing held in memory between calls (PLAN.md multi-tenancy rule).
 */
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAdapterForConnection } from "@cardstack/crm-adapters";
import { createPostgresConfigStore, type ConfigStore } from "@cardstack/config-store";
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
const preferences = new InMemoryPreferenceStore();
const configStore: ConfigStore = process.env.DATABASE_URL
  ? await createPostgresConfigStore(process.env.DATABASE_URL)
  : new FileConfigStore(defaultConfigPath());
console.log(`config store: ${process.env.DATABASE_URL ? "postgres" : "file"}`);

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

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// Shared-secret gate on /mcp. When MCP_SHARED_SECRET is unset the endpoint is
// OPEN (today's behavior, so the live demo keeps working) — but we warn loudly.
const MCP_SECRET = process.env.MCP_SHARED_SECRET;
if (!MCP_SECRET) {
  console.warn(
    "⚠ /mcp is UNAUTHENTICATED — set MCP_SHARED_SECRET and pass it as x-cardstack-key from the chat host.",
  );
}
function authorized(req: express.Request): boolean {
  if (!MCP_SECRET) return true;
  const header = req.header("x-cardstack-key");
  if (header && header === MCP_SECRET) return true;
  const bearer = req.header("authorization");
  return bearer === `Bearer ${MCP_SECRET}`;
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
  if (!authorized(req)) {
    res.status(401).json({ error: "Unauthorized — missing or wrong x-cardstack-key." });
    return;
  }
  if (rateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Rate limit exceeded — retry shortly." });
    return;
  }
  const connection = await configStore.getConnection(DEMO_TENANT_ID);
  const adapter = createAdapterForConnection({
    crm: connection.crm,
    ...(connection.credentials ? { credentials: connection.credentials } : {}),
    // Shared with Studio via the store: a refresh bumps changedAt, which busts
    // this process's cached adapter on its next request too.
    cacheNonce: connection.changedAt,
  });
  const server = await createCardstackServer({
    adapter,
    configStore,
    auditLog,
    preferences,
    tenantId: DEMO_TENANT_ID,
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
  console.log(`Cardstack MCP server on http://localhost:${PORT}/mcp (mock adapter, tenant ${DEMO_TENANT_ID})`);
});
