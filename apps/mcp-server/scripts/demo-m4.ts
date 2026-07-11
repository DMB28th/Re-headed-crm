/**
 * M4 core demo: "open my CRM" → home card (lists, recents, follow-ups) →
 * confirmed task check-off → audit log → model awareness.
 *
 *   pnpm demo:m4
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import type { HomeCardPayload } from "@cardstack/core";
import { createCardstackServer } from "../src/server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "../src/config/store.js";
import { InMemoryAuditLog } from "../src/audit.js";
import { InMemoryPreferenceStore } from "../src/config/preferences.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

const textOf = (result: { content?: unknown }): string => {
  const content = result.content as { type: string; text?: string }[];
  return content.find((c) => c.type === "text")?.text ?? "";
};

async function main() {
  const auditLog = new InMemoryAuditLog();
  const server = await createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new InMemoryConfigStore(),
    auditLog,
    preferences: new InMemoryPreferenceStore(),
    tenantId: DEMO_TENANT_ID,
  });
  const client = new Client({ name: "demo-host", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  console.log(bold('\nUser: "open my CRM"\n'));
  const home = await client.callTool({ name: "crm_home", arguments: {} });
  console.log(`${bold("model sees:")} ${textOf(home)}\n`);

  const payload = home.structuredContent as unknown as HomeCardPayload;
  console.log(bold("widget renders the home card:"));
  console.log("  — Your lists —");
  for (const tile of payload.lists) {
    console.log(`    [${String(tile.count).padStart(2)}] ${tile.name}  ${dim(tile.filterSummary)}`);
  }
  console.log("  — Picked up recently —");
  for (const recent of payload.recent) {
    console.log(`    (${recent.object}) ${recent.name}  ${dim(recent.note)}`);
  }
  console.log("  — Follow-ups —");
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const task of payload.tasks) {
    const overdue = task.dueDate !== null && task.dueDate < todayStr;
    console.log(
      `    [ ] ${task.subject}  ${dim(task.relatedRecordName ?? "")} ${overdue ? red("overdue") : dim(task.dueDate ?? "")}`,
    );
  }

  const target = payload.tasks[0]!;
  console.log(bold(`\nUser checks off "${target.subject}" → inline confirm → widget calls crm_complete_task\n`));
  const done = await client.callTool({ name: "crm_complete_task", arguments: { id: target.id } });
  console.log(`${green("✓")} ${textOf(done)}`);
  console.log(dim(`widget pushes updateModelContext with the same line`));

  const entries = await auditLog.list(DEMO_TENANT_ID);
  console.log(bold("\naudit log:"));
  console.log(dim(`  [${entries[0]!.id}] ${entries[0]!.user} tasks/${entries[0]!.recordId} status: open→completed`));

  const homeAfter = await client.callTool({ name: "crm_home", arguments: {} });
  const after = homeAfter.structuredContent as unknown as HomeCardPayload;
  if (after.tasks.some((t) => t.id === target.id)) throw new Error("M4: completed task still open");
  console.log(`\n${bold("✓ re-render verified")} ${dim(`— "${target.subject}" is off the open list (${after.tasks.length} remaining)`)}`);

  await client.close();
  await server.close();
  console.log(bold("\nM4 home card core complete.\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
