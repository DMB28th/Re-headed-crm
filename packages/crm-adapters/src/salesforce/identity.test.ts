import { describe, expect, it } from "vitest";
import {
  cardstackSalesforceLoginApp,
  hydrateSalesforceClientSecret,
  parseSalesforceIdentityUrl,
  stripCardstackClientSecret,
} from "./identity.js";

describe("Salesforce sign-in identity", () => {
  it("extracts validated org and user ids from the identity URL", () => {
    expect(
      parseSalesforceIdentityUrl(
        "https://login.salesforce.com/id/00D000000000001AAA/005000000000001AAA",
      ),
    ).toEqual({
      orgId: "00D000000000001AAA",
      userId: "005000000000001AAA",
    });
  });

  it("rejects malformed and non-Salesforce-org identity URLs", () => {
    expect(parseSalesforceIdentityUrl("not a url")).toBeUndefined();
    expect(
      parseSalesforceIdentityUrl(
        "https://login.salesforce.com/id/001000000000001AAA/005000000000001AAA",
      ),
    ).toBeUndefined();
  });

  it("requires both connected-app credentials", () => {
    expect(
      cardstackSalesforceLoginApp({
        CARDSTACK_SF_CLIENT_ID: "client",
        CARDSTACK_SF_CLIENT_SECRET: "secret",
      }),
    ).toEqual({ clientId: "client", clientSecret: "secret" });
    expect(cardstackSalesforceLoginApp({ CARDSTACK_SF_CLIENT_ID: "client" })).toBeUndefined();
  });
});

describe("hydrateSalesforceClientSecret", () => {
  const app = { clientId: "cardstack-app", clientSecret: "env-secret" };

  it("returns BYO credentials unchanged — a stored secret always wins", () => {
    const creds = { clientId: "byo", clientSecret: "stored" };
    expect(hydrateSalesforceClientSecret(creds, app)).toBe(creds);
  });

  it("merges the env secret into cardstack-app credentials", () => {
    const creds = { clientId: "cardstack-app", clientApp: "cardstack" };
    expect(hydrateSalesforceClientSecret(creds, app)).toEqual({
      ...creds,
      clientSecret: "env-secret",
    });
  });

  it("leaves secretless non-cardstack credentials alone", () => {
    const creds = { clientId: "legacy" };
    expect(hydrateSalesforceClientSecret(creds, app)).toBe(creds);
  });

  it("throws when the deployment has no app", () => {
    expect(() =>
      hydrateSalesforceClientSecret({ clientId: "cardstack-app", clientApp: "cardstack" }, undefined),
    ).toThrow(/reconnect/i);
  });

  it("throws when the deployment app id no longer matches", () => {
    expect(() =>
      hydrateSalesforceClientSecret({ clientId: "old-app", clientApp: "cardstack" }, app),
    ).toThrow(/reconnect/i);
  });
});

describe("stripCardstackClientSecret", () => {
  it("drops the secret from cardstack-app credentials, keeping everything else", () => {
    expect(
      stripCardstackClientSecret({
        clientApp: "cardstack",
        clientId: "cardstack-app",
        clientSecret: "env-secret",
        refreshToken: "r",
      }),
    ).toEqual({ clientApp: "cardstack", clientId: "cardstack-app", refreshToken: "r" });
  });

  it("returns BYO credentials unchanged", () => {
    const byo = { clientId: "byo", clientSecret: "stored" };
    expect(stripCardstackClientSecret(byo)).toBe(byo);
  });
});
