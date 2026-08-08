/**
 * CardstackOAuthProvider — the full per-user flow against the in-memory store
 * with a stubbed Salesforce: register → authorize (SF redirect) → SF callback
 * (identity + per-user connection + our code) → token exchange → verify.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { InMemoryConfigStore, workspaceIdForOrg } from "@cardstack/config-store";
import { normalizeUserId } from "@cardstack/core";
import { CardstackOAuthProvider, userContextFromStoredUser } from "./oauth-provider.js";

const TENANT = "t_demo";
const WORKSPACE = "sf_00d000000000001";
const MCP_ORIGIN = "https://mcp.example.com";
/** The Cardstack-owned connected app the login lane always uses. */
const LOGIN_APP = { clientId: "cardstack-app", clientSecret: "cardstack-secret" };

const sfFetchStub: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("/services/oauth2/token")) {
    return new global.Response(
      JSON.stringify({
        access_token: "sf-access",
        refresh_token: "sf-refresh",
        instance_url: "https://org.my.salesforce.com",
        id: "https://login.salesforce.com/id/00D000000000001AAA/005000000000001AAA",
        token_type: "Bearer",
      }),
      { status: 200 },
    );
  }
  if (url.includes("/services/data/v61.0/query")) {
    const soql = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
    const records = soql.includes("FROM Organization")
      ? [{ Name: "Acme Corp" }]
      : [{ Name: "Dana K.", Email: "Dana@Example.com", Username: "dana@example.com" }];
    return new global.Response(JSON.stringify({ records, totalSize: 1, done: true }), {
      status: 200,
    });
  }
  return new global.Response("{}", { status: 404 });
};

/**
 * Deliberately NO admin connection and no configured tenant: signing in has to
 * work against a brand-new org, because signing in is what creates the
 * workspace. This is the case the old single-tenant provider could not serve.
 */
function newProvider(trustedClientOrigins: string[] = ["https://claude.ai"]) {
  const store = new InMemoryConfigStore();
  const provider = new CardstackOAuthProvider({
    store,
    mcpOrigin: MCP_ORIGIN,
    fetchImpl: sfFetchStub,
    loginApp: LOGIN_APP,
    trustedClientOrigins,
  });
  return { store, provider };
}

/** Drive /authorize far enough to hold the Salesforce `state` it minted. */
async function authorizeTo(
  provider: CardstackOAuthProvider,
  client: { client_id: string },
  redirectUri: string,
): Promise<string> {
  const { res, captured } = fakeRes();
  await provider.authorize(
    client as never,
    { redirectUri, codeChallenge: "client-challenge", state: "claude-state" },
    res,
  );
  return new URL(captured.url!).searchParams.get("state")!;
}

const fakeRes = () => {
  const captured: { url?: string; html?: string } = {};
  return {
    res: {
      redirect: (url: string) => void (captured.url = url),
      send: (html: string) => void (captured.html = html),
    } as unknown as Response,
    captured,
  };
};

