/**
 * SalesforceAdapter — CrmAdapter over a REAL Salesforce org (M2 adapter).
 *
 * Auth: OAuth 2.0 over a Connected App / External Client App. Primary path is
 * the authorization-code web-server flow: Studio stores admin OAuth for setup
 * and per-user OAuth for runtime. Legacy client credentials remain supported
 * for older demo connections. Tokens are fetched lazily and re-fetched once on
 * 401. Because every call runs as the chosen Salesforce user, Salesforce
 * enforces FLS and sharing on top of Cardstack's config layer.
 *
 * Coverage notes (v1):
 * - Saved views come from the REST listviews API (id, label, filter summary
 *   from the listview describe).
 * - getActivity / getValidationRules / listFlows return [] (Tooling API needs
 *   extra perms — see PLAN's 3d spike).
 * - listRecentRecords uses /recent (no timestamps → "recently viewed" note).
 * - Describe metadata carries semantic hints (stage/amount/owner/closeDate) and
 *   closedValues from OpportunityStage; describe cache has a ~10-minute TTL so
 *   FLS/picklist edits in Setup propagate without a redeploy.
 * - 403s are parsed: REQUEST_LIMIT_EXCEEDED → CrmRateLimitError, anything else
 *   is a permissions gap on the integration user (NOT an auth error).
 */
import type {
  ActivityEntry,
  AggregateBucket,
  AggregateQuery,
  CrmFieldValue,
  CrmRecord,
  CrmTask,
  FieldDescribe,
  FieldFilter,
  FieldPatch,
  FieldType,
  FlowDefinitionJson,
  FlowSummary,
  FlowTableRow,
  QuickActionDescribeJson,
  QuickActionExecuteResult,
  QuickActionSummary,
  ObjectDescribe,
  ObjectSummary,
  RelationshipDescribe,
  RecentRecord,
  RecordPage,
  RelatedListConfig,
  RuleSummary,
  SavedView,
  SearchQuery,
  TaskPage,
} from "@cardstack/core";
import {
  CrmAuthError,
  CrmObjectNotFoundError,
  CrmRateLimitError,
  CrmRecordNotFoundError,
  CrmValidationError,
  type CrmAdapter,
  type PortalInfo,
} from "../adapter.js";

export interface SalesforceCredentials {
  /** Absent = legacy client credentials for pre-OAuth config files. */
  authType?: "client_credentials" | "oauth" | "oauth_pending";
  /** e.g. https://mydomain.my.salesforce.com. Returned by OAuth token exchange. */
  instanceUrl?: string;
  /** e.g. https://login.salesforce.com or https://test.salesforce.com */
  loginUrl?: string;
  clientId: string;
  clientSecret: string;
  /** OAuth web-server flow refresh token. */
  refreshToken?: string;
  /** Optional warm access token from a fresh OAuth callback. */
  accessToken?: string;
  redirectUri?: string;
  identityUrl?: string;
  issuedAt?: string;
  scope?: string;
  tokenType?: string;
}

type FetchLike = typeof fetch;

const API = "/services/data/v61.0";
const DEFAULT_LOGIN_URL = "https://login.salesforce.com";
const FLOW_DEF_TTL_MS = 60_000;

// Standard business objects surfaced first in the object picker; every other
// layoutable object (including ALL custom objects) follows alphabetically.
const COMMON_OBJECT_ORDER = ["Account", "Contact", "Opportunity", "Lead", "Case", "Campaign"];

// System / audit / internal sObjects that are never useful as a card or a
// related list (Shares, Histories, Feeds, platform events, metadata types, …).
const SYSTEM_SOBJECT =
  /(Share|History|Feed|ChangeEvent|Tag)$|__(mdt|e|b|x|p|ka|kav|Share|History|Feed|Tag|ChangeEvent)$/;

// Object / field API-name shape — guards SOQL identifiers that can't be quoted.
const SF_API_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const SF_COLUMN = /^[A-Za-z][A-Za-z0-9_.]*$/; // allows Parent.Field traversal

interface SfGlobalSObject {
  name: string;
  label: string;
  labelPlural?: string;
  custom: boolean;
  queryable: boolean;
  createable: boolean;
  deprecatedAndHidden: boolean;
}

function isLayoutableSObject(s: SfGlobalSObject): boolean {
  return s.queryable && s.createable && !s.deprecatedAndHidden && !SYSTEM_SOBJECT.test(s.name);
}

interface SfChildRelationship {
  childSObject: string;
  field: string | null;
  relationshipName: string | null;
}

function mapType(sf: { type: string }): FieldType {
  switch (sf.type) {
    case "currency":
      return "currency";
    case "percent":
      return "percent";
    case "double":
    case "int":
    case "long":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "boolean":
      return "boolean";
    case "picklist":
    case "multipicklist":
      return "picklist";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "url":
      return "url";
    case "textarea":
      return "textarea";
    case "reference":
      return "reference";
    default:
      return "string";
  }
}

const soqlEscape = (value: string): string => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
// Escape LIKE metacharacters too, so a value containing % or _ can't widen the match.
const soqlLikeEscape = (value: string): string =>
  soqlEscape(value).replace(/%/g, "\\%").replace(/_/g, "\\_");

// Only a FULL-string ISO date/datetime is emitted unquoted — a partial match like
// "2024-01-01 OR Amount > 0" must be quoted, or it splices raw SOQL (injection).
const ISO_DATE_LITERAL = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

function soqlLiteral(value: CrmFieldValue | undefined, type?: FieldType): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if ((type === "date" || type === "datetime") && ISO_DATE_LITERAL.test(value)) return value;
  if (ISO_DATE_LITERAL.test(value)) return value;
  return `'${soqlEscape(value)}'`;
}

/** Everything after `FROM <object>` in a listview describe's SOQL (USING SCOPE
 *  + WHERE + ORDER BY), minus any trailing LIMIT — or null when the query is
 *  missing/unparseable so the caller can fall back to the /results endpoint. */
function soqlFromTail(query: string | undefined, objectApi: string): string | null {
  if (!query) return null;
  const m = new RegExp(`\\bFROM\\s+${objectApi}\\b`, "i").exec(query);
  if (!m) return null;
  return query
    .slice(m.index + m[0].length)
    .replace(/\s+LIMIT\s+\d+\s*$/i, "")
    .replace(/\s+$/, "");
}

interface SfDescribeField {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  defaultedOnCreate: boolean;
  inlineHelpText?: string | null;
  picklistValues?: { value: string; label?: string; active: boolean }[];
  /** For reference fields: the relationship to traverse for `.Name` (Owner, Account, Foo__r). */
  relationshipName?: string | null;
  /** For reference fields: target sObject(s). */
  referenceTo?: string[];
}

// Entities we KNOW carry a queryable Name — single-target `.Name` traversal is
// only emitted for these (plus custom objects, which always have Name). System
// targets like OpportunityHistory have no Name; one such column
// MALFORMED_QUERYs the whole SELECT (seen live via LastAmountChangedHistory.Name).
// POLYMORPHIC fields (referenceTo.length > 1, e.g. OwnerId, WhoId, WhatId) are
// always traversable: they resolve to the Name pseudo-object, which carries
// queryable Name AND Type regardless of the concrete targets.
const NAME_BEARING_TARGETS = new Set([
  "User", "Group", "Account", "Contact", "Opportunity", "Lead", "Campaign",
  "Product2", "Pricebook2", "Asset", "RecordType",
]);

