/**
 * LOCAL DEV ONLY — a SalesforceAdapter backed by the `sf` CLI's own auth.
 *
 * Deliberately built OUTSIDE the tenant's stored connection: it never reads or
 * writes `data/cardstack-config.json`, so a local run cannot rotate (and
 * revoke) the refresh token the deployed environment is using. See
 * cli-token.ts for the full rationale.
 *
 * Enabled by CARDSTACK_DEV_SF_ORG=<sf CLI alias or username>. Unset in every
 * non-local environment — production resolves adapters from the stored
 * connection exactly as before.
 */
import type { CrmAdapter } from "../adapter.js";
import { readSalesforceCliToken } from "./cli-token.js";
import { SalesforceAdapter, type SalesforceCredentials } from "./salesforce-adapter.js";

/** The env var that turns local dev into "live against my dev org". */
export const DEV_SF_ORG_ENV = "CARDSTACK_DEV_SF_ORG";

export function devSalesforceOrg(): string | null {
  const value = process.env[DEV_SF_ORG_ENV]?.trim();
  return value ? value : null;
}

let cached: { org: string; adapter: CrmAdapter } | null = null;

/**
 * Cached per org alias so describe caches and the minted token survive across
 * requests (the MCP server is stateless per call, Studio re-resolves per route).
 */
export function createDevSalesforceAdapter(targetOrg: string): CrmAdapter {
  if (cached?.org === targetOrg) return cached.adapter;
  let announced = false;
  // Credentials are intentionally EMPTY of secrets: clientId/clientSecret are
  // unused because tokenProvider short-circuits every grant path.
  const credentials = { authType: "external", clientId: "", clientSecret: "" } as
    unknown as SalesforceCredentials;
  const adapter = new SalesforceAdapter(credentials, undefined, undefined, undefined, async () => {
    const token = await readSalesforceCliToken(targetOrg);
    if (!announced) {
      announced = true;
      console.log(
        `[cardstack] LOCAL DEV → live Salesforce: ${token.username} @ ${token.instanceUrl}` +
          ` (token from sf CLI, in memory only — not persisted)`,
      );
    }
    return { accessToken: token.accessToken, instanceUrl: token.instanceUrl };
  });
  cached = { org: targetOrg, adapter };
  return adapter;
}
