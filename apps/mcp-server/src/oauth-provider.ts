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
import { signState, verifyState } from "./confirm-token.js";
import { isFirstPartyClient, renderLoginHostPicker } from "./consent.js";

const NS = {
  clients: "oauth-clients",
  pending: "oauth-pending",
  /** Signed in, not yet consented — the gap A1's fix inserts. */
  consent: "oauth-consent-pending",
  /** Remembered "allow" decisions, keyed by account+client. */
  consented: "oauth-consent-granted",
  codes: "oauth-codes",
  access: "oauth-access",
  refresh: "oauth-refresh",
} as const;

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1h — claude.ai refreshes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const PENDING_TTL_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
/** A decision should be made now, not left open in a tab. */
const CONSENT_TTL_MS = 10 * 60 * 1000;
/** Remembered as long as the grant it authorizes could still be refreshed. */
const CONSENT_MEMORY_MS = REFRESH_TTL_MS;

const rand = (prefix: string) => `${prefix}_${randomBytes(24).toString("base64url")}`;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
const consentKey = (userId: string, clientId: string) => `${userId}::${clientId}`;

function safeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

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

/**
 * A completed Salesforce sign-in whose authorization code has NOT been minted
 * because the client is not one we recognize. Everything needed to finish is
 * captured here so the decision itself carries no secrets — the browser only
 * ever holds a signed pointer to this record.
 */
interface PendingConsent {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  mcpState: string | null;
  user: StoredUser;
  workspaceName: string;
  signerEmail?: string;
}

/** What the consent page needs in order to render itself honestly. */
export interface ConsentPrompt {
  token: string;
  signerName: string;
  signerEmail?: string;
  workspaceName: string;
  clientName: string;
  redirectOrigin: string;
}

interface StoredCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  user: StoredUser;
}

