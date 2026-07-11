/**
 * HTTP entry: streamable HTTP, stateless JSON — a fresh McpServer + transport
 * per request, nothing held in memory between calls (PLAN.md multi-tenancy rule).
 */
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { createPostgresConfigStore, type ConfigStore } from "@cardstack/config-store";
import { createCardstackServer } from "./server.js";
import { defaultConfigPath, FileConfigStore, DEMO_TENANT_ID } from "./config/store.js";
import { InMemoryAuditLog } from "./audit.js";
import { InMemoryPreferenceStore } from "./config/preferences.js";

const PORT = Number(process.env.PORT ?? 3001);

// Durable-ish state shared across stateless requests (the mock adapter is
// shared so demo writes survive between tool calls). Config comes from the
// store Studio writes to — published layouts are read at render time, so a
// Studio publish changes the next render with no restart (GP3).
// DATABASE_URL → Postgres (Railway/Neon); otherwise the file-backed store.
const auditLog = new InMemoryAuditLog();
const preferences = new InMemoryPreferenceStore();
const adapter = new MockCrmAdapter();
const configStore: ConfigStore = process.env.DATABASE_URL
  ? await createPostgresConfigStore(process.env.DATABASE_URL)
  : new FileConfigStore(defaultConfigPath());
console.log(`config store: ${process.env.DATABASE_URL ? "postgres" : "file"}`);

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.all("/mcp", async (req, res) => {
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
