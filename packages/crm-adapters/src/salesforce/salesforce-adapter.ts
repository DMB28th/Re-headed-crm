/**
 * SalesforceAdapter — CrmAdapter over a REAL Salesforce org (M2 adapter).
 *
 * Auth: OAuth 2.0 CLIENT CREDENTIALS flow against a Connected App / External
 * Client App (instance URL + consumer key + secret; "run as" an integration
 * user configured on the app). Zero redirect infrastructure; the token is
 * fetched lazily and re-fetched once on 401. Because every call runs as the
 * connected user, Salesforce enforces FLS and sharing on top of Cardstack's
 * config layer (the PLAN.md selling point). The three-legged web-server flow
 * layers on in M7 without touching the request paths.
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
  CrmFieldValue,
  CrmRecord,
  CrmTask,
  FieldDescribe,
  FieldPatch,
  FieldType,
  FlowSummary,
  ObjectDescribe,
  ObjectSummary,
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
  /** e.g. https://mydomain.my.salesforce.com */
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
}

type FetchLike = typeof fetch;

const API = "/services/data/v61.0";

const OBJECTS: ObjectSummary[] = [
  { api: "Opportunity", label: "Opportunity", labelPlural: "Opportunities", custom: false },
  { api: "Contact", label: "Contact", labelPlural: "Contacts", custom: false },
  { api: "Account", label: "Account", labelPlural: "Accounts", custom: false },
];

const RELATIONSHIPS: Record<string, { api: string; label: string; relatedObject: string }[]> = {
  Opportunity: [{ api: "opportunity_contacts", label: "Contacts", relatedObject: "Contact" }],
  Contact: [],
  Account: [{ api: "account_opportunities", label: "Opportunities", relatedObject: "Opportunity" }],
};

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
}

const DESCRIBE_TTL_MS = 10 * 60 * 1000;

export class SalesforceAdapter implements CrmAdapter {
  private token: string | null = null;
  private describeCache = new Map<string, { describe: ObjectDescribe; fetchedAt: number }>();
  private viewObjectById = new Map<string, string>();
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

