/**
 * One-time migration: attach a legacy workspace to a signed-up owner account,
 * and copy its org claim from the tenant's stored admin connection.
 *
 * Production has exactly one legacy workspace (`t_demo`) — it predates
 * accounts, so it has no `ownerAccountId` and never went through the
 * self-serve `claimOrg` path even though its admin connection may already be
 * authenticated against a real Salesforce org. The runbook: the operator
 * signs up in Studio by email FIRST (so `getAccountByEmail` below finds
 * them), then runs this script to stamp that account as owner and, if the
 * connection implies an org, claim it — so future Salesforce signers from
 * that org land in this workspace instead of forming a new one.
 *
 * Report-first: without `--apply` nothing is written. `--apply` performs the
 * writes and re-reads the final row. Idempotent — re-running with the same
 * args after a successful `--apply` is a no-op (`setWorkspaceOwner`
 * overwrites with the same value; `claimOrg` is a no-op for the current
 * holder).
 *
 *   pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account daniel@example.com
 *   pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account daniel@example.com --apply
 */
import { getStore } from "../lib/backend";
import { parseSalesforceIdentityUrl } from "@cardstack/crm-adapters";

const PREFIX = "[attach-workspace]";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  return process.argv[process.argv.indexOf(hit) + 1];
}

async function main(): Promise<void> {
  const workspaceId = arg("workspace");
  const email = arg("account");
  const apply = process.argv.includes("--apply");

  if (!workspaceId || !email) {
    console.error(`${PREFIX} usage: --workspace <id> --account <email> [--apply]`);
    process.exit(1);
  }

  const store = await getStore();

  const ws = await store.getWorkspace(workspaceId);
  if (!ws) {
    console.error(`${PREFIX} workspace not found: ${workspaceId}`);
    process.exit(1);
  }

  const account = await store.getAccountByEmail(email);
  if (!account) {
    console.error(
      `${PREFIX} account not found for ${email} — sign up in Studio first, then re-run`,
    );
    process.exit(1);
  }

  // `process.exit` returns `never`, so both are narrowed non-undefined here.
  const workspace = ws;
  const owner = account;

  const connection = await store.getConnection(workspaceId);
  const identity = parseSalesforceIdentityUrl(connection.credentials?.identityUrl);
  const impliedOrgId = identity?.orgId ?? "none";

  console.log(`${PREFIX} workspace ${workspace.id} (${workspace.name})`);
  console.log(`${PREFIX}   current owner:       ${workspace.ownerAccountId ?? "none"}`);
  console.log(`${PREFIX}   current org claim:   ${workspace.salesforceOrgId ?? "none"}`);
  console.log(`${PREFIX}   connection implies:  ${impliedOrgId}`);
  console.log(`${PREFIX}   target owner:        ${owner.id} <${owner.email ?? email}>`);

  if (!apply) {
    const orgId = workspace.salesforceOrgId ?? identity?.orgId;
    console.log(
      `${PREFIX} report only — would set owner to ${owner.id}` +
        (orgId ? ` and claim org ${orgId}` : " (no org to claim)"),
    );
    console.log(`${PREFIX} re-run with --apply to write.`);
    process.exit(0);
  }

  await store.setWorkspaceOwner(workspaceId, owner.id);
  console.log(`${PREFIX} owner set to ${owner.id}`);

  const orgId = workspace.salesforceOrgId ?? identity?.orgId;
  if (orgId) {
    const claim = await store.claimOrg(workspaceId, orgId);
    if (claim.ok) {
      console.log(`${PREFIX} org claim ok: ${orgId}`);
    } else {
      const holder = await store.getWorkspaceByOrgId(orgId);
      console.error(
        `${PREFIX} org claim conflict: ${orgId} is already claimed by workspace ` +
          `${holder?.id ?? "unknown"} (attaching ${workspaceId})`,
      );
      process.exit(1);
    }
  } else {
    console.log(`${PREFIX} no org to claim (no existing claim, no connection identity)`);
  }

  const final = await store.getWorkspace(workspaceId);
  console.log(`${PREFIX} final: ${JSON.stringify(final)}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`${PREFIX} unexpected error`, error);
  process.exit(1);
});
