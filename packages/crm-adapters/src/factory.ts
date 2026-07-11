/**
 * Adapter resolution: one place that turns a tenant's connection settings
 * into a CrmAdapter. No credentials → the mock portal (a shared singleton so
 * demo writes persist across stateless MCP requests, matching pre-connection
 * behavior). Live adapters are cached per credential set so describe caches
 * and Salesforce tokens survive between calls.
 */
import type { CrmAdapter } from "./adapter.js";
import { MockCrmAdapter } from "./mock/mock-adapter.js";
import { HubSpotAdapter, type HubSpotCredentials } from "./hubspot/hubspot-adapter.js";
import { SalesforceAdapter, type SalesforceCredentials } from "./salesforce/salesforce-adapter.js";

export interface ConnectionSettings {
  crm: "hubspot" | "salesforce";
  /** Absent = the mock portal. Shapes per CRM: see HubSpotCredentials / SalesforceCredentials. */
  credentials?: Record<string, string>;
}

let mockSingleton: MockCrmAdapter | undefined;
const liveCache = new Map<string, CrmAdapter>();

export function createAdapterForConnection(settings: ConnectionSettings): CrmAdapter {
  if (!settings.credentials || Object.keys(settings.credentials).length === 0) {
    mockSingleton ??= new MockCrmAdapter();
    return mockSingleton;
  }
  const key = `${settings.crm}:${JSON.stringify(settings.credentials)}`;
  const cached = liveCache.get(key);
  if (cached) return cached;
  const adapter =
    settings.crm === "hubspot"
      ? new HubSpotAdapter(settings.credentials as unknown as HubSpotCredentials)
      : new SalesforceAdapter(settings.credentials as unknown as SalesforceCredentials);
  liveCache.set(key, adapter);
  return adapter;
}
