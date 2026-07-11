/**
 * Server-side singletons. Studio and the MCP server share the SAME config
 * store — a publish here changes the server's next render (GP3). With
 * DATABASE_URL set both talk to Postgres (Railway/Neon); otherwise they share
 * the file-backed store (single box / local dev).
 */
import path from "node:path";
import {
  createPostgresConfigStore,
  FileConfigStore,
  DEMO_TENANT_ID,
  type AdminConfigStore,
} from "@cardstack/config-store";
import { MockCrmAdapter } from "@cardstack/crm-adapters";

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

let adapter: MockCrmAdapter | undefined;
export function getAdapter(): MockCrmAdapter {
  adapter ??= new MockCrmAdapter();
  return adapter;
}