  constructor(
    private readonly credentials: SalesforceCredentials,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private get base(): string {
    return this.credentials.instanceUrl.replace(/\/$/, "");
  }

  private async fetchToken(): Promise<string> {
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
      this.token = null;
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

  async listObjects(): Promise<ObjectSummary[]> {
    return OBJECTS;
  }

  async describeObject(objectApi: string): Promise<ObjectDescribe> {
    const summary = OBJECTS.find((o) => o.api === objectApi);
    if (!summary) throw new CrmObjectNotFoundError(objectApi);
    const cached = this.describeCache.get(objectApi);
    // TTL so an FLS/picklist change in Setup propagates without a redeploy.
    if (cached && this.now() - cached.fetchedAt < DESCRIBE_TTL_MS) return cached.describe;
    const data = await this.request<{ fields: SfDescribeField[] }>(
      "GET",
      `${API}/sobjects/${objectApi}/describe`,
    );
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
          label: f.label,
          type: mapType(f),
          required: !f.nillable && f.createable && !f.defaultedOnCreate,
          readOnly: !f.updateable,
          ...(f.inlineHelpText ? { description: f.inlineHelpText } : {}),
          ...(active.length > 0 ? { values: active.map((v) => v.value) } : {}),
          ...(Object.keys(valueLabels).length > 0 ? { valueLabels } : {}),
          ...(f.type === "currency" ? { currencyCode: currency } : {}),
          ...(f.name === "StageName" && closedStages.length > 0 ? { closedValues: closedStages } : {}),
        };
      });
    const describe: ObjectDescribe = {
      ...summary,
      fields,
      relationships: RELATIONSHIPS[objectApi] ?? [],
      // Semantic hints so the server builds filters from concepts, not literals.
      ...(has("StageName") ? { stageField: "StageName" } : {}),
      ...(has("Amount") ? { amountField: "Amount" } : {}),
      ...(has("OwnerId") ? { ownerField: "OwnerId" } : {}),
      ...(has("CloseDate") ? { closeDateField: "CloseDate" } : {}),
    };
    this.describeCache.set(objectApi, { describe, fetchedAt: this.now() });
    return describe;
  }

  private nameField(objectApi: string): string {
    return objectApi === "Case" ? "CaseNumber" : "Name";
  }

  private recordFromSObject(raw: Record<string, unknown>): CrmRecord {
    const fields: Record<string, CrmFieldValue> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "attributes" || key === "Id") continue;
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        fields[key] = value as CrmFieldValue;
      }
    }
    return { id: String(raw.Id ?? ""), fields };
  }

  async search(objectApi: string, query: SearchQuery): Promise<RecordPage> {
    const describe = await this.describeObject(objectApi);
    const typeOf = (api: string) => describe.fields.find((f) => f.api === api)?.type;
    const selectable = describe.fields.filter((f) => f.type !== "reference").map((f) => f.api);
    // Reject filter/sort on fields not on the object — blocks MALFORMED_QUERY and
    // stops a prompt-injected model probing denied fields through the WHERE clause.
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
        case "not_contains":
          clauses.push(
            `(NOT ${f.field} LIKE '%${soqlLikeEscape(String(f.value ?? ""))}%')`,
          );
          break;
        case "starts_with":
          clauses.push(`${f.field} LIKE '${soqlLikeEscape(String(f.value ?? ""))}%'`);
          break;
        case "ends_with":
          clauses.push(`${f.field} LIKE '%${soqlLikeEscape(String(f.value ?? ""))}'`);
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
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    if (query.sort) requireField(query.sort.field);
    const order = query.sort ? ` ORDER BY ${query.sort.field} ${query.sort.dir.toUpperCase()} NULLS LAST` : "";
    const limit = query.limit ?? 10;
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const soql = `SELECT Id, ${selectable.filter((f) => f !== "Id").join(", ")} FROM ${objectApi}${where}${order} LIMIT ${limit} OFFSET ${offset}`;
    const [page, count] = await Promise.all([
      this.soql<Record<string, unknown>>(soql),
      this.soql<never>(`SELECT COUNT() FROM ${objectApi}${where}`),
    ]);
    const total = count.totalSize;
    return {
      rows: page.records.map((r) => this.recordFromSObject(r)),
      total,
      hasMore: offset + limit < total,
      ...(offset + limit < total ? { cursor: String(offset + limit) } : {}),
    };
  }

  async getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord> {
    const describe = await this.describeObject(objectApi);
    const wanted =
      fields.length > 0
        ? fields
        : describe.fields.filter((f) => f.type !== "reference").map((f) => f.api);
    const raw = await this.request<Record<string, unknown>>(
      "GET",
      `${API}/sobjects/${objectApi}/${id}?fields=${encodeURIComponent(["Id", ...wanted.filter((f) => f !== "Id")].join(","))}`,
    );
    return this.recordFromSObject(raw);
  }

  async getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage> {
    const cols = rel.columns.join(", ");
    if (rel.relationship === "opportunity_contacts") {
      const { records, totalSize } = await this.soql<{ Contact: Record<string, unknown> }>(
        `SELECT Contact.Id, ${rel.columns.map((c) => `Contact.${c}`).join(", ")} FROM OpportunityContactRole WHERE OpportunityId = '${soqlEscape(parentId)}' LIMIT ${rel.limit}`,
      );
      return {
        rows: records
          .filter((r) => r.Contact)
          .map((r) => this.recordFromSObject(r.Contact)),
        hasMore: totalSize > rel.limit,
        total: totalSize,
      };
    }
    if (rel.relationship === "account_opportunities") {
      const { records, totalSize } = await this.soql<Record<string, unknown>>(
        `SELECT Id, ${cols} FROM Opportunity WHERE AccountId = '${soqlEscape(parentId)}' LIMIT ${rel.limit}`,
      );
      return {
        rows: records.map((r) => this.recordFromSObject(r)),
        hasMore: totalSize > rel.limit,
        total: totalSize,
      };
    }
    return { rows: [], hasMore: false, total: 0 };
  }

  async getActivity(): Promise<ActivityEntry[]> {
    return [];
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
    for (const object of OBJECTS) {
      await this.listSavedViews(object.api).catch(() => []);
      const found = this.viewObjectById.get(viewId);
      if (found) return found;
    }
    throw new CrmRecordNotFoundError("saved view", viewId);
  }

  async getViewRows(viewId: string, cursor?: string): Promise<RecordPage> {
    const objectApi = await this.objectForView(viewId);
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const limit = 25;
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
    const known = new Set(OBJECTS.map((o) => o.api));
    return items
      .filter((i) => known.has(i.attributes.type))
      .slice(0, limit)
      .map((i) => ({
        id: i.Id,
        object: i.attributes.type,
        objectLabel:
          OBJECTS.find((o) => o.api === i.attributes.type)?.label ?? i.attributes.type,
        name: i.Name ?? i.Id,
        note: "Recently viewed",
        timestamp: new Date().toISOString(),
      }));
  }

  async getValidationRules(): Promise<RuleSummary[]> {
    return []; // Tooling API needs extra perms — 3d spike
  }

  async listFlows(): Promise<FlowSummary[]> {
    return [];
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
    await this.fetchToken();
    await this.ensureOrgInfo().catch(() => undefined);
    return this.getConnectedUser();
  }
}
