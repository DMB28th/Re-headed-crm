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
  /**
   * Opaque cache-busting token, threaded from the stored connection's
   * `changedAt`. Because it's part of the cache key AND both services read it
   * from the shared store, bumping it (a "Refresh connection") builds a fresh
   * adapter — with fresh scope probes — in EVERY process at once, not just the
   * one that triggered it.
   */
  cacheNonce?: string;
}

let mockSingleton: MockCrmAdapter | undefined;
const liveCache = new Map<string, CrmAdapter>();

/** Stable part of the key: crm + credentials, regardless of nonce. */
const credKey = (settings: ConnectionSettings): string =>
  `${settings.crm}:${JSON.stringify(settings.credentials)}`;
const cacheKey = (settings: ConnectionSettings): string =>
  `${credKey(settings)}:${settings.cacheNonce ?? ""}`;

/**
 * Drop every cached adapter for a credential set (all nonces). Called on
 * connect / disconnect / refresh so stale negative caches (owners/pipelines/
 * lists fetched under an old scope set) never survive.
 */
export function invalidateAdapterCache(settings: ConnectionSettings): void {
  if (!settings.credentials || Object.keys(settings.credentials).length === 0) return;
  const prefix = `${credKey(settings)}:`;
  for (const key of liveCache.keys()) {
    if (key.startsWith(prefix)) liveCache.delete(key);
  }
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
