/**
 * HTTP entry: streamable HTTP, stateless JSON — a fresh McpServer + transport
 * per request, nothing held in memory between calls (PLAN.md multi-tenancy rule).
 */
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { createCardstackServer } from "./server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "./config/store.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.all("/mcp", async (req, res) => {
  const server = createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new InMemoryConfigStore(),
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
