/**
 * Server-side singletons. Studio and the MCP server share the SAME file-backed
 * config store — a publish here changes the server's next render (GP3).
 */
import path from "node:path";
import { FileConfigStore, DEMO_TENANT_ID } from "@cardstack/config-store";
import { MockCrmAdapter } from "@cardstack/crm-adapters";

export const TENANT_ID = DEMO_TENANT_ID;

const configPath =
  process.env.CARDSTACK_CONFIG_PATH ??
  path.join(process.cwd(), "..", "..", "data", "cardstack-config.json");

let store: FileConfigStore | undefined;
export function getStore(): FileConfigStore {
  store ??= new FileConfigStore(configPath);
  return store;
}

let adapter: MockCrmAdapter | undefined;
export function getAdapter(): MockCrmAdapter {
  adapter ??= new MockCrmAdapter();
  return adapter;
}
