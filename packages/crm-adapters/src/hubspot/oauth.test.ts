import { describe, expect, it } from "vitest";
import { hubspotAuthorizeUrl, HUBSPOT_OAUTH_SCOPES } from "./oauth.js";

describe("hubspotAuthorizeUrl", () => {
  it("includes client, redirect, state, and CRM scopes", () => {
    const url = hubspotAuthorizeUrl({
      clientId: "abc",
      redirectUri: "https://studio.example/api/team/crm-oauth/hubspot/callback",
      state: "xyz",
    });
    expect(url.startsWith("https://app.hubspot.com/oauth/authorize?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe("abc");
    expect(q.get("redirect_uri")).toContain("crm-oauth/hubspot/callback");
    expect(q.get("state")).toBe("xyz");
    expect(q.get("scope")).toContain("oauth");
    expect(q.get("scope")).toContain("crm.objects.deals.read");
    expect(HUBSPOT_OAUTH_SCOPES.length).toBeGreaterThan(5);
  });
});
