export * from "./adapter.js";
export { MockCrmAdapter } from "./mock/mock-adapter.js";
export * as mockFixtures from "./mock/fixtures.js";
export { HubSpotAdapter, type HubSpotCredentials } from "./hubspot/hubspot-adapter.js";
export { SalesforceAdapter, type SalesforceCredentials } from "./salesforce/salesforce-adapter.js";
export { createAdapterForConnection, type ConnectionSettings } from "./factory.js";