function canTraverseName(f: SfDescribeField): boolean {
  const targets = f.referenceTo ?? [];
  if (targets.length > 1) return true; // polymorphic → Name pseudo-object
  return (
    targets.length === 1 &&
    targets.every((t) => t.endsWith("__c") || NAME_BEARING_TARGETS.has(t))
  );
}

/** Everything the adapter needs to resolve + drill a reference field. */
interface RefFieldInfo {
  /** Relationship to traverse for `.Name` (Owner, Account, Foo__r) — null when
   *  traversal is unsafe/unknown; the field then displays its raw id. */
  rel: string | null;
  /** Target sObject(s) from describe. Length > 1 = polymorphic. */
  targets: string[];
}

// Convention fallback when describe omits relationshipName — custom fields ONLY
// (Foo__c→Foo__r is a hard Salesforce naming rule). For standard fields a null
// relationshipName means traversal is NOT supported; guessing (ContactId→Contact
// on Opportunity) produces one bad token that MALFORMED_QUERYs the whole SELECT.
function deriveRelationshipName(fieldApi: string): string | null {
  if (fieldApi.endsWith("__c")) return `${fieldApi.slice(0, -3)}__r`;
  return null;
}

interface SfDescribeResponse {
  name: string;
  label: string;
  labelPlural?: string;
  custom: boolean;
  fields: SfDescribeField[];
  childRelationships?: SfChildRelationship[];
}

const DESCRIBE_TTL_MS = 10 * 60 * 1000;

interface SalesforceTokenResponse {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  id?: string;
  issued_at?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

// SSRF guard: the login URL becomes the host we POST client_id + client_secret
// to during token exchange, so it must be a Salesforce-owned domain and never a
// caller-chosen host. Allow only the two generic login endpoints and My Domain
// (`*.my.salesforce.com`, which also covers sandbox `*.sandbox.my.salesforce.com`).
function isAllowedSalesforceHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "login.salesforce.com" ||
    host === "test.salesforce.com" ||
    host.endsWith(".my.salesforce.com")
  );
}

export function normalizeSalesforceLoginUrl(input?: string): string {
  const trimmed = (input || DEFAULT_LOGIN_URL).trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(trimmed)) {
    throw new Error("Salesforce login URL must start with https://");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Salesforce login URL is not a valid URL.");
  }
  if (!isAllowedSalesforceHost(url.hostname)) {
    throw new Error(
      "Salesforce login URL must be login.salesforce.com, test.salesforce.com, or your My Domain (*.my.salesforce.com).",
    );
  }
  return trimmed;
}

export function salesforceUsesOAuth(credentials?: Record<string, string>): boolean {
  return credentials?.authType === "oauth" || !!credentials?.refreshToken;
}

export function buildSalesforceAuthorizationUrl(args: {
  loginUrl?: string;
  clientId: string;
  redirectUri: string;
  state: string;
  /** PKCE S256 challenge (base64url of SHA-256(codeVerifier)). */
  codeChallenge?: string;
}): string {
  const url = new URL(`${normalizeSalesforceLoginUrl(args.loginUrl)}/services/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("scope", "api refresh_token");
  url.searchParams.set("state", args.state);
  if (args.codeChallenge) {
    url.searchParams.set("code_challenge", args.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

async function postToken(
  fetchImpl: FetchLike,
  loginUrl: string | undefined,
  params: Record<string, string>,
): Promise<SalesforceTokenResponse> {
  const res = await fetchImpl(`${normalizeSalesforceLoginUrl(loginUrl)}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as SalesforceTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new CrmAuthError(
      "Salesforce",
      data.error_description || data.error || "Salesforce OAuth token exchange failed.",
    );
  }
  return data;
}

