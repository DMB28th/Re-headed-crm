/**
 * One-click (Cardstack-app) admin OAuth start — the pure half of
 * /api/connections/salesforce/oauth/start's cardstack mode. The staged
 * pendingAuth carries `clientApp: "cardstack"` and NO client secret: the
 * callback and every later refresh source the secret from the env-configured
 * app via hydrateSalesforceClientSecret, so it is never persisted per-tenant
 * (spec 2026-08-11 §1).
 */
import {
  buildSalesforceAuthorizationUrl,
  type SalesforceLoginApp,
} from "@cardstack/crm-adapters";

export const SALESFORCE_HOSTS = {
  production: "https://login.salesforce.com",
  sandbox: "https://test.salesforce.com",
} as const;
export type SalesforceHost = keyof typeof SALESFORCE_HOSTS;

export function buildCardstackConnectStart(args: {
  app: SalesforceLoginApp | undefined;
  host: SalesforceHost;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}): { pendingAuth: Record<string, string>; authorizationUrl: string } {
  if (!args.app) {
    throw new Error(
      "This deployment has no Cardstack Salesforce app configured — use your own connected app instead.",
    );
  }
  const loginUrl = SALESFORCE_HOSTS[args.host];
  return {
    pendingAuth: {
      authType: "oauth_pending",
      loginUrl,
      clientId: args.app.clientId,
      clientApp: "cardstack",
      redirectUri: args.redirectUri,
      state: args.state,
      codeVerifier: args.codeVerifier,
    },
    authorizationUrl: buildSalesforceAuthorizationUrl({
      loginUrl,
      clientId: args.app.clientId,
      redirectUri: args.redirectUri,
      state: args.state,
      codeChallenge: args.codeChallenge,
    }),
  };
}
