/**
 * Report — and optionally repair — workspaces with no admin.
 *
 * This is the pre-deploy gate for the Studio authorization choke point. Once
 * `resolveStudioSession` refuses a non-admin session, a workspace whose
 * membership rows say nobody is an admin cannot be reached by anyone, ever:
 * Studio is the only place admin can be granted, and Studio needs an admin to
 * let you in. Run this BEFORE deploying that change.
 *
 * A workspace can be in that state today because `ensureMembership` only grants
 * admin when the membership list is empty, so any path that created a
 * membership before the first admin existed leaves the workspace headless.
 *
 *   pnpm --filter @cardstack/studio exec tsx scripts/backfill-workspace-admins.ts
 *   pnpm --filter @cardstack/studio exec tsx scripts/backfill-workspace-admins.ts --apply
 *
 * Report-only by default. `--apply` promotes the EARLIEST membership in each
 * headless workspace, which is the closest thing to "whoever set this up".
 */
import { getStore } from "../lib/backend";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const store = await getStore();
  const workspaces = await store.listWorkspaces();

  let headless = 0;
  for (const workspace of workspaces) {
    const memberships = await store.listMembershipsForWorkspace(workspace.id);
    if (memberships.some((m) => m.role === "admin")) continue;

    headless += 1;
    const earliest = [...memberships].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!earliest) {
      // No members at all. Nothing to promote, and nothing is locked out —
      // the first person from that org to sign in becomes its admin normally.
      console.log(`  ${workspace.id} (${workspace.name}): no members yet — nothing to do`);
      continue;
    }
    const account = await store.getAccount(earliest.accountId);
    const who = account ? `${account.name} <${account.email ?? account.id}>` : earliest.accountId;
    if (!apply) {
      console.log(`  ${workspace.id} (${workspace.name}): would promote ${who}`);
      continue;
    }
    await store.setMembership({ ...earliest, role: "admin" });
    console.log(`  ${workspace.id} (${workspace.name}): promoted ${who}`);
  }

  console.log(
    headless === 0
      ? `\n${workspaces.length} workspace(s) checked; every one has an admin. Safe to deploy.`
      : `\n${headless} of ${workspaces.length} workspace(s) have no admin.` +
          (apply ? " Repaired." : " Re-run with --apply to promote the earliest member of each."),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
