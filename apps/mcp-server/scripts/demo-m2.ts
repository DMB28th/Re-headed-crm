/**
 * Golden Path 2 demo (M2 exit criteria): inline edit → confirmed write →
 * receipt → audit log → model awareness via updateModelContext.
 *
 *   pnpm demo:m2
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import type {
  RecordCardPayload,
  UpdatePreviewPayload,
  WriteReceiptPayload,
} from "@cardstack/core";
import { createCardstackServer } from "../src/server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "../src/config/store.js";
import { InMemoryAuditLog } from "../src/audit.js";
import { InMemoryPreferenceStore } from "../src/config/preferences.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
/** Combining long stroke overlay — the diff's "before" reads as struck through. */
const strike = (s: string) => [...s].map((c) => `${c}̶`).join("");

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

  console.log(bold("\n(record card for Meridian Health is showing)"));
  const card = await client.callTool({
    name: "crm_get_record",
    arguments: { object: "deals", id: "d-001" },
  });
  const cardPayload = card.structuredContent as unknown as RecordCardPayload;
  console.log(
    dim(`editable fields per config ∩ CRM: ${cardPayload.capabilities.editableFields.join(", ")}\n`),
  );

  console.log(bold("User edits Stage → Negotiation, Amount → 135000, clicks [Review & save…]"));
  console.log(
    bold("widget calls crm_preview_update — the SERVER computes the diff and signs it\n"),
  );
  const preview = await client.callTool({
    name: "crm_preview_update",
    arguments: {
      object: "deals",
      id: "d-001",
      patch: { dealstage: "Negotiation", amount: 135000 },
    },
  });
  const previewPayload = preview.structuredContent as unknown as UpdatePreviewPayload;
  console.log(dim("widget shows the confirmation diff (server-computed, nothing written yet):"));
  console.log("    FIELD    BEFORE          AFTER");
  for (const c of previewPayload.changes) {
    console.log(
      `    ${c.label.padEnd(8)} ${red(strike(String(c.before)))}   ${green(String(c.after))}`,
    );
  }
  console.log(dim("    Written as Demo rep · logged in HubSpot history"));
  console.log(
    dim(
      `    confirm token ${previewPayload.confirmToken.slice(0, 12)}… bound to THIS diff, expires ${previewPayload.expiresAt}\n`,
    ),
  );

  console.log(
    bold("User clicks [✎ Confirm & write to HubSpot] → crm_update_record WITH the token\n"),
  );

  const write = await client.callTool({
    name: "crm_update_record",
    arguments: {
      object: "deals",
      id: "d-001",
      patch: { dealstage: "Negotiation", amount: 135000 },
      confirmToken: previewPayload.confirmToken,
    },
  });
  const receipt = write.structuredContent as unknown as WriteReceiptPayload;
  console.log(bold("widget collapses to a receipt (4c):"));
  console.log(`  ${green("✓")} ${receipt.savedCount} fields written to ${receipt.provenance.crmLabel}  ${dim(`${receipt.timestamp} · ${receipt.writtenAs}`)}`);
  for (const r of receipt.results) {
    console.log(`    ${r.label}: ${r.before} → ${r.after}`);
  }

  console.log(bold("\nwidget pushes updateModelContext (mirrors the receipt):"));
  console.log(dim(`  "${textOf(write)}"`));

  console.log(bold("\nUser: \"what did I just change?\" → model answers from pushed context, NO extra tool call"));

  const entries = await auditLog.list(DEMO_TENANT_ID);
  console.log(bold("\naudit log:"));
  for (const e of entries) {
    console.log(
      dim(
        `  [${e.id}] ${e.timestamp} ${e.user} ${e.object}/${e.recordId} ` +
          e.changes.map((c) => `${c.field}: ${c.before}→${c.after}`).join(", "),
      ),
    );
    console.log(
      `    ${green("✓")} confirmation: ${bold(e.confirmation?.via ?? "not recorded")} ${dim(
        e.confirmation?.via === "widget"
          ? `— server verified token ${e.confirmation.confirmationId?.slice(0, 8)}… against this exact diff`
          : "— no confirmation token presented",
      )}`,
    );
  }

  console.log(bold("\n--- what the token buys: a tampered write is refused ---"));
  console.log(
    dim("the rep confirmed 135000; a caller replays that token with a different amount\n"),
  );
  const tampered = await client.callTool({
    name: "crm_update_record",
    arguments: {
      object: "deals",
      id: "d-001",
      patch: { amount: 999999 },
      confirmToken: previewPayload.confirmToken,
    },
  });
  console.log(`  ${red("✕")} ${textOf(tampered)}`);
  console.log(
    dim(`  audit entries still: ${(await auditLog.list(DEMO_TENANT_ID)).length} (nothing logged)`),
  );

  console.log(bold("\n--- partial failure path (design 1e) ---"));
  console.log(bold("User tries Stage → Closed lost (no loss reason) + Amount → 130000\n"));
  const partial = await client.callTool({
    name: "crm_update_record",
    arguments: {
      object: "deals",
      id: "d-001",
      patch: { dealstage: "Closed lost", amount: 130000 },
    },
  });
  const partialReceipt = partial.structuredContent as unknown as WriteReceiptPayload;
  console.log(bold(`widget shows: Saved ${partialReceipt.savedCount} of ${partialReceipt.results.length} changes`));
  for (const r of partialReceipt.results) {
    if (r.ok) console.log(`    ${green("✓")} ${r.label}  ${r.before} → ${r.after}`);
    else console.log(`    ${red("✕")} ${r.label}  ${red(r.error ?? "")}  ${dim("[Edit & retry]")}`);
  }

  const verify = await client.callTool({
    name: "crm_get_record",
    arguments: { object: "deals", id: "d-001" },
  });
  const fresh = (verify.structuredContent as unknown as RecordCardPayload).record.fields;
  if (fresh.dealstage !== "Negotiation" || fresh.amount !== 130000) {
    throw new Error("demo: post-write record state is wrong");
  }
  console.log(
    `\n${bold("✓ CRM state verified")} ${dim(`— stage stayed "Negotiation" (rejected write untouched), amount saved as 130000`)}`,
  );

  await client.close();
  await server.close();
  console.log(bold("\nGolden Path 2 complete.\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
