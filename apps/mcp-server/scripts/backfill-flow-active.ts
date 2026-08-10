/**
 * One-shot deploy migration for the opt-in flows change (2026-08-10c).
 *
 *   pnpm migrate:flows-active            # report only
 *   pnpm migrate:flows-active -- --apply # write
 *
 * WHY THIS EXISTS
 * `FlowRenderModeConfig.active` now defaults to false and `crm_flow_start`
 * refuses an inactive flow. That default is right for a flow freshly synced
 * from the CRM — a candidate, not an offering. It is WRONG for flows reps are
 * already running: shipping without this would silently break them.
 *
 * WHAT COUNTS AS "ALREADY RUNNING"
 * Not "every synced flow". A flow is only startable from chat if a PUBLISHED
 * layout attaches it as a `screen_flow` card action — that is the exact set
 * that works today, so that is the exact set this activates.
 *
 * WHAT IT TOUCHES
 * Two cases activate:
 *   1. no stored policy at all — the flow ran on the implicit default;
 *   2. a PRE-UPGRADE policy, i.e. one whose `active` is absent because the
 *      field didn't exist when it was written. These are the flows admins
 *      configured most deliberately (they picked a render mode), so skipping
 *      them would darken exactly the wrong set.
 *
 * SAFE TO RE-RUN
 * A policy with an explicit `active: false` is an admin opt-out and is never
 * touched; `active: true` is already on. Since this run writes an explicit
 * boolean, a second pass activates nothing.
 *
 * The new policy is PUBLISHED, not staged: a staged one wouldn't be live and
 * the flow would stay dark, which is the thing we're preventing.
 */
import {
  createPostgresConfigStore,
  FileConfigStore,
  defaultConfigPath,
  type AdminConfigStore,
} from "@cardstack/config-store";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

export interface BackfillResult {
  activated: string[];
  skipped: { flow: string; because: string }[];
}

/** Flows attached as a screen_flow action on any PUBLISHED layout. */
export async function runnableFlows(
  store: AdminConfigStore,
  tenantId: string,
): Promise<Set<string>> {
  const flows = new Set<string>();
  for (const record of await store.listLayoutRecords(tenantId)) {
    // Published only — a draft action isn't reachable from chat either.
    for (const action of record.published?.recordCard.actions ?? []) {
      if (action.type === "screen_flow") flows.add(action.flowApiName);
    }
  }
  return flows;
}

/**
 * The whole decision, separated from I/O so it can be tested. Returns what it
 * did (or would do with `apply: false`).
 */
export async function backfillFlowActive(
  store: AdminConfigStore,
  tenantId: string,
  { apply }: { apply: boolean },
): Promise<BackfillResult> {
  const activated: string[] = [];
  const skipped: { flow: string; because: string }[] = [];

  for (const flowApiName of await runnableFlows(store, tenantId)) {
    const record = await store.getFlowRenderModeRecord(tenantId, flowApiName);
    const existing = record.published ?? record.draft;

    if (existing && existing.active !== undefined) {
      // An explicit boolean is a decision someone made. Never override it.
      skipped.push({
        flow: flowApiName,
        because: `explicitly set (active: ${existing.active}) — admin intent, left alone`,
      });
      continue;
    }

    if (apply) {
      await store.setFlowRenderMode({
        version: 1,
        // Keep whatever render mode was already configured — a pre-upgrade
        // policy exists precisely because someone chose one.
        ...(existing ?? {}),
        revision: existing?.revision ?? 1,
        tenantId,
        flowApiName,
        active: true,
        mode: existing?.mode ?? "auto",
        fallback: "open-in-salesforce",
        updatedAt: new Date().toISOString(),
      });
      await store.publishFlowRenderMode(tenantId, flowApiName);
    }
    activated.push(flowApiName);
  }
  return { activated, skipped };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantId = process.env.CARDSTACK_TENANT_ID ?? "t_demo";

  const store: AdminConfigStore = process.env.DATABASE_URL
    ? await createPostgresConfigStore(process.env.DATABASE_URL)
    : new FileConfigStore(defaultConfigPath());

  console.log(bold("\nBackfill: activate flows reps can already run\n"));
  console.log(dim(`store   : ${process.env.DATABASE_URL ? "postgres" : "file"}`));
  console.log(dim(`tenant  : ${tenantId}`));
  console.log(dim(`mode    : ${apply ? "APPLY" : "dry run (pass --apply to write)"}\n`));

  const { activated, skipped } = await backfillFlowActive(store, tenantId, { apply });
  if (activated.length === 0 && skipped.length === 0) {
    console.log("No published layout attaches a screen_flow action — nothing to activate.\n");
    return;
  }

  for (const flow of activated) {
    console.log(`  ${apply ? "✓ activated" : "would activate"}  ${flow}`);
  }
  for (const entry of skipped) {
    console.log(dim(`  · skipped     ${entry.flow} — ${entry.because}`));
  }

  console.log(
    bold(
      `\n${activated.length} flow(s) ${apply ? "activated" : "would be activated"}, ` +
        `${skipped.length} left alone.\n`,
    ),
  );
  if (!apply && activated.length > 0) {
    console.log(dim("Re-run with --apply to write.\n"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