/**
 * Display identity, cached on the token so a tool call does not need three
 * store reads to render a name. **Not the authorization decision** — see
 * `verifyAccessToken`, which re-reads the membership every time.
 *
 * `tenantId` and `userId` here ARE the workspace and account ids: that is what
 * `resolveSignIn` wrote, and what every other table is keyed by.
 */
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
      /** Overridable for tests; defaults to CARDSTACK_TRUSTED_CLIENT_ORIGINS. */
      trustedClientOrigins?: string[];
    },
  ) {}

  private isTrustedClient(client: { redirect_uris?: string[] }): boolean {
    const configured = this.deps.trustedClientOrigins;
    return isFirstPartyClient(
      { redirect_uris: client.redirect_uris ?? [] },
      configured ? { CARDSTACK_TRUSTED_CLIENT_ORIGINS: configured.join(",") } : process.env,
    );
  }

  private get loginApp(): SalesforceLoginApp | undefined {
    return this.deps.loginApp ?? cardstackSalesforceLoginApp();
  }

  private get origin(): string {
    return this.deps.mcpOrigin.replace(/\/$/, "");
  }

  private get sfCallbackUri(): string {
    return `${this.origin}/oauth/salesforce/callback`;
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

    // C2. Studio has always let someone pick production or sandbox; this lane
    // never could, because the MCP SDK passes no custom parameters through to
    // the provider — so a rep whose org is a sandbox got a generic failure and
    // no control that would fix it. When the deployment has not pinned a login
    // host, ask instead of guessing.
    if (!login.legacyTenantId && !process.env.CARDSTACK_SF_LOGIN_URL?.trim()) {
      res.send(renderLoginHostPicker(signState(sfState), `${this.origin}/oauth/login-host`));
      return;
    }

    res.redirect(
      this.salesforceRedirect(sfState, pending.sfLoginUrl, login.app.clientId, sfVerifier),
    );
  }

  /**
   * Finish an `/authorize` that paused on the production-or-sandbox question.
   * The token is a signed pointer at the pending record, so the choice cannot
   * be made for a flow the caller does not already hold.
   */
  async chooseLoginHost(token: string, env: string): Promise<string | undefined> {
    let sfState: string;
    try {
      sfState = verifyState(token, "login-host");
    } catch {
      return undefined;
    }
    const { store } = this.deps;
    const pending = (await store.kvGet(NS.pending, sfState)) as unknown as PendingAuth | undefined;
    if (!pending) return undefined;

    const login = await this.loginConfig(pending.legacyTenantId);
    if (!login) return undefined;
    const loginUrl = normalizeSalesforceLoginUrl(
      env === "sandbox" ? "https://test.salesforce.com" : "https://login.salesforce.com",
    );
    // The token exchange must go to the same host the authorize leg did.
    await store.kvSet(
      NS.pending,
      sfState,
      { ...pending, sfLoginUrl: loginUrl } as unknown as Record<string, unknown>,
      inMs(PENDING_TTL_MS),
    );
    return this.salesforceRedirect(sfState, loginUrl, login.app.clientId, pending.sfVerifier);
  }

  /** The verifier stays server-side on the pending record; only its hash travels. */
  private salesforceRedirect(
    sfState: string,
    loginUrl: string,
    clientId: string,
    sfVerifier: string,
  ): string {
    return buildSalesforceAuthorizationUrl({
      loginUrl,
      clientId,
      redirectUri: this.sfCallbackUri,
      state: sfState,
      codeChallenge: createHash("sha256").update(sfVerifier).digest("base64url"),
    });
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

    const user: StoredUser = {
      tenantId,
      userId: account.id,
      name: account.name,
      ...(account.email ? { email: account.email } : {}),
    };

    // A1. Everything above this line is identity resolution; everything below
    // is granting access. An unrecognized client stops here — the authorization
    // code is minted only past a decision the rep actually made.
    const client = (await store.kvGet(NS.clients, pending.clientId)) as
      | { client_name?: string; redirect_uris?: string[] }
      | undefined;
    const trusted = this.isTrustedClient(client ?? {});
    const remembered = trusted
      ? true
      : !!(await store.kvGet(NS.consented, consentKey(account.id, pending.clientId)));

    if (!trusted && !remembered) {
      const consentId = rand("csn");
      const record: PendingConsent = {
        clientId: pending.clientId,
        clientName: client?.client_name?.trim() || "An unrecognized app",
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        mcpState: pending.mcpState,
        user,
        workspaceName: workspace.name,
        ...(account.email ? { signerEmail: account.email } : {}),
      };
      await store.kvSet(
        NS.consent,
        consentId,
        record as unknown as Record<string, unknown>,
        inMs(CONSENT_TTL_MS),
      );
      const token = signState(consentId);
      return { redirect: `${this.origin}/oauth/consent?t=${encodeURIComponent(token)}` };
    }

    return { redirect: await this.mintCodeRedirect(pending, user) };
  }

  /** Shared tail of the two paths into an authorization code. */
  private async mintCodeRedirect(
    pending: Pick<PendingAuth, "clientId" | "redirectUri" | "codeChallenge" | "mcpState">,
    user: StoredUser,
  ): Promise<string> {
    const code = rand("csc");
    const stored: StoredCode = {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      user,
    };
    await this.deps.store.kvSet(
      NS.codes,
      code,
      stored as unknown as Record<string, unknown>,
      inMs(CODE_TTL_MS),
    );
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.mcpState) redirect.searchParams.set("state", pending.mcpState);
    return redirect.toString();
  }

  /** What the consent page should say. Undefined when the token is stale or forged. */
  async describeConsent(token: string): Promise<ConsentPrompt | undefined> {
    const record = await this.readConsent(token);
    if (!record) return undefined;
    return {
      token,
      signerName: record.user.name,
      ...(record.signerEmail ? { signerEmail: record.signerEmail } : {}),
      workspaceName: record.workspaceName,
      clientName: record.clientName,
      redirectOrigin: safeOrigin(record.redirectUri) ?? record.redirectUri,
    };
  }

  /**
   * Apply the rep's decision. Single-use either way: the pending record is
   * deleted before anything is minted, so a captured token cannot be replayed
   * into a second authorization code.
   */
  async completeConsent(
    token: string,
    decision: "allow" | "deny",
  ): Promise<{ redirect: string } | undefined> {
    const record = await this.readConsent(token);
    if (!record) return undefined;
    await this.deps.store.kvDelete(NS.consent, verifyState(token, "consent"));

    if (decision !== "allow") {
      // RFC 6749 section 4.1.2.1 — tell the client, do not just drop the flow.
      const redirect = new URL(record.redirectUri);
      redirect.searchParams.set("error", "access_denied");
      redirect.searchParams.set("error_description", "The user declined this app's request.");
      if (record.mcpState) redirect.searchParams.set("state", record.mcpState);
      return { redirect: redirect.toString() };
    }

    await this.deps.store.kvSet(
      NS.consented,
      consentKey(record.user.userId, record.clientId),
      { decidedAt: new Date().toISOString() },
      inMs(CONSENT_MEMORY_MS),
    );
    return { redirect: await this.mintCodeRedirect(record, record.user) };
  }

  private async readConsent(token: string): Promise<PendingConsent | undefined> {
    let consentId: string;
    try {
      consentId = verifyState(token, "consent");
    } catch {
      return undefined;
    }
    return (await this.deps.store.kvGet(NS.consent, consentId)) as unknown as
      | PendingConsent
      | undefined;
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
    // Checked here too: otherwise a removed user refreshes their way back in
    // and holds a fresh hour of access every time the chat host polls.
    try {
      await this.requireLiveMembership(stored.user);
    } catch {
      throw new InvalidGrantError("Your access to this workspace was removed. Sign in again.");
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
    await this.requireLiveMembership(stored.user);
    return {
      token,
      clientId: stored.clientId,
      scopes: [],
      expiresAt: Math.floor(Date.parse(stored.expiresAt) / 1000),
      extra: { user: stored.user },
    };
  }

  /**
   * A4. The token's identity used to be frozen at issuance and never checked
   * again, so removing someone from a workspace was instant in Studio and a
   * no-op here for up to thirty days — and the docs claimed otherwise for both
   * lanes. One store read, on a request path that already does two, buys the
   * two lanes the same revocation story.
   *
   * Deliberately checks MEMBERSHIP, not role: members are the expected
   * population on this lane. The gate is belonging to the workspace, not
   * authority within it.
   */
  private async requireLiveMembership(user: StoredUser): Promise<void> {
    if (!user?.userId || !user?.tenantId) {
      // A token that verifies but carries no identity is a bug or a leftover
      // from an older shape. There is no safe default to fall back to.
      throw new InvalidTokenError("This token carries no identity. Sign in again.");
    }
    const membership = await this.deps.store.getMembership(user.userId, user.tenantId);
    if (!membership) {
      throw new InvalidTokenError("Your access to this workspace was removed. Sign in again.");
    }
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
