/**
 * Server-side singletons. Studio and the MCP server share the SAME config
 * store — a publish here changes the server's next render (GP3). With
 * DATABASE_URL set both talk to Postgres (Railway/Neon); otherwise they share
 * the file-backed store (single box / local dev).
 *
 * The adapter is resolved from the tenant's CONNECTION: no credentials =
 * mock portal; live HubSpot/Salesforce credentials build the real adapter
 * (cached per credential set by the factory).
 *
 * NOTE: adapter/token/metadata behavior also depends on @cardstack/crm-adapters
 * (objects, describe, relationships are all read from the CRM there). Railway's
 * deploy watch pattern only covers /apps/**, so a packages-only change is SKIPPED
 * — touch this file to force a rebuild that picks up the bundled package change.
 */
import path from "node:path";
import {
  createPostgresConfigStore,
  FileConfigStore,
  DEMO_TENANT_ID,
  FileAuditLog,
  createPostgresAuditLog,
  defaultAuditPath,
  type AdminConfigStore,
  type AuditLog,
} from "@cardstack/config-store";
import { createAdapterForConnection, type CrmAdapter } from "@cardstack/crm-adapters";

export const TENANT_ID = process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID;

const configPath =
  process.env.CARDSTACK_CONFIG_PATH ??
  path.join(process.cwd(), "..", "..", "data", "cardstack-config.json");

let storePromise: Promise<AdminConfigStore> | undefined;
export function getStore(): Promise<AdminConfigStore> {
  storePromise ??= process.env.DATABASE_URL
    ? createPostgresConfigStore(process.env.DATABASE_URL)
    : Promise.resolve(new FileConfigStore(configPath));
  return storePromise;
}

let auditPromise: Promise<AuditLog> | undefined;
/** Same durable audit log the MCP server writes — Studio reads it here. */
export function getAuditLog(): Promise<AuditLog> {
  auditPromise ??= process.env.DATABASE_URL
    ? createPostgresAuditLog(process.env.DATABASE_URL)
    : Promise.resolve(new FileAuditLog(defaultAuditPath()));
  return auditPromise;
}

/** The tenant's adapter per its CURRENT connection (read fresh each call). */
export async function getAdapter(tenantId = TENANT_ID): Promise<CrmAdapter> {
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  return createAdapterForConnection({
    crm: connection.crm,
    ...(connection.credentials ? { credentials: connection.credentials } : {}),
    // Busts the cache (in every process) whenever the connection is written —
    // connect, disconnect, or an explicit refresh.
    cacheNonce: connection.changedAt,
    // Persist rotated Salesforce OAuth tokens back to the admin connection so a
    // rotation-enabled org survives past the first token refresh.
    onCredentialsRefreshed: async (credentials) => {
      await store.setConnection({
        ...connection,
        credentials,
        changedAt: new Date().toISOString(),
      });
    },
    // If the MCP server (separate process, same store) rotated the token first,
    // pick up its persisted copy instead of dying on our stale one.
    getFreshCredentials: async () => (await store.getConnection(tenantId)).credentials ?? null,
  });
}
