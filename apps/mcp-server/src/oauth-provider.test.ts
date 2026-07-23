/**
 * CardstackOAuthProvider — the full per-user flow against the in-memory store
 * with a stubbed Salesforce: register → authorize (SF redirect) → SF callback
 * (identity + per-user connection + our code) → token exchange → verify.
 */
import { describe, expect, it } from "vitest";
import type { Response } from "express";
import { InMemoryConfigStore } from "@cardstack/config-store";
import { normalizeUserId } from "@cardstack/core";
import { CardstackOAuthProvider, userContextFromStoredUser } from "./oauth-provider.js";

const TENANT = "t_demo";
const MCP_ORIGIN = "https://mcp.example.com";

const sfFetchStub: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("/services/oauth2/token")) {
    return new global.Response(
      JSON.stringify({
        access_token: "sf-access",
        refresh_token: "sf-refresh",
        instance_url: "https://org.my.salesforce.com",
        id: "https://login.salesforce.com/id/00Dorg/005USERID",
        token_type: "Bearer",
      }),
      { status: 200 },
    );
  }
  if (url.includes("/services/data/v61.0/query")) {
    return new global.Response(
      JSON.stringify({
        records: [{ Name: "Dana K.", Email: "Dana@Example.com", Username: "dana@example.com" }],
        totalSize: 1,
        done: true,
      }),
      { status: 200 },
    );
  }
  return new global.Response("{}", { status: 404 });
};

async function providerWithConnectedAdmin() {
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
      clientId: "sf-client",
      clientSecret: "sf-secret",
      refreshToken: "admin-refresh",
    },
  });
  const provider = new CardstackOAuthProvider({
    store,
    tenantId: TENANT,
    mcpOrigin: MCP_ORIGIN,
    fetchImpl: sfFetchStub,
  });
  return { store, provider };
}

const fakeRes = () => {
  const captured: { url?: string } = {};
  return {
    res: { redirect: (url: string) => void (captured.url = url) } as unknown as Response,
    captured,
  };
};

describe("CardstackOAuthProvider", () => {
  it("runs the full flow: register → authorize → SF callback → token → verify", async () => {
    const { store, provider } = await providerWithConnectedAdmin();

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
    expect(sfUrl.searchParams.get("client_id")).toBe("sf-client");
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
    const userConnection = await store.getUserConnection(TENANT, expectedUserId, "salesforce");
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
    expect(user).toMatchObject({ tenantId: TENANT, userId: expectedUserId, name: "Dana K." });

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
    const store = new InMemoryConfigStore();
    const provider = new CardstackOAuthProvider({
      store,
      tenantId: TENANT,
      mcpOrigin: MCP_ORIGIN,
      fetchImpl: sfFetchStub,
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

  it("rejects tokens and codes presented by a different client", async () => {
    const { provider } = await providerWithConnectedAdmin();
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
});
