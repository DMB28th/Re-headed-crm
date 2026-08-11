import { describe, expect, it } from "vitest";
import { buildCardstackConnectStart } from "./salesforce-connect";

const args = {
  app: { clientId: "cardstack-app", clientSecret: "env-secret" },
  redirectUri: "https://studio.example/api/connections/salesforce/oauth/callback",
  state: "state-1",
  codeVerifier: "verifier-1",
  codeChallenge: "challenge-1",
} as const;

describe("buildCardstackConnectStart", () => {
  it("stages pendingAuth with the cardstack marker and NO client secret", () => {
    const { pendingAuth } = buildCardstackConnectStart({ ...args, host: "production" });
    expect(pendingAuth).toMatchObject({
      authType: "oauth_pending",
      clientId: "cardstack-app",
      clientApp: "cardstack",
      loginUrl: "https://login.salesforce.com",
      state: "state-1",
      codeVerifier: "verifier-1",
    });
    expect("clientSecret" in pendingAuth).toBe(false);
  });

  it("maps the sandbox host", () => {
    const { pendingAuth, authorizationUrl } = buildCardstackConnectStart({
      ...args,
      host: "sandbox",
    });
    expect(pendingAuth.loginUrl).toBe("https://test.salesforce.com");
    expect(authorizationUrl).toContain("https://test.salesforce.com");
    expect(authorizationUrl).toContain("client_id=cardstack-app");
  });

  it("refuses when the deployment has no Cardstack app — without printing env names", () => {
    expect(() => buildCardstackConnectStart({ ...args, app: undefined, host: "production" })).toThrow(
      /use your own connected app/i,
    );
    try {
      buildCardstackConnectStart({ ...args, app: undefined, host: "production" });
    } catch (err) {
      expect(String(err)).not.toMatch(/CARDSTACK_SF/);
    }
  });
});
