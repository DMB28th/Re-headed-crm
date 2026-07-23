/**
 * Per-user MCP OAuth 2.1 — Salesforce as the identity provider (PLAN.md
 * multi-tenancy: "The MCP connection is per-user; token maps to tenant + CRM
 * connection").
 *
 * Flow: claude.ai registers dynamically → /authorize bounces the rep through
 * the SAME per-user Salesforce OAuth Studio uses → the callback binds their
 * Salesforce identity to a Cardstack authorization code AND persists their
 * per-user SF connection (so the adapter runs as them) → the token endpoint
 * mints opaque bearer tokens → requireBearerAuth on /mcp replaces header
 * identity trust entirely.
 *
 * All state (clients, pending authorizations, codes, tokens) lives in the
 * config store's namespaced KV — sealed at rest, TTL-expired, shared across
 * instances (the server itself stays stateless).
 */
import { randomBytes, createHash } from "node:crypto";
import type { Response } from "express";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { normalizeUserId, DEFAULT_AUDIENCE, type UserContext } from "@cardstack/core";
import {
  buildSalesforceAuthorizationUrl,
  exchangeSalesforceAuthorizationCode,
  normalizeSalesforceLoginUrl,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import type { AdminConfigStore, UserConnectionState } from "@cardstack/config-store";

const NS = {
  clients: "oauth-clients",
  pending: "oauth-pending",
  codes: "oauth-codes",
  access: "oauth-access",
  refresh: "oauth-refresh",
} as const;

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1h — claude.ai refreshes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const PENDING_TTL_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;

const rand = (prefix: string) => `${prefix}_${randomBytes(24).toString("base64url")}`;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

interface PendingAuth {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  mcpState: string | null;
  sfVerifier: string;
}

interface StoredCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  user: StoredUser;
}

interface StoredUser {
  tenantId: string;
  userId: string;
  name: string;
  email?: string;
}

interface StoredToken {
  clientId: string;
  user: StoredUser;
  expiresAt: string;
}

export function userContextFromStoredUser(user: StoredUser): UserContext {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    name: user.name,
    ...(user.email ? { email: user.email } : {}),
    audience: DEFAULT_AUDIENCE,
  };
}

/** Store surface the provider needs (kv + connections). */
type ProviderStore = Pick<
  AdminConfigStore,
  "kvGet" | "kvSet" | "kvDelete" | "getConnection" | "setUserConnection"
>;

