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

const cacheKey = (settings: ConnectionSettings): string =>
  `${settings.crm}:${JSON.stringify(settings.credentials)}`;

/**
 * Drop the cached live adapter for a credential set. Called on connect AND
 * disconnect so stale negative caches (owners/pipelines fetched under an old
 * scope set) never survive a reconnect.
 */
export function invalidateAdapterCache(settings: ConnectionSettings): void {
  if (!settings.credentials || Object.keys(settings.credentials).length === 0) return;
  liveCache.delete(cacheKey(settings));
}

export function createAdapterForConnection(settings: ConnectionSettings): CrmAdapter {
  if (!settings.credentials || Object.keys(settings.credentials).length === 0) {
    mockSingleton ??= new MockCrmAdapter();
    return mockSingleton;
  }
  const key = cacheKey(settings);
  const cached = liveCache.get(key);
  if (cached) return cached;
  const adapter =
    settings.crm === "hubspot"
      ? new HubSpotAdapter(settings.credentials as unknown as HubSpotCredentials)
      : new SalesforceAdapter(settings.credentials as unknown as SalesforceCredentials);
  liveCache.set(key, adapter);
  return adapter;
}
