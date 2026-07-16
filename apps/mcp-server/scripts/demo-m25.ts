import { demoRunningUser } from "@cardstack/auth";
/**
 * M2.5 demo: saved views — "show me my deals" resolves to the user's exposed
 * CRM views; ambiguous asks render a picker and the choice is remembered.
 *
 *   pnpm demo:m2.5
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import type { ResultsTablePayload, ViewPickerPayload } from "@cardstack/core";
import { createCardstackServer } from "../src/server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "../src/config/store.js";
import { InMemoryAuditLog } from "../src/audit.js";
import { InMemoryPreferenceStore } from "../src/config/preferences.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const textOf = (result: { content?: unknown }): string => {
  const content = result.content as { type: string; text?: string }[];
  return content.find((c) => c.type === "text")?.text ?? "";
};

async function main() {
  const server = await createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new InMemoryConfigStore(),
    auditLog: new InMemoryAuditLog(),
    preferences: new InMemoryPreferenceStore(),
    tenantId: DEMO_TENANT_ID,
    runningUser: demoRunningUser(),
  });
  const client = new Client({ name: "demo-host", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  const listViewTool = tools.find((t) => t.name === "crm_list_view")!;
  console.log(bold("\nmodel routing: crm_list_view's description carries the tenant's views + aliases:"));
  console.log(dim(`  …${listViewTool.description!.slice(listViewTool.description!.indexOf("Exposed views:"))}\n`));

  console.log(bold('User: "show me my deals"'));
  const direct = await client.callTool({
    name: "crm_list_view",
    arguments: { object: "deals", query: "my deals" },
  });
  const view = direct.structuredContent as unknown as ResultsTablePayload;
  console.log(`${bold("model sees:")} ${textOf(direct)}`);
  console.log(
    dim(
      `widget renders: "${view.savedViewName}" · Your saved HubSpot view · ` +
        `${view.page.rows.length} of ${view.page.total} rows · filters: ${view.savedViewFilterSummary}\n`,
    ),
  );

  console.log(bold('User: "open deals" — ambiguous on purpose'));
  const ambiguous = await client.callTool({
    name: "crm_list_view",
    arguments: { object: "deals", query: "deals" },
  });
  const picker = ambiguous.structuredContent as unknown as ViewPickerPayload;
  console.log(`${bold("model sees:")} ${textOf(ambiguous)}`);
  console.log(dim("widget renders the picker:"));
  for (const option of picker.options) {
    console.log(dim(`   ▸ ${option.name} — ${option.filterSummary}`));
  }

  console.log(bold('\nUser picks "Closing this quarter" → widget calls crm_list_view with the pick + original query'));
  const picked = await client.callTool({
    name: "crm_list_view",
    arguments: { object: "deals", view: "v-02", query: "deals" },
  });
  const pickedView = picked.structuredContent as unknown as ResultsTablePayload;
  console.log(dim(`widget replaces the picker with "${pickedView.savedViewName}" (${pickedView.page.total} rows)\n`));

  console.log(bold('Later, same phrasing: "deals" — no picker this time, the choice was remembered'));
  const remembered = await client.callTool({
    name: "crm_list_view",
    arguments: { object: "deals", query: "deals" },
  });
  const rememberedView = remembered.structuredContent as unknown as ResultsTablePayload;
  if (rememberedView.kind !== "results-table" || rememberedView.savedViewName !== "Closing this quarter") {
    throw new Error("demo: remembered choice did not resolve");
  }
  console.log(dim(`resolved straight to "${rememberedView.savedViewName}" ✓`));

  await client.close();
  await server.close();
  console.log(bold("\nM2.5 saved views complete.\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
