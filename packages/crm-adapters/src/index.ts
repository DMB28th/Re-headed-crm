export * from "./adapter.js";
export { MockCrmAdapter } from "./mock/mock-adapter.js";
export * as mockFixtures from "./mock/fixtures.js";
export { HubSpotAdapter, type HubSpotCredentials } from "./hubspot/hubspot-adapter.js";
export {
  HUBSPOT_OAUTH_SCOPES,
  hubspotAuthorizeUrl,
  exchangeHubSpotCode,
  refreshHubSpotAccessToken,
  fetchHubSpotAccessTokenInfo,
  type HubSpotOAuthApp,
  type HubSpotTokenSet,
} from "./hubspot/oauth.js";
export { SalesforceAdapter, type SalesforceCredentials } from "./salesforce/salesforce-adapter.js";
export {
  createAdapterForConnection,
  invalidateAdapterCache,
  type ConnectionSettings,
} from "./factory.js";
