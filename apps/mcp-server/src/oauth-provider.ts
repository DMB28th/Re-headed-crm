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
import { DEFAULT_AUDIENCE, type UserContext } from "@cardstack/core";
import {
  buildSalesforceAuthorizationUrl,
  cardstackSalesforceLoginApp,
  exchangeSalesforceAuthorizationCode,
  fetchSalesforceSignerIdentity,
  normalizeSalesforceLoginUrl,
  type SalesforceCredentials,
  type SalesforceLoginApp,
} from "@cardstack/crm-adapters";
import { resolveSignIn, type AdminConfigStore, type UserConnectionState } from "@cardstack/config-store";

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
  /** Host the authorize leg went to; the token exchange must match it. */
  sfLoginUrl: string;
  /** Set only while migrating a pre-workspace, single-tenant deployment. */
  legacyTenantId?: string;
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

/** Store surface the provider needs (kv + connections + identity). */
type ProviderStore = Pick<
  AdminConfigStore,
  | "kvGet"
  | "kvSet"
  | "kvDelete"
  | "getConnection"
  | "setUserConnection"
  | "getWorkspace"
  | "getWorkspaceByOrgId"
  | "createWorkspace"
  | "getAccount"
  | "getAccountBySalesforceUserId"
  | "upsertAccount"
  | "getMembership"
  | "listMembershipsForAccount"
  | "listMembershipsForWorkspace"
  | "setMembership"
>;

export class CardstackOAuthProvider implements OAuthServerProvider {
  constructor(
    private readonly deps: {
      store: ProviderStore;
      /** Public MCP origin, e.g. https://cardstackmcp-server-production.up.railway.app */
      mcpOrigin: string;
      fetchImpl?: typeof fetch;
      /** Overridable for tests; defaults to the CARDSTACK_SF_* env pair. */
      loginApp?: SalesforceLoginApp;
      /**
       * Compatibility lane for existing single-tenant installs whose connected
       * app still lives in the tenant's encrypted admin connection.
       */
      legacyTenantId?: string;
    },
  ) {}

  private get loginApp(): SalesforceLoginApp | undefined {
    return this.deps.loginApp ?? cardstackSalesforceLoginApp();
  }

  private get sfCallbackUri(): string {
    return `${this.deps.mcpOrigin.replace(/\/$/, "")}/oauth/salesforce/callback`;
  }

  private async loginConfig(
    legacyTenantId = this.deps.legacyTenantId,
  ): Promise<
    | { app: SalesforceLoginApp; loginUrl: string; legacyTenantId?: string }
    | undefined
  > {
    const platformApp = this.loginApp;
    if (platformApp) {
      return {
        app: platformApp,
        loginUrl: normalizeSalesforceLoginUrl(process.env.CARDSTACK_SF_LOGIN_URL),
      };
    }
    if (!legacyTenantId) return undefined;
    const connection = await this.deps.store.getConnection(legacyTenantId);
    const credentials = connection.credentials as SalesforceCredentials | undefined;
    if (
      connection.status !== "connected" ||
      connection.crm !== "salesforce" ||
      credentials?.authType !== "oauth" ||
      !credentials.clientId ||
      !credentials.clientSecret
    ) {
      return undefined;
    }
    return {
      app: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      },
      loginUrl: normalizeSalesforceLoginUrl(credentials.loginUrl),
      legacyTenantId,
    };
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
    // New workspaces use Cardstack's connected app. Existing single-tenant
    // installs may temporarily reuse the encrypted app on their admin
    // connection so this migration doesn't break already-connected chat hosts.
    const login = await this.loginConfig();
    if (!login) {
      fail(
        "Cardstack sign-in is not configured on this server: CARDSTACK_SF_CLIENT_ID and CARDSTACK_SF_CLIENT_SECRET are unset.",
      );
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
      sfLoginUrl: login.loginUrl,
      ...(login.legacyTenantId ? { legacyTenantId: login.legacyTenantId } : {}),
    };
    await this.deps.store.kvSet(
      NS.pending,
      sfState,
      pending as unknown as Record<string, unknown>,
      inMs(PENDING_TTL_MS),
    );
    res.redirect(
      buildSalesforceAuthorizationUrl({
        loginUrl: login.loginUrl,
        clientId: login.app.clientId,
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
    const { store } = this.deps;
    const pending = (await store.kvGet(NS.pending, sfState)) as unknown as PendingAuth | undefined;
    if (!pending) throw new Error("This sign-in link expired or was already used. Start again from your chat app.");
    await store.kvDelete(NS.pending, sfState);

    const login = await this.loginConfig(pending.legacyTenantId);
    if (!login) throw new Error("Cardstack sign-in is not configured on this server.");

    const credentials = await exchangeSalesforceAuthorizationCode(
      {
        loginUrl: pending.sfLoginUrl,
        clientId: login.app.clientId,
        clientSecret: login.app.clientSecret,
        redirectUri: this.sfCallbackUri,
        code: sfCode,
        codeVerifier: pending.sfVerifier,
      },
      this.deps.fetchImpl ?? fetch,
    );

    // The org this token belongs to decides the workspace — NOT an env var.
    // Same resolver Studio's login uses, so a rep who arrives through a chat
    // host first and an admin who arrives through Studio first converge on one
    // workspace and one account id.
    const identity = await fetchSalesforceSignerIdentity(credentials, this.deps.fetchImpl ?? fetch);
    if (
      pending.legacyTenantId &&
      !(await store.getWorkspaceByOrgId(identity.orgId)) &&
      !(await store.getWorkspace(pending.legacyTenantId))
    ) {
      await store.createWorkspace({
        id: pending.legacyTenantId,
        salesforceOrgId: identity.orgId,
        name: identity.orgName?.trim() || "My workspace",
        createdAt: new Date().toISOString(),
      });
    }
    const { account, workspace } = await resolveSignIn(store, identity);
    const tenantId = workspace.id;

    // Persist the rep's own SF connection — minus the client secret, mirroring
    // Studio's user lane (the runtime merges it back in at adapter build time).
    const { clientSecret: _omit, ...userCredentials } = credentials as unknown as Record<string, string>;
    const userConnection: UserConnectionState = {
      tenantId,
      userId: account.id,
      status: "connected",
      crm: "salesforce",
      label: "user OAuth (chat sign-in)",
      changedAt: new Date().toISOString(),
      connectedUser: account.name,
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
        userId: account.id,
        name: account.name,
        ...(account.email ? { email: account.email } : {}),
      },
    };
    await store.kvSet(NS.codes, code, stored as unknown as Record<string, unknown>, inMs(CODE_TTL_MS));
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.mcpState) redirect.searchParams.set("state", pending.mcpState);
    return { redirect: redirect.toString() };
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
