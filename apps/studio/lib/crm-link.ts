/**
 * Sync HubSpot/Salesforce SSO account rows → user_crm_links for the active workspace.
 * Called after org activation and when minting MCP tokens.
 */
import { createUserCrmStore, type CrmKind, type UserCrmLink } from "@cardstack/auth";
import type { Pool } from "pg";

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (!pool) {
    const pg = await import("pg");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function syncCrmLinksForUser(
  userId: string,
  tenantId: string,
  email?: string | null,
): Promise<UserCrmLink[]> {
  const p = await getPool();
  const { rows } = await p.query(
    `SELECT "providerId", "accountId" FROM account
     WHERE "userId" = $1 AND "providerId" IN ('hubspot', 'salesforce')`,
    [userId],
  );
  if (rows.length === 0) return [];

  const store = await createUserCrmStore(process.env.DATABASE_URL!);
  const out: UserCrmLink[] = [];
  for (const row of rows) {
    const crm = String(row.providerId) as CrmKind;
    const crmUserId = String(row.accountId);
    if (!crmUserId) continue;
    out.push(
      await store.upsertLink({
        tenantId,
        userId,
        crm,
        crmUserId,
        crmEmail: email ?? null,
        source: "sso",
      }),
    );
  }
  return out;
}

export async function getCrmLinkForTenant(
  userId: string,
  tenantId: string,
  crm?: CrmKind,
): Promise<UserCrmLink | null> {
  if (!process.env.DATABASE_URL) return null;
  // Refresh from SSO accounts first so a fresh HubSpot/SF login is picked up.
  await syncCrmLinksForUser(userId, tenantId).catch(() => []);
  const store = await createUserCrmStore(process.env.DATABASE_URL);
  if (crm) {
    const exact = await store.getLink(tenantId, userId, crm);
    if (exact) return exact;
  }
  return store.getLink(tenantId, userId);
}

/** Persist HubSpot owner id once resolved from the owners API. */
export async function setCrmOwnerId(
  tenantId: string,
  userId: string,
  crm: CrmKind,
  crmOwnerId: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const store = await createUserCrmStore(process.env.DATABASE_URL);
  const link = await store.getLink(tenantId, userId, crm);
  if (!link) return;
  await store.upsertLink({
    tenantId,
    userId,
    crm,
    crmUserId: link.crmUserId,
    crmOwnerId,
    crmEmail: link.crmEmail,
    source: link.source,
  });
}
