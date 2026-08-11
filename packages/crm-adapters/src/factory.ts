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
  /**
   * Persist rotated Salesforce OAuth credentials (new access + refresh token)
   * back to the store. Not part of the cache key — it's a side channel keyed to
   * the same credential set. Without it, a rotation-enabled org's connection
   * dies on the first token refresh. Awaited by the adapter before the grant
   * resolves (failures logged, never thrown).
   */
  onCredentialsRefreshed?: (credentials: Record<string, string>) => void | Promise<void>;
  /**
   * Re-read the LATEST persisted credentials for this connection. Side channel
   * like onCredentialsRefreshed (not part of the cache key). When a refresh is
   * rejected because another process already rotated the token, the adapter
   * retries once with what this returns instead of declaring the connection dead.
   */
  getFreshCredentials?: () => Promise<Record<string, string> | null>;
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
 *
 * KNOWN LIMITATION — one-click Salesforce: callers invalidate using the
 * connection's STORED credentials (secretless, `clientApp: "cardstack"`),
 * but createAdapterForConnection caches under the HYDRATED credentials (env
 * secret merged in — see hydrateSalesforceClientSecret in
 * salesforce/identity.ts). Those two credential shapes produce different
 * cacheKey()/credKey() strings, so this function's prefix match never hits
 * the adapter actually cached for a one-click connection: it's a silent
 * no-op for that case, and the doc comment above ("drop every cached
 * adapter") does not hold.
 *
 * This is safe rather than silently stale because `cacheNonce` (threaded
 * from the connection's `changedAt`) is part of the SAME cache key. Every
 * write that would want a targeted invalidation (connect/disconnect/refresh)
 * also bumps `changedAt`, so the entry this function failed to delete is
 * orphaned by the nonce change anyway and can never be served to a later
 * request — it just leaks in `liveCache` instead of being freed immediately.
 * Fixing this for real means invalidating by a normalized (stripped or
 * hydrated) key on both the write and read sides; do not attempt that as a
 * drive-by edit here — it touches every call site of this function and of
 * createAdapterForConnection.
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
      : new SalesforceAdapter(
          settings.credentials as unknown as SalesforceCredentials,
          undefined,
          settings.onCredentialsRefreshed
            ? (creds) => settings.onCredentialsRefreshed!(creds as unknown as Record<string, string>)
            : undefined,
          settings.getFreshCredentials
            ? async () =>
                (await settings.getFreshCredentials!()) as unknown as SalesforceCredentials | null
            : undefined,
        );
  liveCache.set(key, adapter);
  return adapter;
}
