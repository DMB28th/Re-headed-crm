import { demoRunningUser } from "@cardstack/auth";
/**
 * Golden Path 3 demo (M3 exit criteria): Studio publish → live layout change.
 * A layout edit is published through the shared config store and the very next
 * render uses it — NO code deploy, NO server restart, config read at render time.
 *
 *   pnpm demo:m3
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { FileConfigStore, DEMO_TENANT_ID } from "@cardstack/config-store";
import type { RecordCardPayload } from "@cardstack/core";
import { createCardstackServer } from "../src/server.js";
import { InMemoryAuditLog } from "../src/audit.js";
import { InMemoryPreferenceStore } from "../src/config/preferences.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  const configPath = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-gp3-")), "config.json");

  // The MCP server reads this store at render time…
  const server = await createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new FileConfigStore(configPath),
    auditLog: new InMemoryAuditLog(),
    preferences: new InMemoryPreferenceStore(),
    tenantId: DEMO_TENANT_ID,
    runningUser: demoRunningUser(),
  });
  // …and Studio writes to it from a DIFFERENT store instance (different process in real life).
  const studio = new FileConfigStore(configPath);

  const client = new Client({ name: "demo-host", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const renderCard = async (): Promise<RecordCardPayload> => {
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "deals", id: "d-001" },
    });
    return result.structuredContent as unknown as RecordCardPayload;
  };

  console.log(bold('\nUser (in Claude): "show me the Meridian deal"'));
  const before = await renderCard();
  const fieldsBefore = before.layout.recordCard.sections[0]!.fields.map((f) => f.api);
  console.log(
    dim(`widget renders "${before.provenance.layoutName}" v${before.provenance.layoutRevision}: ${fieldsBefore.join(", ")}\n`),
  );

  console.log(bold("Admin (in Studio): drags \"Next step\" off the card, adds \"Health score\", clicks Publish…"));
  const record = await studio.getLayoutRecord(DEMO_TENANT_ID, "deals");
  const published = record.published!;
  const draft = structuredClone(published);
  const section = draft.recordCard.sections[0]!;
  section.fields = [
    ...section.fields.filter((f) => f.api !== "next_step"),
    { api: "health_score", editable: false },
  ];
  await studio.saveDraft(draft);
  const v5 = await studio.publish(DEMO_TENANT_ID, "deals");
  console.log(dim(`published v${published.revision} → v${v5.revision}\n`));

  console.log(bold('User (same conversation, moments later): "show me the Meridian deal again"'));
  const after = await renderCard();
  const fieldsAfter = after.layout.recordCard.sections[0]!.fields.map((f) => f.api);
  console.log(
    dim(`widget renders "${after.provenance.layoutName}" v${after.provenance.layoutRevision}: ${fieldsAfter.join(", ")}\n`),
  );

  if (after.provenance.layoutRevision !== 5) throw new Error("GP3: revision did not advance");
  if (fieldsAfter.includes("next_step")) throw new Error("GP3: removed field still renders");
  if (!fieldsAfter.includes("health_score")) throw new Error("GP3: added field missing");
  if (after.record.fields.health_score === undefined) throw new Error("GP3: new field has no data");

  console.log(bold("✓ layout v5 live") + dim(" — Next step gone, Health score present. No deploy. No restart."));

  console.log(bold("\nAdmin: rolls back to v4…"));
  await studio.rollback(DEMO_TENANT_ID, "deals", 4);
  const rolled = await renderCard();
  if (rolled.layout.recordCard.sections[0]!.fields.some((f) => f.api === "health_score")) {
    throw new Error("GP3: rollback did not restore v4 layout");
  }
  console.log(
    dim(`widget renders v${rolled.provenance.layoutRevision} (v4 restored under a new revision) ✓`),
  );

  await client.close();
  await server.close();
  console.log(bold("\nGolden Path 3 complete.\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