export async function exchangeSalesforceAuthorizationCode(
  args: {
    loginUrl?: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    /** PKCE verifier matching the code_challenge sent on the authorize URL. */
    codeVerifier?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<SalesforceCredentials> {
  const loginUrl = normalizeSalesforceLoginUrl(args.loginUrl);
  const data = await postToken(fetchImpl, loginUrl, {
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
  });
  if (!data.refresh_token) {
    throw new CrmAuthError(
      "Salesforce",
      "Salesforce did not return a refresh token. Add the refresh_token/offline_access OAuth scope and authorize again.",
    );
  }
  if (!data.instance_url) {
    throw new CrmAuthError("Salesforce", "Salesforce OAuth response did not include an instance URL.");
  }
  return {
    authType: "oauth",
    loginUrl,
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    instanceUrl: data.instance_url,
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    ...(data.id ? { identityUrl: data.id } : {}),
    ...(data.issued_at ? { issuedAt: data.issued_at } : {}),
    ...(data.scope ? { scope: data.scope } : {}),
    ...(data.token_type ? { tokenType: data.token_type } : {}),
  };
}

export class SalesforceAdapter implements CrmAdapter {
  private token: string | null = null;
  private instanceUrl: string | null = null;
  private describeCache = new Map<string, { describe: ObjectDescribe; fetchedAt: number }>();
  /** Per object: reference field api → traversal + target info (all reference fields). */
  private refCache = new Map<string, Map<string, RefFieldInfo>>();
  /** Global sObject list (from /sobjects), fetched once: the object picker + the
   *  label/layoutable lookups relationships need. */
  private globalCache: {
    objects: ObjectSummary[];
    byApi: Map<string, ObjectSummary>;
    layoutable: Set<string>;
  } | null = null;
  private viewObjectById = new Map<string, string>();
  /** Flow definitions memoized per api name — an interview re-resolves one every step. */
  private flowDefCache = new Map<string, { def: FlowDefinitionJson; at: number }>();
  private quickActionCache = new Map<string, { describe: QuickActionDescribeJson; at: number }>();
  /** Opportunity stage ApiName → IsClosed, fetched once. */
  private closedStageValues: string[] | null = null;
  /** Org facts (IsSandbox, default currency), fetched once. */
  private orgInfo: { isSandbox: boolean; currency: string | null } | null = null;
  /** Task's closed-status ApiName, resolved lazily (orgs rename the picklist). */
  private closedTaskStatus: string | null = null;

  private now(): number {
    return Date.now();
  }

  private async ensureOrgInfo(): Promise<{ isSandbox: boolean; currency: string | null }> {
    if (this.orgInfo) return this.orgInfo;
    try {
      const { records } = await this.soql<{ IsSandbox: boolean; DefaultCurrencyIsoCode?: string }>(
        "SELECT IsSandbox, DefaultCurrencyIsoCode FROM Organization LIMIT 1",
      );
      const org = records[0];
      this.orgInfo = {
        isSandbox: org?.IsSandbox ?? false,
        currency: org?.DefaultCurrencyIsoCode ?? null,
      };
    } catch {
      this.orgInfo = { isSandbox: false, currency: null };
    }
    return this.orgInfo;
  }

  private async ensureClosedStageValues(): Promise<string[]> {
    if (this.closedStageValues) return this.closedStageValues;
    try {
      const { records } = await this.soql<{ ApiName?: string; MasterLabel: string; IsClosed: boolean }>(
        "SELECT ApiName, MasterLabel, IsClosed FROM OpportunityStage WHERE IsClosed = true",
      );
      this.closedStageValues = records.map((r) => r.ApiName ?? r.MasterLabel);
    } catch {
      this.closedStageValues = [];
    }
    return this.closedStageValues;
  }

  /** Mutable so a ROTATED refresh token (Salesforce rotation policy) is used on
   *  the next refresh and can be persisted via onRefresh. */
  private refreshToken: string | null;

  /** In-flight token grant shared by concurrent callers (single-flight). */
  private tokenGrant: Promise<string> | null = null;

  constructor(
    private readonly credentials: SalesforceCredentials,
    private readonly fetchImpl: FetchLike = fetch,
    /**
     * Called after a successful OAuth refresh with the updated credentials
     * (new access token, and — critically for rotation-enabled orgs — the new
     * refresh token). The caller persists these so the connection survives past
     * the first refresh. Awaited (with one retry) before the grant resolves —
     * under rotation, losing this write strands a dead token in the store —
     * but persist failures are logged, never thrown.
     */
    private readonly onRefresh?: (credentials: SalesforceCredentials) => void | Promise<void>,
    /**
     * Re-read the LATEST persisted credentials. Another process (Studio and the
     * MCP server each cache adapters) may have rotated the token and stored the
     * replacement; when our in-memory refresh token is rejected, this is the
     * one-shot fallback before declaring the connection dead.
     */
    private readonly getFreshCredentials?: () => Promise<SalesforceCredentials | null>,
  ) {
    this.token = credentials.accessToken ?? null;
    this.instanceUrl = credentials.instanceUrl ?? null;
    this.refreshToken = credentials.refreshToken ?? null;
  }

  private get base(): string {
    const base = (this.instanceUrl ?? this.credentials.instanceUrl)?.replace(/\/$/, "");
    if (!base) {
      throw new CrmAuthError("Salesforce", "Salesforce connection is missing an instance URL.");
    }
    return base;
  }

  private fetchToken(): Promise<string> {
    // Single-flight: concurrent cold calls share ONE grant. Parallel refreshes
    // would replay the same refresh token, and under Salesforce's rotation
    // policy the replay is reuse-detected and revokes the whole token family.
    this.tokenGrant ??= this.grantToken().finally(() => {
      this.tokenGrant = null;
    });
    return this.tokenGrant;
  }

  private postRefresh(refreshToken: string): Promise<SalesforceTokenResponse> {
    return postToken(this.fetchImpl, this.credentials.loginUrl, {
      grant_type: "refresh_token",
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: refreshToken,
    });
  }

  private async grantToken(): Promise<string> {
    if (salesforceUsesOAuth(this.credentials as unknown as Record<string, string>)) {
      if (!this.refreshToken) {
        throw new CrmAuthError("Salesforce", "Salesforce authorization is missing a refresh token.");
      }
      let data: SalesforceTokenResponse;
      try {
        data = await this.postRefresh(this.refreshToken);
      } catch (error) {
        // Our copy may be stale because ANOTHER process rotated the token and
        // persisted the replacement — re-read the store and retry once with
        // the persisted token before declaring the connection dead.
        const fresh =
          error instanceof CrmAuthError
            ? await this.getFreshCredentials?.().catch(() => null)
            : null;
        const freshToken = fresh?.refreshToken;
        if (!freshToken || freshToken === this.refreshToken) throw error;
        this.refreshToken = freshToken;
        data = await this.postRefresh(freshToken);
      }
      this.token = data.access_token!;
      this.instanceUrl = data.instance_url ?? this.instanceUrl ?? this.credentials.instanceUrl ?? null;
      // Rotation policy issues a NEW refresh token and invalidates the old one.
      // Keep using it in-process, and persist so the NEXT cold adapter doesn't
      // refresh with the now-dead token.
      if (data.refresh_token) this.refreshToken = data.refresh_token;
      const rotated: SalesforceCredentials = {
        ...this.credentials,
        accessToken: this.token,
        refreshToken: this.refreshToken,
        ...(this.instanceUrl ? { instanceUrl: this.instanceUrl } : {}),
      };
      try {
        await this.onRefresh?.(rotated);
      } catch {
        try {
          await this.onRefresh?.(rotated);
        } catch (persistError) {
          console.error("Failed to persist rotated Salesforce credentials:", persistError);
        }
      }
      return this.token;
    }

    const res = await this.fetchImpl(`${this.base}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new CrmAuthError("Salesforce");
    const data = (await res.json()) as { access_token: string };
    this.token = data.access_token;
    return this.token;
  }

  private async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const token = this.token ?? (await this.fetchToken());
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      // A hung request must fail visibly, not spin a loading screen forever.
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 && !retried) {
      // Only invalidate the token WE used — a concurrent caller may already
      // have refreshed, and clobbering its fresh token forces a second
      // (rotation-burning) grant.
      if (this.token === token) this.token = null;
      return this.request(method, path, body, true);
    }
    if (res.status === 401) throw new CrmAuthError("Salesforce");
    if (res.status === 404) throw new CrmRecordNotFoundError("salesforce resource", path);
    if (!res.ok) {
      const errors = (await res.json().catch(() => [])) as {
        message?: string;
        errorCode?: string;
        fields?: string[];
      }[];
      const first = Array.isArray(errors) ? errors[0] : undefined;
      // A 403 is NOT always expired auth: an exhausted API budget and an FLS gap
      // both 403. Never render either as "reconnect" — the fixes differ.
      if (res.status === 403) {
        if (first?.errorCode === "REQUEST_LIMIT_EXCEEDED") {
          throw new CrmRateLimitError("Salesforce", first.message);
        }
        throw new Error(
          `Salesforce denied ${method} ${path} (403) — a permissions gap on the integration user` +
            `${first?.message ? `: ${first.message}` : "; check its object/field access."}`,
        );
      }
      if (res.status === 400 && first?.message) {
        throw new CrmValidationError(first.message, first.fields?.[0]);
      }
      throw new Error(`Salesforce ${method} ${path} failed (${res.status}): ${first?.message ?? ""}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async soql<T>(query: string): Promise<{ totalSize: number; records: T[] }> {
    return this.request("GET", `${API}/query?q=${encodeURIComponent(query)}`);
  }

  /** All layoutable sObjects (standard + custom) from the org's global describe. */
  private async ensureGlobal(): Promise<{
    objects: ObjectSummary[];
    byApi: Map<string, ObjectSummary>;
    layoutable: Set<string>;
  }> {
    if (this.globalCache) return this.globalCache;
    const data = await this.request<{ sobjects: SfGlobalSObject[] }>("GET", `${API}/sobjects`);
    const byApi = new Map<string, ObjectSummary>();
    const layoutable = new Set<string>();
    const objects: ObjectSummary[] = [];
    for (const s of data.sobjects) {
      const summary: ObjectSummary = {
        api: s.name,
        label: s.label,
        labelPlural: s.labelPlural || s.label,
        custom: s.custom,
      };
      byApi.set(s.name, summary);
      if (isLayoutableSObject(s)) {
        layoutable.add(s.name);
        objects.push(summary);
      }
    }
    const rank = (api: string) => {
      const i = COMMON_OBJECT_ORDER.indexOf(api);
      return i === -1 ? COMMON_OBJECT_ORDER.length : i;
    };
    objects.sort((a, b) => rank(a.api) - rank(b.api) || a.labelPlural.localeCompare(b.labelPlural));
    this.globalCache = { objects, byApi, layoutable };
    return this.globalCache;
  }

  /** Map Salesforce childRelationships → related-list descriptors. `api` is the
   *  child's foreign-key FIELD (what getRelated queries by); system/audit child
   *  objects are filtered out. */
  private buildRelationships(
    children: SfChildRelationship[],
    global: { byApi: Map<string, ObjectSummary>; layoutable: Set<string> } | null,
  ): RelationshipDescribe[] {
    const seen = new Set<string>();
    const out: RelationshipDescribe[] = [];
    for (const c of children) {
      // relationshipName is the UNIQUE id (many children share a FK like
      // AccountId); the FK field is carried separately for the query.
      if (!c.field || !c.childSObject || !c.relationshipName) continue;
      // Only real business children; if global describe is unavailable, keep all.
      if (global && !global.layoutable.has(c.childSObject)) continue;
      if (seen.has(c.relationshipName)) continue;
      seen.add(c.relationshipName);
      out.push({
        api: c.relationshipName,
        label: global?.byApi.get(c.childSObject)?.labelPlural ?? c.childSObject,
        relatedObject: c.childSObject,
        foreignKey: c.field,
      });
      if (out.length >= 25) break;
    }
    return out;
  }

  async listObjects(): Promise<ObjectSummary[]> {
    return (await this.ensureGlobal()).objects;
  }

  async describeObject(objectApi: string): Promise<ObjectDescribe> {
    if (!SF_API_NAME.test(objectApi)) throw new CrmObjectNotFoundError(objectApi);
    const cached = this.describeCache.get(objectApi);
    // TTL so an FLS/picklist change in Setup propagates without a redeploy.
    if (cached && this.now() - cached.fetchedAt < DESCRIBE_TTL_MS) return cached.describe;
    const data = await this.request<SfDescribeResponse>(
      "GET",
      `${API}/sobjects/${objectApi}/describe`,
    ).catch((err) => {
      if (err instanceof CrmRecordNotFoundError || err instanceof CrmObjectNotFoundError) {
        throw new CrmObjectNotFoundError(objectApi);
      }
      throw err;
    });
    const currency = (await this.ensureOrgInfo()).currency ?? "USD";
    const closedStages = objectApi === "Opportunity" ? await this.ensureClosedStageValues() : [];
    const has = (api: string) => data.fields.some((f) => f.name === api);
    const fields: FieldDescribe[] = data.fields
      .filter((f) => f.type !== "address" && f.type !== "location")
      .map((f) => {
        const active = (f.picklistValues ?? []).filter((v) => v.active);
        const valueLabels = Object.fromEntries(
          active
            .filter((v) => v.label && v.label !== v.value)
            .map((v): [string, string] => [v.value, v.label!]),
        );
        return {
          api: f.name,
          // Reference values render as resolved names, so "Owner ID" reads
          // wrong as a column header — present the label without the suffix.
          label: f.type === "reference" ? f.label.replace(/\s+ID$/i, "") : f.label,
          type: mapType(f),
          required: !f.nillable && f.createable && !f.defaultedOnCreate,
          readOnly: !f.updateable,
          ...(f.inlineHelpText ? { description: f.inlineHelpText } : {}),
          ...(active.length > 0 ? { values: active.map((v) => v.value) } : {}),
          ...(Object.keys(valueLabels).length > 0 ? { valueLabels } : {}),
          ...(f.type === "currency" ? { currencyCode: currency } : {}),
          ...(f.name === "StageName" && closedStages.length > 0 ? { closedValues: closedStages } : {}),
          ...(f.type === "reference" && f.referenceTo?.length ? { referenceTo: f.referenceTo } : {}),
        };
      });
    // Global describe gives child-object labels + filters out system children;
    // best-effort so a describe still works if the global call is unavailable.
    const global = await this.ensureGlobal().catch(() => null);
    const describe: ObjectDescribe = {
      api: data.name,
      label: data.label,
      labelPlural: data.labelPlural || data.label,
      custom: !!data.custom,
      fields,
      relationships: this.buildRelationships(data.childRelationships ?? [], global),
      // Semantic hints so the server builds filters from concepts, not literals.
      ...(has("StageName") ? { stageField: "StageName" } : {}),
      ...(has("Amount") ? { amountField: "Amount" } : {}),
      ...(has("OwnerId") ? { ownerField: "OwnerId" } : {}),
      ...(has("CloseDate") ? { closeDateField: "CloseDate" } : {}),
    };
    this.describeCache.set(objectApi, { describe, fetchedAt: this.now() });
    // EVERY reference field gets an entry — traversable ones carry the
    // relationship for `.Name`; the rest keep rel:null so the raw id still
    // ships as a drill-through ref instead of dead text.
    const refs = new Map<string, RefFieldInfo>();
    for (const f of data.fields) {
      if (f.type !== "reference" || !f.referenceTo?.length) continue;
      const rel = canTraverseName(f)
        ? (f.relationshipName ?? deriveRelationshipName(f.name))
        : null;
      refs.set(f.name, { rel, targets: f.referenceTo });
    }
    this.refCache.set(objectApi, refs);
    return describe;
  }

  /** Reference-field info map for an object (describes if not cached). */
  private async refFields(objectApi: string): Promise<Map<string, RefFieldInfo>> {
    if (!this.refCache.has(objectApi)) await this.describeObject(objectApi).catch(() => undefined);
    return this.refCache.get(objectApi) ?? new Map();
  }

  /** Expand a requested column into itself + `Relationship.Name` when it's a
   *  traversable reference, so an id displays as the related record's name.
   *  Polymorphic refs also fetch `.Type` — the concrete target object, so the
   *  widget knows which card a drill-through opens. (`.Type` is only queryable
   *  on the polymorphic Name pseudo-object; on a concrete target it would
   *  collide with real fields like Account.Type.) */
  private refColumns(column: string, refs: Map<string, RefFieldInfo>): string[] {
    const info = refs.get(column);
    if (!info?.rel) return [column];
    return info.targets.length > 1
      ? [column, `${info.rel}.Name`, `${info.rel}.Type`]
      : [column, `${info.rel}.Name`];
  }

  private nameField(objectApi: string): string {
    return objectApi === "Case" ? "CaseNumber" : "Name";
  }

  private recordFromSObject(
    raw: Record<string, unknown>,
    refs?: Map<string, RefFieldInfo>,
  ): CrmRecord {
    const fields: Record<string, CrmFieldValue> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "attributes" || key === "Id") continue;
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        fields[key] = value as CrmFieldValue;
      }
    }
    // Replace a reference id with the related record's Name (Owner.Name →
    // OwnerId) — keeping the id in `refs` so the widget can drill through.
    // Non-traversable references keep the raw id as display but STILL ship the
    // ref id + target, so they're clickable instead of dead text.
    const refIds: Record<string, string> = {};
    const refObjects: Record<string, string> = {};
    if (refs) {
      for (const [fieldApi, info] of refs) {
        const rawId = raw[fieldApi];
        if (typeof rawId !== "string" || !rawId) continue;
        refIds[fieldApi] = rawId;
        const nested = info.rel
          ? (raw[info.rel] as { Name?: unknown; Type?: unknown } | null | undefined)
          : undefined;
        if (nested && typeof nested === "object" && typeof nested.Name === "string") {
          fields[fieldApi] = nested.Name;
        }
        // Concrete target: unambiguous from describe, or resolved via `.Type`.
        const target =
          info.targets.length === 1
            ? info.targets[0]
            : nested && typeof nested === "object" && typeof nested.Type === "string"
              ? nested.Type
              : undefined;
        if (target) refObjects[fieldApi] = target;
      }
    }
    return {
      id: String(raw.Id ?? ""),
      fields,
      ...(Object.keys(refIds).length > 0 ? { refs: refIds } : {}),
      ...(Object.keys(refObjects).length > 0 ? { refObjects } : {}),
    };
  }

  /** SELECT columns for an object, with reference fields expanded to
   *  `Relationship.Name` so ids display as names. Shared by search() and
   *  getViewRows() so both paths return identical shapes. When `requested`
   *  is provided (the layout's columns), the fetch is restricted to it —
   *  selecting the full field list drags in system references (e.g.
   *  LastAmountChangedHistoryId) that can break the whole query. */
  private selectColumns(
    objectApi: string,
    describe: ObjectDescribe,
    refs: Map<string, RefFieldInfo>,
    requested?: string[],
  ): Set<string> {
    const byApi = new Map(describe.fields.map((f) => [f.api, f]));
    const wanted = requested?.length
      ? requested.filter((c) => byApi.has(c))
      : describe.fields.map((f) => f.api);
    const selectCols = new Set<string>(["Id", this.nameField(objectApi)]);
    for (const api of wanted) {
      if (api === "Id") continue;
      if (byApi.get(api)?.type === "reference")
        for (const c of this.refColumns(api, refs)) selectCols.add(c);
      else selectCols.add(api);
    }
    return selectCols;
  }

  /** WHERE builder shared by search() and aggregate(). Rejects filter fields
   *  not on the object — blocks MALFORMED_QUERY and stops a prompt-injected
   *  model probing denied fields through the WHERE clause. */
  private whereClause(
    objectApi: string,
    describe: ObjectDescribe,
    query: { text?: string; filters?: FieldFilter[] },
  ): string {
    const typeOf = (api: string) => describe.fields.find((f) => f.api === api)?.type;
    const known = new Set(describe.fields.map((f) => f.api));
    const requireField = (api: string) => {
      if (!known.has(api)) throw new CrmValidationError(`Unknown field "${api}" on ${objectApi}.`);
    };
    const clauses: string[] = [];
    if (query.text) {
      clauses.push(`${this.nameField(objectApi)} LIKE '%${soqlLikeEscape(query.text)}%'`);
    }
    for (const f of query.filters ?? []) {
      requireField(f.field);
      const literal = soqlLiteral(f.value, typeOf(f.field));
      switch (f.op) {
        case "eq":
          clauses.push(`${f.field} = ${literal}`);
          break;
        case "neq":
          clauses.push(`${f.field} != ${literal}`);
          break;
        case "contains":
          clauses.push(`${f.field} LIKE '%${soqlLikeEscape(String(f.value ?? ""))}%'`);
          break;
        case "in":
        case "not_in": {
          const list = (f.values ?? []).map((v) => soqlLiteral(v, typeOf(f.field))).join(", ");
          clauses.push(`${f.field} ${f.op === "in" ? "IN" : "NOT IN"} (${list})`);
          break;
        }
        case "is_empty":
          clauses.push(`${f.field} = null`);
          break;
        case "not_empty":
          clauses.push(`${f.field} != null`);
          break;
        default:
          clauses.push(`${f.field} ${{ gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op]} ${literal}`);
      }
    }
    return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  }

  /** Aggregate SOQL — the whole point is that totals never depend on paging
   *  rows into the model's context. */
  async aggregate(objectApi: string, q: AggregateQuery): Promise<AggregateBucket[]> {
    const describe = await this.describeObject(objectApi);
    const known = new Set(describe.fields.map((f) => f.api));
    for (const api of [q.groupBy, q.sumField]) {
      if (api && !known.has(api)) {
        throw new CrmValidationError(`Unknown field "${api}" on ${objectApi}.`);
      }
    }
    const where = this.whereClause(objectApi, describe, {
      ...(q.filters ? { filters: q.filters } : {}),
    });
    const select = [
      ...(q.groupBy ? [q.groupBy] : []),
      "COUNT(Id) cnt",
      ...(q.sumField ? [`SUM(${q.sumField}) total`] : []),
    ].join(", ");
    const group = q.groupBy ? ` GROUP BY ${q.groupBy} ORDER BY COUNT(Id) DESC` : "";
    const { records } = await this.soql<Record<string, unknown>>(
      `SELECT ${select} FROM ${objectApi}${where}${group} LIMIT 200`,
    );
    return records.map((r) => ({
      group: q.groupBy ? ((r[q.groupBy] as string | null) ?? null) : null,
      count: Number(r.cnt ?? 0),
      ...(q.sumField ? { sum: r.total == null ? null : Number(r.total) } : {}),
    }));
  }

  async search(objectApi: string, query: SearchQuery): Promise<RecordPage> {
    const describe = await this.describeObject(objectApi);
    const typeOf = (api: string) => describe.fields.find((f) => f.api === api)?.type;
    const refs = await this.refFields(objectApi);
    const selectCols = this.selectColumns(objectApi, describe, refs, query.columns);
    const where = this.whereClause(objectApi, describe, query);
    if (query.sort && !describe.fields.some((f) => f.api === query.sort!.field)) {
      throw new CrmValidationError(`Unknown field "${query.sort.field}" on ${objectApi}.`);
    }
    const order = query.sort ? ` ORDER BY ${query.sort.field} ${query.sort.dir.toUpperCase()} NULLS LAST` : "";
    const limit = query.limit ?? 10;
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const soql = `SELECT ${[...selectCols].join(", ")} FROM ${objectApi}${where}${order} LIMIT ${limit} OFFSET ${offset}`;
    const [page, count] = await Promise.all([
      this.soql<Record<string, unknown>>(soql),
      this.soql<never>(`SELECT COUNT() FROM ${objectApi}${where}`),
    ]);
    const total = count.totalSize;
    return {
      rows: page.records.map((r) => this.recordFromSObject(r, refs)),
      total,
      hasMore: offset + limit < total,
      ...(offset + limit < total ? { cursor: String(offset + limit) } : {}),
    };
  }

  async getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord> {
    const describe = await this.describeObject(objectApi);
    const refs = await this.refFields(objectApi);
    const wanted =
      fields.length > 0
        ? fields
        : describe.fields.filter((f) => f.type !== "reference").map((f) => f.api);
    // Expand reference fields to also fetch the related Name (the retrieve
    // endpoint supports Owner.Name traversal).
    const cols = new Set<string>(["Id"]);
    for (const f of wanted) {
      if (f === "Id") continue;
      for (const c of this.refColumns(f, refs)) cols.add(c);
    }
    const raw = await this.request<Record<string, unknown>>(
      "GET",
      `${API}/sobjects/${objectApi}/${id}?fields=${encodeURIComponent([...cols].join(","))}`,
    );
    return this.recordFromSObject(raw, refs);
  }

  async getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage> {
    // `rel.object` is the child sObject; `rel.foreignKey` is the FK field on it
    // that points back to this record (falls back to `relationship` for older
    // configs). Both are SOQL identifiers that can't be quoted — validate shape.
    const fk = rel.foreignKey ?? rel.relationship;
    if (!SF_API_NAME.test(rel.object) || !SF_API_NAME.test(fk)) {
      return { rows: [], hasMore: false, total: 0 };
    }
    const refs = await this.refFields(rel.object).catch(() => new Map<string, RefFieldInfo>());
    const cols = new Set<string>(["Id"]);
    for (const c of rel.columns) {
      // Skip the FK back to the parent: it's the record the card already
      // shows, repeated on every row (rendered live as a whole column of
      // the parent's own name).
      if (c === "Id" || c === fk || !SF_COLUMN.test(c)) continue;
      for (const x of this.refColumns(c, refs)) cols.add(x);
    }
    const { records, totalSize } = await this.soql<Record<string, unknown>>(
      `SELECT ${[...cols].join(", ")} FROM ${rel.object} WHERE ${fk} = '${soqlEscape(parentId)}' LIMIT ${rel.limit}`,
    ).catch(() => ({ records: [] as Record<string, unknown>[], totalSize: 0 }));
    return {
      rows: records.map((r) => this.recordFromSObject(r, refs)),
      hasMore: totalSize > rel.limit,
      total: totalSize,
    };
  }

  /** Recent field changes (from the object's history entity, when tracking is
   *  on) merged with recent tasks. Each source degrades to [] on its own —
   *  orgs without history tracking still get tasks, and vice versa. */
  /** Lightning deep link — "View in Salesforce" on the record card. */
  recordUrl(objectApi: string, id: string): string | undefined {
    const base = (this.instanceUrl ?? this.credentials.instanceUrl)?.replace(/\/$/, "");
    if (!base || !SF_API_NAME.test(objectApi) || !/^[a-zA-Z0-9]{15,18}$/.test(id)) return undefined;
    return `${base}/lightning/r/${objectApi}/${id}/view`;
  }

  async getActivity(objectApi: string, id: string, limit: number): Promise<ActivityEntry[]> {
    const describe = await this.describeObject(objectApi).catch(() => null);
    const labelOf = (api: string) =>
      describe?.fields.find((f) => f.api === api)?.label ?? api;
    // History entity naming: Opportunity→OpportunityFieldHistory (special),
    // Foo__c→Foo__History (FK ParentId), else {Object}History (FK {Object}Id).
    const custom = objectApi.endsWith("__c");
    const historyEntity =
      objectApi === "Opportunity"
        ? "OpportunityFieldHistory"
        : custom
          ? objectApi.replace(/__c$/, "__History")
          : `${objectApi}History`;
    const historyFk = custom ? "ParentId" : `${objectApi}Id`;
    const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "(empty)" : String(v));

    const changes = this.soql<{
      Id: string;
      Field: string;
      OldValue: unknown;
      NewValue: unknown;
      CreatedDate: string;
      CreatedBy: { Name?: string } | null;
    }>(
      `SELECT Id, Field, OldValue, NewValue, CreatedDate, CreatedBy.Name FROM ${historyEntity} ` +
        `WHERE ${historyFk} = '${soqlEscape(id)}' ORDER BY CreatedDate DESC LIMIT ${limit}`,
    )
      .then(({ records }) =>
        records.map((h): ActivityEntry => {
          const by = h.CreatedBy?.Name ? ` — ${h.CreatedBy.Name}` : "";
          const summary =
            h.Field === "created"
              ? `Created${by}`
              : `${labelOf(h.Field)}: ${fmt(h.OldValue)} → ${fmt(h.NewValue)}${by}`;
          return { id: h.Id, kind: "update", summary, timestamp: h.CreatedDate };
        }),
      )
      .catch(() => [] as ActivityEntry[]);

    const tasks = this.soql<{
      Id: string;
      Subject: string | null;
      Status: string | null;
      TaskSubtype: string | null;
      ActivityDate: string | null;
      CreatedDate: string;
    }>(
      `SELECT Id, Subject, Status, TaskSubtype, ActivityDate, CreatedDate FROM Task ` +
        `WHERE WhatId = '${soqlEscape(id)}' ORDER BY CreatedDate DESC LIMIT ${limit}`,
    )
      .then(({ records }) =>
        records.map((t): ActivityEntry => {
          const kind: ActivityEntry["kind"] =
            t.TaskSubtype === "Call" ? "call" : t.TaskSubtype === "Email" ? "email" : "task";
          const status = t.Status ? ` (${t.Status})` : "";
          return {
            id: t.Id,
            kind,
            summary: `${t.Subject ?? "Task"}${status}`,
            timestamp: t.ActivityDate ?? t.CreatedDate,
          };
        }),
      )
      .catch(() => [] as ActivityEntry[]);

    return (await Promise.all([changes, tasks]))
      .flat()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async updateRecord(objectApi: string, id: string, patch: FieldPatch): Promise<CrmRecord> {
    await this.request("PATCH", `${API}/sobjects/${objectApi}/${id}`, patch);
    return this.getRecord(objectApi, id, []);
  }

  async createRecord(objectApi: string, fields: FieldPatch): Promise<CrmRecord> {
    const created = await this.request<{ id: string }>("POST", `${API}/sobjects/${objectApi}`, fields);
    return this.getRecord(objectApi, created.id, []);
  }

  async listSavedViews(objectApi: string): Promise<SavedView[]> {
    const data = await this.request<{
      listviews: { id: string; label: string }[];
    }>("GET", `${API}/sobjects/${objectApi}/listviews?limit=25`);
    for (const view of data.listviews) this.viewObjectById.set(view.id, objectApi);
    return data.listviews.map((v) => ({
      id: v.id,
      object: objectApi,
      name: v.label,
      filterSummary: "Salesforce list view · filters managed in Salesforce",
      visibility: "shared" as const,
    }));
  }

  private async objectForView(viewId: string): Promise<string> {
    const cached = this.viewObjectById.get(viewId);
    if (cached) return cached;
    // Saved views are almost always on the common CRM objects; probe those to
    // resolve the view's object without fanning out across every sObject.
    for (const api of COMMON_OBJECT_ORDER) {
      await this.listSavedViews(api).catch(() => []);
      const found = this.viewObjectById.get(viewId);
      if (found) return found;
    }
    throw new CrmRecordNotFoundError("saved view", viewId);
  }

  async getViewRows(viewId: string, cursor?: string, columns?: string[]): Promise<RecordPage> {
    const objectApi = await this.objectForView(viewId);
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const limit = 25;
    // The listview describe's `query` is the executable SOQL for the view.
    // Keep its FROM-tail (USING SCOPE + WHERE + ORDER BY — the view's actual
    // semantics) but select our own columns through the same path as search(),
    // so rows come back as typed sObjects (ISO dates, numeric currency,
    // Owner.Name resolution) instead of the /results endpoint's display
    // strings ("Mon May 18 00:00:00 GMT 2026", "235000.0", raw 005… ids).
    const viewDescribe = await this.request<{ query?: string }>(
      "GET",
      `${API}/sobjects/${objectApi}/listviews/${viewId}/describe`,
    ).catch(() => ({}) as { query?: string });
    const tail = soqlFromTail(viewDescribe.query, objectApi);
    if (tail === null) return this.getViewRowsRaw(objectApi, viewId, offset, limit);

    const describe = await this.describeObject(objectApi);
    const refs = await this.refFields(objectApi);
    const cols = this.selectColumns(objectApi, describe, refs, columns);
    const soql = `SELECT ${[...cols].join(", ")} FROM ${objectApi}${tail} LIMIT ${limit} OFFSET ${offset}`;
    // COUNT() rejects ORDER BY — count against the tail without it.
    const countTail = tail.replace(/\s+ORDER\s+BY[\s\S]*$/i, "");
    const [page, count] = await Promise.all([
      this.soql<Record<string, unknown>>(soql),
      this.soql<never>(`SELECT COUNT() FROM ${objectApi}${countTail}`).catch(() => null),
    ]);
    const total = count?.totalSize;
    const hasMore = total !== undefined ? offset + limit < total : page.records.length === limit;
    return {
      rows: page.records.map((r) => this.recordFromSObject(r, refs)),
      ...(total !== undefined ? { total } : {}),
      hasMore,
      ...(hasMore ? { cursor: String(offset + limit) } : {}),
    };
  }

  /** Legacy fallback when the view describe has no usable SOQL: the /results
   *  endpoint's display values (pre-formatted strings, unresolved ids). */
  private async getViewRowsRaw(
    objectApi: string,
    viewId: string,
    offset: number,
    limit: number,
  ): Promise<RecordPage> {
    const data = await this.request<{
      done: boolean;
      records: {
        columns: { fieldNameOrPath: string; value: string | null }[];
      }[];
    }>(
      "GET",
      `${API}/sobjects/${objectApi}/listviews/${viewId}/results?limit=${limit}&offset=${offset}`,
    );
    const rows: CrmRecord[] = data.records.map((record) => {
      const fields: Record<string, CrmFieldValue> = {};
      let id = "";
      for (const col of record.columns) {
        if (col.fieldNameOrPath === "Id") id = col.value ?? "";
        else fields[col.fieldNameOrPath] = col.value;
      }
      return { id, fields };
    });
    return {
      rows,
      hasMore: !data.done && rows.length === limit,
      ...(rows.length === limit ? { cursor: String(offset + limit) } : {}),
    };
  }

  async listTasks(): Promise<TaskPage> {
    // Client-credentials runs as the integration user; its open tasks are the
    // v1 "me" scope. Per-rep scoping arrives with the three-legged flow (M7).
    const { records } = await this.soql<{
      Id: string;
      Subject: string | null;
      ActivityDate: string | null;
      What?: { Name?: string } | null;
      WhatId?: string | null;
    }>(
      "SELECT Id, Subject, ActivityDate, WhatId, What.Name FROM Task WHERE IsClosed = false ORDER BY ActivityDate ASC NULLS LAST LIMIT 20",
    );
    return {
      rows: records.map((t) => ({
        id: t.Id,
        subject: t.Subject ?? "(no subject)",
        dueDate: t.ActivityDate,
        status: "open" as const,
        ...(t.WhatId ? { relatedRecordId: t.WhatId } : {}),
        ...(t.What?.Name ? { relatedRecordName: t.What.Name } : {}),
      })),
      hasMore: false,
    };
  }

  private async ensureClosedTaskStatus(): Promise<string> {
    if (this.closedTaskStatus) return this.closedTaskStatus;
    try {
      const { records } = await this.soql<{ ApiName?: string; MasterLabel: string }>(
        "SELECT ApiName, MasterLabel FROM TaskStatus WHERE IsClosed = true ORDER BY SortOrder LIMIT 1",
      );
      this.closedTaskStatus = records[0]?.ApiName ?? records[0]?.MasterLabel ?? "Completed";
    } catch {
      this.closedTaskStatus = "Completed";
    }
    return this.closedTaskStatus;
  }

  async completeTask(id: string): Promise<CrmTask> {
    // Status is an org-customizable picklist; a hardcoded "Completed" 400s on
    // orgs that renamed it. Resolve the actual closed status first.
    const status = await this.ensureClosedTaskStatus();
    await this.request("PATCH", `${API}/sobjects/Task/${id}`, { Status: status });
    const { records } = await this.soql<{
      Id: string;
      Subject: string | null;
      ActivityDate: string | null;
    }>(`SELECT Id, Subject, ActivityDate FROM Task WHERE Id = '${soqlEscape(id)}'`);
    const task = records[0];
    if (!task) throw new CrmRecordNotFoundError("task", id);
    return { id: task.Id, subject: task.Subject ?? "(no subject)", dueDate: task.ActivityDate, status: "completed" };
  }

  async listRecentRecords(_userScope: string, limit: number): Promise<RecentRecord[]> {
    const items = await this.request<
      { Id: string; Name?: string; attributes: { type: string } }[]
    >("GET", `${API}/recent?limit=${limit}`);
    const global = await this.ensureGlobal().catch(() => null);
    return items
      .filter((i) => !global || global.layoutable.has(i.attributes.type))
      .slice(0, limit)
      .map((i) => ({
        id: i.Id,
        object: i.attributes.type,
        objectLabel: global?.byApi.get(i.attributes.type)?.label ?? i.attributes.type,
        name: i.Name ?? i.Id,
        note: "Recently viewed",
        timestamp: new Date().toISOString(),
      }));
  }

  async getValidationRules(): Promise<RuleSummary[]> {
    return []; // Tooling API needs extra perms — 3d spike
  }

  async listFlows(): Promise<FlowSummary[]> {
    // Active SCREEN flows from the org's metadata via the Tooling API. ProcessType
    // 'Flow' is the screen-flow type (autolaunched/record-triggered are excluded).
    // Requires the connected user's setup/metadata access — a 403 (no perms) or
    // any Tooling error degrades to an empty list rather than failing the page.
    try {
      // FlowDefinitionView is a REGULAR sObject (not Tooling) — querying it via
      // tooling/query fails with INVALID_TYPE and used to silently empty this list.
      const q =
        "SELECT ApiName, Label FROM FlowDefinitionView WHERE IsActive = true AND ProcessType = 'Flow' ORDER BY Label LIMIT 200";
      const { records } = await this.soql<{ ApiName?: string; Label?: string }>(q);
      const seen = new Set<string>();
      const flows: FlowSummary[] = [];
      for (const r of records ?? []) {
        if (!r.ApiName || seen.has(r.ApiName)) continue;
        seen.add(r.ApiName);
        flows.push({
          api: r.ApiName,
          label: r.Label || r.ApiName,
          screens: 0, // screen count needs the flow definition; not fetched here
          writesSummary: "Salesforce screen flow",
        });
      }
      return flows;
    } catch {
      return [];
    }
  }

  /**
   * NATIVE-rung flow definition (experimental spike): the active version's full
   * metadata JSON via the Tooling API — FlowDefinitionView resolves the active
   * version id, then the Tooling Flow record carries `Metadata`. Null on any
   * failure (no perms, inactive, not found): callers fall back to handoff.
   */
  async getFlowDefinition(flowApiName: string): Promise<FlowDefinitionJson | null> {
    if (!SF_API_NAME.test(flowApiName)) return null;
    // Definitions are immutable per version and an interview re-resolves one on
    // EVERY step — memoize briefly so a step costs interpretation, not two REST
    // round-trips. 60s TTL keeps a freshly-activated version near-live. The
    // adapter instance itself is cached per connection, so this survives across
    // requests in-process.
    const cached = this.flowDefCache.get(flowApiName);
    if (cached && Date.now() - cached.at < FLOW_DEF_TTL_MS) return cached.def;
    try {
      // FlowDefinitionView is a regular sObject; only the Flow record (with its
      // Metadata payload) lives behind the Tooling API.
      const q =
        "SELECT ActiveVersionId FROM FlowDefinitionView " +
        `WHERE ApiName = '${soqlEscape(flowApiName)}' AND IsActive = true LIMIT 1`;
      const { records } = await this.soql<{ ActiveVersionId?: string }>(q);
      const versionId = records?.[0]?.ActiveVersionId;
      if (!versionId) return null;
      const version = await this.request<{ Metadata?: FlowDefinitionJson }>(
        "GET",
        `${API}/tooling/sobjects/Flow/${encodeURIComponent(versionId)}`,
      );
      const def = version.Metadata ?? null;
      if (def) this.flowDefCache.set(flowApiName, { def, at: Date.now() });
      return def;
    } catch {
      return null;
    }
  }

  /** Generic row fetch for flow data tables / record choice sets / lookups. */
  async queryRows(
    objectApi: string,
    fields: string[],
    opts: {
      sortField?: string;
      sortOrder?: "Asc" | "Desc";
      limit?: number;
      filters?: { field: string; operator: string; value: CrmFieldValue }[];
    },
  ): Promise<FlowTableRow[]> {
    if (!SF_API_NAME.test(objectApi)) return [];
    const cols = fields.filter((f) => SF_COLUMN.test(f) && f !== "Id");
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const SOQL_OPS: Record<string, string> = {
      EqualTo: "=",
      NotEqualTo: "!=",
      GreaterThan: ">",
      GreaterThanOrEqualTo: ">=",
      LessThan: "<",
      LessThanOrEqualTo: "<=",
    };
    const where = (opts.filters ?? [])
      .filter((f) => SF_COLUMN.test(f.field) && SOQL_OPS[f.operator])
      .map((f) => `${f.field} ${SOQL_OPS[f.operator]} ${soqlLiteral(f.value)}`);
    const orderBy =
      opts.sortField && SF_COLUMN.test(opts.sortField)
        ? ` ORDER BY ${opts.sortField} ${opts.sortOrder === "Desc" ? "DESC" : "ASC"} NULLS LAST`
        : "";
    const q =
      `SELECT Id${cols.length ? ", " + cols.join(", ") : ""} FROM ${objectApi}` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      `${orderBy} LIMIT ${limit}`;
    const { records } = await this.soql<Record<string, unknown>>(q);
    return records.map((r) => {
      const cells: Record<string, CrmFieldValue> = {};
      for (const c of cols) {
        const v = r[c];
        cells[c] = v === undefined || v === null ? null : (v as CrmFieldValue);
      }
      return { id: String(r.Id ?? ""), cells };
    });
  }

  /** Quick actions available on an object (Create/Update render in chat). */
  async listQuickActions(objectApi: string): Promise<QuickActionSummary[]> {
    if (!SF_API_NAME.test(objectApi)) return [];
    try {
      const actions = await this.request<
        { name?: string; label?: string; type?: string; targetSobjectType?: string | null }[]
      >("GET", `${API}/sobjects/${objectApi}/quickActions`);
      return (actions ?? [])
        .filter((a) => a.name)
        .map((a) => ({
          api: a.name!,
          label: a.label ?? a.name!,
          type: a.type ?? "Unknown",
          targetObject: a.targetSobjectType ?? null,
        }));
    } catch {
      return [];
    }
  }

  /** Mini-layout describe for a quick action (memoized like flow definitions). */
  async describeQuickAction(actionApiName: string): Promise<QuickActionDescribeJson | null> {
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(actionApiName)) return null;
    const cached = this.quickActionCache.get(actionApiName);
    if (cached && Date.now() - cached.at < FLOW_DEF_TTL_MS) return cached.describe;
    try {
      const describe = await this.request<QuickActionDescribeJson>(
        "GET",
        `${API}/quickActions/${encodeURIComponent(actionApiName)}/describe`,
      );
      this.quickActionCache.set(actionApiName, { describe, at: Date.now() });
      return describe;
    } catch {
      return null;
    }
  }

  /** Record-contextual defaults (admin predefined values + context prefills). */
  async getQuickActionDefaults(
    actionApiName: string,
    contextRecordId: string,
  ): Promise<Record<string, CrmFieldValue>> {
    try {
      const data = await this.request<{ record?: Record<string, unknown> }>(
        "GET",
        `${API}/quickActions/${encodeURIComponent(actionApiName)}/defaultValues/${encodeURIComponent(contextRecordId)}`,
      );
      const defaults: Record<string, CrmFieldValue> = {};
      for (const [key, value] of Object.entries(data.record ?? {})) {
        if (key === "attributes" || value === undefined || value === null) continue;
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          defaults[key] = value;
        }
      }
      return defaults;
    } catch {
      return {};
    }
  }

  /** Execute the action — Salesforce runs its own validation and defaults. */
  async executeQuickAction(
    actionApiName: string,
    contextRecordId: string | null,
    fields: Record<string, CrmFieldValue>,
  ): Promise<QuickActionExecuteResult> {
    const body: Record<string, unknown> = { record: fields };
    if (contextRecordId) body.contextId = contextRecordId;
    try {
      const result = await this.request<{
        success?: boolean;
        id?: string | null;
        errors?: unknown[];
      }>("POST", `${API}/quickActions/${encodeURIComponent(actionApiName)}`, body);
      return {
        success: result.success ?? false,
        createdId: result.id ?? null,
        errors: (result.errors ?? []).map((e) => String((e as { message?: string })?.message ?? e)),
      };
    } catch (error) {
      if (error instanceof CrmValidationError) {
        return { success: false, createdId: null, errors: [error.message] };
      }
      throw error;
    }
  }

  /**
   * HANDOFF launch URL: the flow's runtime page in the connected org. Null when
   * no instance URL is known yet (unauthorized). The CRM renders the screens and
   * owns the write — Cardstack only opens the door.
   */
  getFlowLaunchUrl(flowApiName: string, params?: Record<string, string>): string | null {
    const instance = (this.instanceUrl ?? this.credentials.instanceUrl)?.replace(/\/$/, "");
    if (!instance || !SF_API_NAME.test(flowApiName)) return null;
    // The flow runtime page accepts input variables as query params (recordId is
    // the common one); Salesforce ignores params that aren't flow inputs.
    const url = new URL(`${instance}/flow/${encodeURIComponent(flowApiName)}`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
    return url.toString();
  }

  async refreshTokenIfNeeded(): Promise<void> {
    if (!this.token) await this.fetchToken();
  }

  async getConnectedUser(): Promise<string> {
    try {
      const info = await this.request<{ name?: string; preferred_username?: string }>(
        "GET",
        "/services/oauth2/userinfo",
      );
      return info.name ?? info.preferred_username ?? "Salesforce integration user";
    } catch {
      return "Salesforce integration user";
    }
  }

  async getPortalInfo(): Promise<PortalInfo> {
    const [count, org] = await Promise.all([
      this.soql<never>("SELECT COUNT() FROM User WHERE IsActive = true").catch(() => null),
      this.ensureOrgInfo().catch(() => ({ isSandbox: false, currency: null })),
    ]);
    return {
      userCount: count ? count.totalSize : null,
      portalId: null,
      defaultCurrency: org.currency,
      isSandbox: org.isSandbox,
      scopeGaps: [],
    };
  }

  /** Connect-time validation: token grant + identity in one go. */
  async validateConnection(): Promise<string> {
    // Only fetch a token if we don't already have one. A fresh OAuth exchange
    // hands us a valid access token; forcing a refresh here would consume the
    // just-issued refresh token under a rotation policy and store a dead one.
    if (!this.token) await this.fetchToken();
    await this.ensureOrgInfo().catch(() => undefined);
    // Hit the identity endpoint DIRECTLY (not the error-swallowing
    // getConnectedUser) so an invalid token fails the connect loudly instead of
    // silently storing a dead connection labeled "Salesforce integration user".
    const info = await this.request<{ name?: string; preferred_username?: string }>(
      "GET",
      "/services/oauth2/userinfo",
    );
    return info.name ?? info.preferred_username ?? "Salesforce user";
  }
}
