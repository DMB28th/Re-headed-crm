/**
 * Dump real widget payloads (mock adapter + demo config) as JSON — handy for
 * widget development and host-free browser checks:
 *
 *   pnpm --filter @cardstack/mcp-server exec tsx scripts/dump-payloads.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "../src/config/store.js";
import { buildRecordCardPayload, buildResultsTablePayload } from "../src/payloads.js";

const outDir = process.argv[2] ?? "payload-fixtures";
mkdirSync(outDir, { recursive: true });

const adapter = new MockCrmAdapter();
const store = new InMemoryConfigStore();
const config = (await store.getLayout(DEMO_TENANT_ID, "deals"))!;

const record = await adapter.getRecord("deals", "d-001", []);
const card = await buildRecordCardPayload({ source: adapter, config, record });

const page = await adapter.search("deals", {
  filters: [
    { field: "amount", op: "gt", value: 50000 },
    { field: "dealstage", op: "neq", value: "Closed won" },
    { field: "dealstage", op: "neq", value: "Closed lost" },
  ],
  sort: { field: "closedate", dir: "asc" },
  limit: 10,
});
const table = await buildResultsTablePayload({
  source: adapter,
  config,
  page,
  title: "7 open deals over $50,000",
});

writeFileSync(`${outDir}/record-card.json`, JSON.stringify(card, null, 2));
writeFileSync(`${outDir}/results-table.json`, JSON.stringify(table, null, 2));
console.log(`payloads written to ${outDir}/`);