export class CardstackOAuthProvider implements OAuthServerProvider {
  constructor(
    private readonly deps: {
      store: ProviderStore;
      tenantId: string;
      /** Public MCP origin, e.g. https://cardstackmcp-server-production.up.railway.app */
      mcpOrigin: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private get sfCallbackUri(): string {
    return `${this.deps.mcpOrigin.replace(/\/$/, "")}/oauth/salesforce/callback`;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    const { store } = this.deps;
    return {
      getClient: async (clientId) =>
        (await store.kvGet(NS.clients, clientId)) as OAuthClientInformationFull | undefined,
      registerClient: async (client) => {
        const full: OAuthClientInformationFull = {
          ...client,
          client_id: rand("csk"),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        await store.kvSet(NS.clients, full.client_id, full as Record<string, unknown>);
        return full;
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const fail = (description: string): void => {
      const url = new URL(params.redirectUri);
      url.searchParams.set("error", "server_error");
      url.searchParams.set("error_description", description);
      if (params.state) url.searchParams.set("state", params.state);
      res.redirect(url.toString());
    };
    const connection = await this.deps.store.getConnection(this.deps.tenantId);
    const admin = connection.credentials as SalesforceCredentials | undefined;
    if (
      connection.status !== "connected" ||
      connection.crm !== "salesforce" ||
      admin?.authType !== "oauth"
    ) {
      fail("Cardstack: an admin must connect Salesforce with OAuth in Studio before reps can sign in.");
      return;
    }
    const sfState = rand("sfs");
    const sfVerifier = randomBytes(32).toString("base64url");
    const sfChallenge = createHash("sha256").update(sfVerifier).digest("base64url");
    const pending: PendingAuth = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      mcpState: params.state ?? null,
      sfVerifier,
    };
    await this.deps.store.kvSet(
      NS.pending,
      sfState,
      pending as unknown as Record<string, unknown>,
      inMs(PENDING_TTL_MS),
    );
    res.redirect(
      buildSalesforceAuthorizationUrl({
        loginUrl: admin.loginUrl,
        clientId: admin.clientId,
        redirectUri: this.sfCallbackUri,
        state: sfState,
        codeChallenge: sfChallenge,
      }),
    );
  }

  /**
   * The Salesforce leg's return. Exchanges the SF code, resolves the rep's
   * identity from it, persists their per-user SF connection (same record shape
   * Studio's user lane writes — the runtime adapter fork picks it up), and
   * mints the Cardstack authorization code for the waiting MCP client.
   */
  async completeSalesforceCallback(sfState: string, sfCode: string): Promise<{ redirect: string }> {
    const { store, tenantId } = this.deps;
    const pending = (await store.kvGet(NS.pending, sfState)) as unknown as PendingAuth | undefined;
    if (!pending) throw new Error("This sign-in link expired or was already used. Start again from your chat app.");
    await store.kvDelete(NS.pending, sfState);

    const connection = await store.getConnection(tenantId);
    const admin = connection.credentials as SalesforceCredentials | undefined;
    if (!admin?.clientSecret) {
      throw new Error("The admin Salesforce connection is missing its client secret. Reconnect admin OAuth in Studio.");
    }
    const credentials = await exchangeSalesforceAuthorizationCode(
      {
        loginUrl: normalizeSalesforceLoginUrl(admin.loginUrl),
        clientId: admin.clientId,
        clientSecret: admin.clientSecret,
        redirectUri: this.sfCallbackUri,
        code: sfCode,
        codeVerifier: pending.sfVerifier,
      },
      this.deps.fetchImpl ?? fetch,
    );
    const identity = await this.fetchIdentity(credentials);
    const userId = normalizeUserId(identity.email ?? identity.username ?? identity.sfUserId);

    // Persist the rep's own SF connection — minus the shared client secret,
    // mirroring Studio's user lane (the runtime merges it back in).
    const { clientSecret: _omit, ...userCredentials } = credentials as unknown as Record<string, string>;
    const userConnection: UserConnectionState = {
      tenantId,
      userId,
      status: "connected",
      crm: "salesforce",
      label: "user OAuth (chat sign-in)",
      changedAt: new Date().toISOString(),
      connectedUser: identity.name,
      credentials: userCredentials,
    };
    await store.setUserConnection(userConnection);

    const code = rand("csc");
    const stored: StoredCode = {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      user: {
        tenantId,
        userId,
        name: identity.name,
        ...(identity.email ? { email: identity.email } : {}),
      },
    };
    await store.kvSet(NS.codes, code, stored as unknown as Record<string, unknown>, inMs(CODE_TTL_MS));
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.mcpState) redirect.searchParams.set("state", pending.mcpState);
    return { redirect: redirect.toString() };
  }

  /** Identity from the token response: userId parsed from the identity URL,
   *  name/email from a one-row User query (works with the `api` scope). */
  private async fetchIdentity(credentials: SalesforceCredentials): Promise<{
    sfUserId: string;
    name: string;
    username?: string;
    email?: string;
  }> {
    const sfUserId = credentials.identityUrl?.split("/").pop() ?? "";
    if (!sfUserId) throw new Error("Salesforce did not return an identity URL.");
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const soql = encodeURIComponent(
      `SELECT Name, Email, Username FROM User WHERE Id = '${sfUserId.replace(/[^a-zA-Z0-9]/g, "")}'`,
    );
    const res = await fetchImpl(
      `${credentials.instanceUrl}/services/data/v61.0/query?q=${soql}`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
    );
    const data = (await res.json().catch(() => ({}))) as {
      records?: { Name?: string; Email?: string; Username?: string }[];
    };
    const row = data.records?.[0];
    return {
      sfUserId,
      name: row?.Name ?? "Salesforce user",
      ...(row?.Username ? { username: row.Username } : {}),
      ...(row?.Email ? { email: row.Email } : {}),
    };
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = (await this.deps.store.kvGet(NS.codes, authorizationCode)) as
      | unknown as StoredCode
      | undefined;
    if (!stored || stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Unknown or expired authorization code.");
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const { store } = this.deps;
    const stored = (await store.kvGet(NS.codes, authorizationCode)) as
      | unknown as StoredCode
      | undefined;
    if (!stored || stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Unknown or expired authorization code.");
    }
    if (redirectUri && stored.redirectUri !== redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request.");
    }
    await store.kvDelete(NS.codes, authorizationCode); // single-use
    return this.mintTokens(client.client_id, stored.user);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const { store } = this.deps;
    const stored = (await store.kvGet(NS.refresh, refreshToken)) as
      | unknown as StoredToken
      | undefined;
    if (!stored || stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Unknown or expired refresh token.");
    }
    return this.mintTokens(client.client_id, stored.user, refreshToken);
  }

  private async mintTokens(
    clientId: string,
    user: StoredUser,
    existingRefresh?: string,
  ): Promise<OAuthTokens> {
    const { store } = this.deps;
    const accessToken = rand("csa");
    const accessExpiry = inMs(ACCESS_TTL_MS);
    await store.kvSet(
      NS.access,
      accessToken,
      { clientId, user, expiresAt: accessExpiry } satisfies StoredToken as unknown as Record<string, unknown>,
      accessExpiry,
    );
    let refreshToken = existingRefresh;
    if (!refreshToken) {
      refreshToken = rand("csr");
      await store.kvSet(
        NS.refresh,
        refreshToken,
        { clientId, user, expiresAt: inMs(REFRESH_TTL_MS) } satisfies StoredToken as unknown as Record<string, unknown>,
        inMs(REFRESH_TTL_MS),
      );
    }
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: Math.floor(ACCESS_TTL_MS / 1000),
      refresh_token: refreshToken,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = (await this.deps.store.kvGet(NS.access, token)) as
      | unknown as StoredToken
      | undefined;
    if (!stored) throw new InvalidTokenError("Unknown or expired access token.");
    return {
      token,
      clientId: stored.clientId,
      scopes: [],
      expiresAt: Math.floor(Date.parse(stored.expiresAt) / 1000),
      extra: { user: stored.user },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const { store } = this.deps;
    for (const ns of [NS.access, NS.refresh]) {
      const stored = (await store.kvGet(ns, request.token)) as unknown as StoredToken | undefined;
      if (stored && stored.clientId === client.client_id) await store.kvDelete(ns, request.token);
    }
  }
}