describe("CardstackOAuthProvider", () => {
  // Most tests exercise a deployment that has pinned its Salesforce login host,
  // which is the zero-friction posture. The picker gets its own block below.
  beforeEach(() => vi.stubEnv("CARDSTACK_SF_LOGIN_URL", "https://login.salesforce.com"));
  afterEach(() => vi.unstubAllEnvs());

  it("runs the full flow: register → authorize → SF callback → token → verify", async () => {
    const { store, provider } = newProvider();

    // Dynamic client registration (what claude.ai does on connect).
    const client = await provider.clientsStore.registerClient!({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      client_name: "Claude",
    });
    expect(client.client_id).toMatch(/^csk_/);

    // /authorize → redirect into Salesforce with our PKCE + state.
    const { res, captured } = fakeRes();
    await provider.authorize(
      client,
      {
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        codeChallenge: "client-challenge",
        state: "claude-state",
      },
      res,
    );
    const sfUrl = new URL(captured.url!);
    expect(sfUrl.pathname).toBe("/services/oauth2/authorize");
    expect(sfUrl.searchParams.get("client_id")).toBe(LOGIN_APP.clientId);
    expect(sfUrl.searchParams.get("redirect_uri")).toBe(`${MCP_ORIGIN}/oauth/salesforce/callback`);
    const sfState = sfUrl.searchParams.get("state")!;
    expect(sfState).toMatch(/^sfs_/);

    // Salesforce sends the rep back: identity resolved, user connection saved,
    // OUR code minted for the waiting client.
    const { redirect } = await provider.completeSalesforceCallback(sfState, "sf-code");
    const back = new URL(redirect);
    expect(back.origin + back.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(back.searchParams.get("state")).toBe("claude-state");
    const code = back.searchParams.get("code")!;
    expect(code).toMatch(/^csc_/);

    const expectedUserId = normalizeUserId("Dana@Example.com");
    const userConnection = await store.getUserConnection(WORKSPACE, expectedUserId, "salesforce");
    expect(userConnection?.status).toBe("connected");
    expect(userConnection?.connectedUser).toBe("Dana K.");
    // Shared client secret must NOT be persisted per user.
    expect(userConnection?.credentials?.clientSecret).toBeUndefined();
    expect(userConnection?.credentials?.refreshToken).toBe("sf-refresh");

    // PKCE challenge round-trips; the exchange mints tokens; codes are single-use.
    expect(await provider.challengeForAuthorizationCode(client, code)).toBe("client-challenge");
    const tokens = await provider.exchangeAuthorizationCode(
      client,
      code,
      undefined,
      "https://claude.ai/api/mcp/auth_callback",
    );
    expect(tokens.access_token).toMatch(/^csa_/);
    expect(tokens.refresh_token).toMatch(/^csr_/);
    await expect(provider.exchangeAuthorizationCode(client, code)).rejects.toThrow();

    // The verified token IS the running user.
    const auth = await provider.verifyAccessToken(tokens.access_token);
    expect(auth.clientId).toBe(client.client_id);
    expect(auth.expiresAt).toBeGreaterThan(Date.now() / 1000);
    const user = userContextFromStoredUser(auth.extra!.user as never);
    expect(user).toMatchObject({
      tenantId: WORKSPACE,
      userId: expectedUserId,
      name: "Dana K.",
    });

    // Refresh rotates the access token, keeps identity.
    const refreshed = await provider.exchangeRefreshToken(client, tokens.refresh_token!);
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    const auth2 = await provider.verifyAccessToken(refreshed.access_token);
    expect((auth2.extra!.user as { userId: string }).userId).toBe(expectedUserId);

    // Revocation kills the token.
    await provider.revokeToken(client, { token: refreshed.access_token });
    await expect(provider.verifyAccessToken(refreshed.access_token)).rejects.toThrow();
  });

  it("authorize refuses (via redirect error) when no admin Salesforce OAuth exists", async () => {
    vi.stubEnv("CARDSTACK_SF_CLIENT_ID", "");
    vi.stubEnv("CARDSTACK_SF_CLIENT_SECRET", "");
    const store = new InMemoryConfigStore();
    const provider = new CardstackOAuthProvider({
      store,
      mcpOrigin: MCP_ORIGIN,
      fetchImpl: sfFetchStub,
      trustedClientOrigins: ["https://claude.ai"],
    });
    const client = await provider.clientsStore.registerClient!({
      redirect_uris: ["https://claude.ai/cb"],
    });
    const { res, captured } = fakeRes();
    await provider.authorize(
      client,
      { redirectUri: "https://claude.ai/cb", codeChallenge: "c", state: "s" },
      res,
    );
    const url = new URL(captured.url!);
    expect(url.origin).toBe("https://claude.ai");
    expect(url.searchParams.get("error")).toBe("server_error");
    expect(url.searchParams.get("state")).toBe("s");
  });

  it("keeps an existing tenant on its encrypted admin connected app during migration", async () => {
    vi.stubEnv("CARDSTACK_SF_CLIENT_ID", "");
    vi.stubEnv("CARDSTACK_SF_CLIENT_SECRET", "");
    const store = new InMemoryConfigStore();
    await store.setConnection({
      tenantId: TENANT,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date().toISOString(),
      credentials: {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "legacy-client",
        clientSecret: "legacy-secret",
        refreshToken: "admin-refresh",
      },
    });
    const provider = new CardstackOAuthProvider({
      store,
      legacyTenantId: TENANT,
      mcpOrigin: MCP_ORIGIN,
      fetchImpl: sfFetchStub,
      trustedClientOrigins: ["https://claude.ai"],
    });
    const client = await provider.clientsStore.registerClient!({
      redirect_uris: ["https://claude.ai/cb"],
    });
    const { res, captured } = fakeRes();
    await provider.authorize(
      client,
      { redirectUri: "https://claude.ai/cb", codeChallenge: "c", state: "s" },
      res,
    );

    const salesforce = new URL(captured.url!);
    expect(salesforce.searchParams.get("client_id")).toBe("legacy-client");
    const { redirect } = await provider.completeSalesforceCallback(
      salesforce.searchParams.get("state")!,
      "sf-code",
    );
    expect(new URL(redirect).searchParams.get("code")).toMatch(/^csc_/);
    expect((await store.getWorkspace(TENANT))?.salesforceOrgId).toBe(
      "00D000000000001AAA",
    );
    expect(
      await store.getUserConnection(TENANT, normalizeUserId("Dana@Example.com"), "salesforce"),
    ).toBeDefined();
  });

  it("rejects tokens and codes presented by a different client", async () => {
    const { provider } = newProvider(["https://a", "https://b"]);
    const clientA = await provider.clientsStore.registerClient!({ redirect_uris: ["https://a/cb"] });
    const clientB = await provider.clientsStore.registerClient!({ redirect_uris: ["https://b/cb"] });
    const { res, captured } = fakeRes();
    await provider.authorize(
      clientA,
      { redirectUri: "https://a/cb", codeChallenge: "c", state: "s" },
      res,
    );
    const sfState = new URL(captured.url!).searchParams.get("state")!;
    const { redirect } = await provider.completeSalesforceCallback(sfState, "sf-code");
    const code = new URL(redirect).searchParams.get("code")!;
    await expect(provider.challengeForAuthorizationCode(clientB, code)).rejects.toThrow();
    await expect(provider.exchangeAuthorizationCode(clientB, code)).rejects.toThrow();
  });

  /**
   * A1 — the finding this whole interstitial exists for.
   *
   * The attack needed no credential theft: register a client pointing anywhere,
   * send a rep a link on the genuine Cardstack origin, and collect an
   * authorization code the moment they click, because Salesforce silently
   * re-approves an app they already authorized. These tests are the regression
   * guard; if any of them starts passing without the consent step, A1 is back.
   */
  describe("consent for unrecognized clients (A1)", () => {
    const EVIL = "https://evil.example/cb";

    async function throughSalesforce(trusted: string[] = ["https://claude.ai"]) {
      const { store, provider } = newProvider(trusted);
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: [EVIL],
        client_name: "Notes Helper",
      });
      const sfState = await authorizeTo(provider, client, EVIL);
      const { redirect } = await provider.completeSalesforceCallback(sfState, "sf-code");
      return { store, provider, client, redirect };
    }

    it("does not mint an authorization code for an unknown client", async () => {
      const { redirect } = await throughSalesforce();
      expect(redirect).toContain("/oauth/consent");
      expect(redirect).not.toContain("code=");
      expect(new URL(redirect).origin).toBe(MCP_ORIGIN);
    });

    it("names the client and the redirect target on the prompt", async () => {
      const { provider, redirect } = await throughSalesforce();
      const token = new URL(redirect).searchParams.get("t")!;
      expect(await provider.describeConsent(token)).toMatchObject({
        clientName: "Notes Helper",
        redirectOrigin: "https://evil.example",
        signerName: "Dana K.",
        workspaceName: "Acme Corp",
      });
    });

    it("mints the code only after the rep allows it", async () => {
      const { provider, redirect } = await throughSalesforce();
      const token = new URL(redirect).searchParams.get("t")!;
      const done = await provider.completeConsent(token, "allow");
      const back = new URL(done!.redirect);
      expect(back.origin + back.pathname).toBe(EVIL);
      expect(back.searchParams.get("code")).toMatch(/^csc_/);
      expect(back.searchParams.get("state")).toBe("claude-state");
    });

    it("returns access_denied and no code when the rep cancels", async () => {
      const { provider, redirect } = await throughSalesforce();
      const token = new URL(redirect).searchParams.get("t")!;
      const done = await provider.completeConsent(token, "deny");
      const back = new URL(done!.redirect);
      expect(back.searchParams.get("error")).toBe("access_denied");
      expect(back.searchParams.get("code")).toBeNull();
      expect(back.searchParams.get("state")).toBe("claude-state");
    });

    it("refuses a tampered or forged continuation token", async () => {
      const { provider, redirect } = await throughSalesforce();
      const token = new URL(redirect).searchParams.get("t")!;
      expect(await provider.describeConsent(`${token}x`)).toBeUndefined();
      expect(await provider.completeConsent("csn_made-up.deadbeef", "allow")).toBeUndefined();
    });

    it("is single-use, so a captured token cannot be replayed into a second code", async () => {
      const { provider, redirect } = await throughSalesforce();
      const token = new URL(redirect).searchParams.get("t")!;
      expect(await provider.completeConsent(token, "allow")).toBeDefined();
      expect(await provider.completeConsent(token, "allow")).toBeUndefined();
    });

    it("does not prompt again for a client the rep already allowed", async () => {
      const { provider, client, redirect } = await throughSalesforce();
      await provider.completeConsent(new URL(redirect).searchParams.get("t")!, "allow");

      const sfState = await authorizeTo(provider, client, EVIL);
      const second = await provider.completeSalesforceCallback(sfState, "sf-code");
      expect(new URL(second.redirect).searchParams.get("code")).toMatch(/^csc_/);
    });

    it("still prompts for a DIFFERENT client after one was allowed", async () => {
      const { provider, redirect } = await throughSalesforce();
      await provider.completeConsent(new URL(redirect).searchParams.get("t")!, "allow");

      const other = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://other.example/cb"],
        client_name: "Another App",
      });
      const sfState = await authorizeTo(provider, other, "https://other.example/cb");
      const second = await provider.completeSalesforceCallback(sfState, "sf-code");
      expect(second.redirect).toContain("/oauth/consent");
    });

    it("skips the prompt entirely for a first-party client", async () => {
      const { provider } = newProvider(["https://claude.ai"]);
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://claude.ai/cb"],
        client_name: "Claude",
      });
      const sfState = await authorizeTo(provider, client, "https://claude.ai/cb");
      const { redirect } = await provider.completeSalesforceCallback(sfState, "sf-code");
      expect(new URL(redirect).searchParams.get("code")).toMatch(/^csc_/);
    });

    it("prompts when NOTHING is configured as first party", async () => {
      const { provider } = newProvider([]);
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://claude.ai/cb"],
      });
      const sfState = await authorizeTo(provider, client, "https://claude.ai/cb");
      const { redirect } = await provider.completeSalesforceCallback(sfState, "sf-code");
      expect(redirect).toContain("/oauth/consent");
    });

    it("still persists the rep's own CRM connection while consent is pending", async () => {
      // Identity resolution happens before the decision; only ACCESS waits.
      const { store } = await throughSalesforce();
      const connection = await store.getUserConnection(
        WORKSPACE,
        normalizeUserId("Dana@Example.com"),
        "salesforce",
      );
      expect(connection?.status).toBe("connected");
    });
  });

  /**
   * C2 — a rep whose org is a sandbox could not sign in at all through a chat
   * host, and had no control that would have fixed it.
   */
  describe("production vs sandbox (C2)", () => {
    it("asks which Salesforce when the deployment has not pinned one", async () => {
      vi.stubEnv("CARDSTACK_SF_LOGIN_URL", "");
      const { provider } = newProvider();
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://claude.ai/cb"],
      });
      const { res, captured } = fakeRes();
      await provider.authorize(
        client,
        { redirectUri: "https://claude.ai/cb", codeChallenge: "c", state: "s" },
        res,
      );
      expect(captured.url).toBeUndefined();
      expect(captured.html).toContain("Sandbox");
      expect(captured.html).toContain("Production");
    });

    it("sends a sandbox choice to test.salesforce.com", async () => {
      vi.stubEnv("CARDSTACK_SF_LOGIN_URL", "");
      const { provider } = newProvider();
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://claude.ai/cb"],
      });
      const { res, captured } = fakeRes();
      await provider.authorize(
        client,
        { redirectUri: "https://claude.ai/cb", codeChallenge: "c", state: "s" },
        res,
      );
      const token = /t=([^&"]+)/.exec(captured.html!)![1];
      const redirect = await provider.chooseLoginHost(decodeURIComponent(token), "sandbox");
      expect(new URL(redirect!).origin).toBe("https://test.salesforce.com");
      expect(new URL(redirect!).searchParams.get("code_challenge")).toBeTruthy();
    });

    it("sends a production choice to login.salesforce.com", async () => {
      vi.stubEnv("CARDSTACK_SF_LOGIN_URL", "");
      const { provider } = newProvider();
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://claude.ai/cb"],
      });
      const { res, captured } = fakeRes();
      await provider.authorize(
        client,
        { redirectUri: "https://claude.ai/cb", codeChallenge: "c", state: "s" },
        res,
      );
      const token = /t=([^&"]+)/.exec(captured.html!)![1];
      const redirect = await provider.chooseLoginHost(decodeURIComponent(token), "production");
      expect(new URL(redirect!).origin).toBe("https://login.salesforce.com");
    });

    it("refuses a forged host-choice token", async () => {
      expect(await provider0().chooseLoginHost("sfs_nope.deadbeef", "sandbox")).toBeUndefined();
    });

    it("skips the question entirely when the deployment pinned a login host", async () => {
      const { provider } = newProvider();
      const client = await provider.clientsStore.registerClient!({
        redirect_uris: ["https://claude.ai/cb"],
      });
      const { res, captured } = fakeRes();
      await provider.authorize(
        client,
        { redirectUri: "https://claude.ai/cb", codeChallenge: "c", state: "s" },
        res,
      );
      expect(captured.html).toBeUndefined();
      expect(new URL(captured.url!).origin).toBe("https://login.salesforce.com");
    });
  });
});

function provider0() {
  return newProvider().provider;
}
