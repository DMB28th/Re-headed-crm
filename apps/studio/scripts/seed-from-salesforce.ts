/**
 * Seed a LOCAL config store from a real Salesforce org, via the `sf` CLI.
 *
 * The stock seed (packages/config-store/src/seed.ts) is HubSpot-shaped —
 * `deals` with `dealname`/`dealstage` — which describes nothing in a Salesforce
 * org: every layout 404s and the home card has no lists. This reads the org's
 * ACTUAL objects, fields and list views and writes a store that matches it.
 *
 * Auth is the CLI's own (see crm-adapters/salesforce/cli-token.ts): no
 * connected-app refresh token is read, refreshed, or written, so a local run
 * cannot revoke the deployed connection. The connection this writes carries NO
 * credentials for the same reason — local dev reaches the org through
 * CARDSTACK_DEV_SF_ORG, never through stored secrets.
 *
 *   pnpm seed:salesforce -- --org screenflow-org
 *   pnpm dev:sf                       # Studio against what this wrote
 */
import path from "node:path";
import {
  FileConfigStore,
  DEMO_TENANT_ID,
  type AdminConfigStore,
} from "@cardstack/config-store";
import {
  createDevSalesforceAdapter,
  readSalesforceCliToken,
  type CrmAdapter,
} from "@cardstack/crm-adapters";
import { HomeCardConfig, ViewExposuresConfig, type ObjectDescribe } from "@cardstack/core";
import { generateStarterLayout } from "../lib/starter-layout";

/** Objects worth a card in a sales org, best first. Missing ones are skipped. */
const DEFAULT_OBJECTS = ["Account", "Contact", "Opportunity", "Lead", "Case", "Task"];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  return process.argv[process.argv.indexOf(hit) + 1];
}

async function main(): Promise<void> {
  const org = arg("org") ?? process.env.CARDSTACK_DEV_SF_ORG;
  const tenantId = process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID;
  const outPath = path.resolve(
    arg("out") ??
      process.env.CARDSTACK_CONFIG_PATH ??
      path.join(process.cwd(), "..", "..", "data", "cardstack-salesforce.json"),
  );
  const objects = (arg("objects") ?? DEFAULT_OBJECTS.join(",")).split(",").map((o) => o.trim());

  // Fail before touching the store if the CLI can't produce a token.
  const token = await readSalesforceCliToken(org);
  console.log(`Seeding from ${token.username} @ ${token.instanceUrl}`);
  console.log(`  tenant ${tenantId} → ${outPath}\n`);

  const adapter = createDevSalesforceAdapter(org ?? "");
  const store: AdminConfigStore = new FileConfigStore(outPath);

  // A fresh file store seeds the HubSpot demo config ("deals"/dealname), which
  // describes nothing in a Salesforce org — it would list a "Deals" object that
  // 404s. Same wipe the Connections page runs when the CRM changes.
  const existingCrm = await store.tenantConfigCrm(tenantId);
  if (existingCrm && existingCrm !== "salesforce") {
    await store.clearTenantConfig(tenantId);
    console.log(`  cleared stale ${existingCrm} config for this tenant\n`);
  }

  const seeded: string[] = [];
  for (const api of objects) {
    let describe: ObjectDescribe;
    try {
      describe = await adapter.describeObject(api);
    } catch (error) {
      console.log(`  ✕ ${api} — skipped (${describeError(error)})`);
      continue;
    }
    const layout = generateStarterLayout(tenantId, describe, "salesforce");
    await store.saveDraft(layout);
    const published = await store.publish(tenantId, api);
    const fieldCount = published.recordCard.sections.reduce((n, s) => n + s.fields.length, 0);
    console.log(
      `  ✓ ${api} — ${describe.fields.length} fields read, ${fieldCount} on the card ` +
        `(title: ${published.recordCard.header.title})`,
    );
    seeded.push(api);
    await seedViews(store, adapter, tenantId, api);
  }

  if (seeded.length === 0) {
    throw new Error(
      `Described none of: ${objects.join(", ")}. Check the org has these objects and the user can see them.`,
    );
  }

  // No credentials on purpose — see the header. Local dev reaches the org via
  // CARDSTACK_DEV_SF_ORG; anything else falls back to the mock portal.
  await store.setConnection({
    tenantId,
    status: "connected",
    crm: "salesforce",
    label: `${token.username} · sf CLI (local dev)`,
    changedAt: new Date().toISOString(),
  });

  await store.publishHomeCard(
    HomeCardConfig.parse({
      version: 1,
      tenantId,
      audience: "default",
      revision: 1,
      blocks: [
        { type: "lists", source: "all", maxTiles: 4, viewIds: [] },
        { type: "recent", limit: 3 },
        { type: "followups", limit: 5 },
      ],
    }),
  );

  console.log(`\nSeeded ${seeded.length} objects: ${seeded.join(", ")}`);
  console.log(`Run Studio against it:  CARDSTACK_DEV_SF_ORG=${org ?? "<alias>"} pnpm dev:sf`);
}

/** Expose the org's real list views so the home card has tiles to show. */
async function seedViews(
  store: AdminConfigStore,
  adapter: CrmAdapter,
  tenantId: string,
  object: string,
): Promise<void> {
  const views = await adapter.listSavedViews(object).catch(() => []);
  if (views.length === 0) return;
  // Expose a handful — every list view in a Salesforce org is far too many for
  // a launcher, and the admin curates from here in Studio's Lists page.
  const exposed = views.slice(0, 4);
  await store.setViewExposures(
    ViewExposuresConfig.parse({
      version: 1,
      tenantId,
      object,
      views: views.map((view, i) => ({
        viewId: view.id,
        exposed: i < exposed.length,
        aliases: i < exposed.length ? [view.name.toLowerCase()] : [],
        isDefault: i === 0,
      })),
    }),
  );
  console.log(`      ${exposed.length}/${views.length} list views exposed`);
}

function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
