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
 * M7: tenantId comes from the signed-in user's active organization when auth
 * is enabled; otherwise DEMO_TENANT_ID (open demo mode).
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
import { createMcpTokenStore, type McpTokenStore } from "@cardstack/auth";
import { createAdapterForConnection, type CrmAdapter } from "@cardstack/crm-adapters";
import { requireTenantId } from "./session";

/** @deprecated Prefer requireTenantId() — kept for transitional imports. */
export const TENANT_ID = DEMO_TENANT_ID;

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

let mcpTokensPromise: Promise<McpTokenStore> | undefined;
/** MCP API tokens for chat hosts — requires DATABASE_URL. */
export function getMcpTokenStore(): Promise<McpTokenStore> {
  if (!process.env.DATABASE_URL) {
    return Promise.reject(new Error("MCP tokens require DATABASE_URL (Postgres)."));
  }
  mcpTokensPromise ??= createMcpTokenStore(process.env.DATABASE_URL);
  return mcpTokensPromise;
}

/** The tenant's adapter per its CURRENT connection (read fresh each call). */
export async function getAdapter(tenantId?: string): Promise<CrmAdapter> {
  const tid = tenantId ?? (await requireTenantId());
  const connection = await (await getStore()).getConnection(tid);
  return createAdapterForConnection({
    crm: connection.crm,
    ...(connection.credentials ? { credentials: connection.credentials } : {}),
    // Busts the cache (in every process) whenever the connection is written —
    // connect, disconnect, or an explicit refresh.
    cacheNonce: connection.changedAt,
  });
}

export { requireTenantId };
