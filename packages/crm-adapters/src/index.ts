export * from "./adapter.js";
export { MockCrmAdapter } from "./mock/mock-adapter.js";
export * as mockFixtures from "./mock/fixtures.js";
export { HubSpotAdapter, type HubSpotCredentials } from "./hubspot/hubspot-adapter.js";
export {
  SalesforceAdapter,
  buildSalesforceAuthorizationUrl,
  exchangeSalesforceAuthorizationCode,
  normalizeSalesforceLoginUrl,
  salesforceUsesOAuth,
  type SalesforceCredentials,
} from "./salesforce/salesforce-adapter.js";
export {
  createDevSalesforceAdapter,
  devSalesforceOrg,
  DEV_SF_ORG_ENV,
} from "./salesforce/dev-adapter.js";
export { readSalesforceCliToken, type SalesforceCliToken } from "./salesforce/cli-token.js";
export {
  cardstackSalesforceLoginApp,
  fetchSalesforceSignerIdentity,
  parseSalesforceIdentityUrl,
  type SalesforceIdentityUrlParts,
  type SalesforceLoginApp,
  type SalesforceSignerIdentity,
} from "./salesforce/identity.js";
export {
  createAdapterForConnection,
  invalidateAdapterCache,
  type ConnectionSettings,
} from "./factory.js";
