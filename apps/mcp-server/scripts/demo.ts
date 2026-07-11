/**
 * Golden Path 1 demo (M1 exit criteria): search → results table → record card,
 * end-to-end through a real MCP client over an in-memory transport.
 *
 *   pnpm demo:m1
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import type { RecordCardPayload, ResultsTablePayload } from "@cardstack/core";
import { createCardstackServer } from "../src/server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "../src/config/store.js";
import { InMemoryAuditLog } from "../src/audit.js";
import { InMemoryPreferenceStore } from "../src/config/preferences.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  const server = await createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new InMemoryConfigStore(),
    auditLog: new InMemoryAuditLog(),
    preferences: new InMemoryPreferenceStore(),
    tenantId: DEMO_TENANT_ID,
  });
  const client = new Client({ name: "demo-host", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  console.log(bold('\nUser: "pull up our open deals over $50k"\n'));

  const search = await client.callTool({
    name: "crm_search",
    arguments: { object: "deals", openOnly: true, minAmount: 50000 },
  });
  const searchText = (search.content as { type: string; text?: string }[]).find(
    (c) => c.type === "text",
  )?.text;
  console.log(`${bold("model sees:")} ${searchText}\n`);

  const table = search.structuredContent as unknown as ResultsTablePayload;
  console.log(bold(`widget renders: ${table.title}`), dim(`(layout v${table.provenance.layoutRevision})`));
  for (const row of table.page.rows) {
    const f = row.fields;
    console.log(
      `  ${String(f.dealname).padEnd(44)} ${String(f.dealstage).padEnd(14)} $${Number(f.amount).toLocaleString()}  ${f.closedate}`,
    );
  }
  console.log(dim(`  Showing ${table.page.rows.length} of ${table.page.total} · click a row to open its card\n`));

  const first = table.page.rows[0];
  if (!first) throw new Error("demo: no rows returned");
  console.log(bold(`User clicks the "${first.fields.dealname}" row → widget sends a followup → model calls crm_get_record\n`));

  const record = await client.callTool({
    name: "crm_get_record",
    arguments: { object: "deals", id: first.id },
  });
  const recordText = (record.content as { type: string; text?: string }[]).find(
    (c) => c.type === "text",
  )?.text;
  console.log(`${bold("model sees:")} ${recordText}\n`);

  const card = record.structuredContent as unknown as RecordCardPayload;
  console.log(bold(`widget renders record card:`), dim(`("${card.provenance.layoutName}" v${card.provenance.layoutRevision})`));
  const header = card.layout.recordCard.header;
  console.log(`  ${card.record.fields[header.title]}  [${card.record.fields[header.badge ?? ""]}]`);
  console.log(dim(`  ${card.record.fields[header.subtitle ?? ""]}`));
  for (const section of card.layout.recordCard.sections) {
    console.log(`  — ${section.label} —`);
    for (const field of section.fields) {
      const meta = card.meta[field.api];
      const value = card.record.fields[field.api];
      console.log(`    ${(meta?.label ?? field.api).padEnd(16)} ${value ?? "—"}${meta?.description ? dim("  ⓘ") : ""}`);
    }
  }
  const contacts = card.related.deal_contacts;
  if (contacts) {
    console.log(`  — Contacts —`);
    for (const c of contacts.rows) {
      console.log(`    ${String(c.fields.name).padEnd(20)} ${[c.fields.role, c.fields.jobtitle].filter(Boolean).join(" · ")}`);
    }
    if (contacts.hasMore) console.log(dim(`    Show ${(contacts.total ?? 0) - contacts.rows.length} more…`));
  }
  console.log(`  — Activity —`);
  for (const a of card.activity) console.log(`    ${a.summary} ${dim(a.timestamp)}`);

  // Security check: the denylisted field must never appear anywhere in a payload.
  const everything = JSON.stringify([table, card]);
  if (everything.includes("commission")) {
    throw new Error("SECURITY: denylisted field leaked into a widget payload!");
  }
  console.log(`\n${bold("✓ denylist holds")} ${dim("— \"commission\" appears nowhere in either widget payload")}`);

  await client.close();
  await server.close();
  console.log(bold("\nGolden Path 1 complete.\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
