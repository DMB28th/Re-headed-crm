import { describe, expect, it } from "vitest";
import {
  cardstackSalesforceLoginApp,
  parseSalesforceIdentityUrl,
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
