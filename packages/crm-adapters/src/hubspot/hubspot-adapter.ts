/**
 * HubSpotAdapter — CrmAdapter over a REAL HubSpot portal (M1.5).
 *
 * Auth: a private-app access token (Settings → Integrations → Private Apps).
 * Same REST surface as OAuth apps with zero redirect infrastructure; the
 * three-legged OAuth flow layers on in M7 without touching this adapter's
 * request paths. Scopes needed: crm.objects.{deals,contacts,companies}.read
 * (+ .write for edits), crm.schemas.*.read.
 *
 * Coverage notes:
 * - Custom objects are discovered via /crm/v3/schemas: they appear in
 *   listObjects (primary cards) and as related-list options on the core
 *   objects. Tickets and line items are describable related-list targets.
 * - listSavedViews returns [] — HubSpot has no public saved-views API; admins
 *   get lists via Cardstack lists instead (same exposure model).
 * - getActivity / listRecentRecords return [] — the engagements timeline and
 *   "recently viewed" have no clean public read APIs.
 * - Tasks come from the tasks object (hs_task_*); check-off PATCHes status.
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
  CrmRecordNotFoundError,
  CrmValidationError,
  type CrmAdapter,
} from "../adapter.js";

export interface HubSpotCredentials {
  /** Private-app access token ("pat-…"). */
  accessToken: string;
}

type FetchLike = typeof fetch;

const BASE = "https://api.hubapi.com";

/** The primary objects offered for cards; custom objects join via /crm/v3/schemas. */
const OBJECTS: ObjectSummary[] = [
  { api: "deals", label: "Deal", labelPlural: "Deals", custom: false },
  { api: "contacts", label: "Contact", labelPlural: "Contacts", custom: false },
  { api: "companies", label: "Company", labelPlural: "Companies", custom: false },
];

/** Describable-but-not-primary objects (related-list targets). */
const SUPPORT_OBJECTS: ObjectSummary[] = [
  { api: "tickets", label: "Ticket", labelPlural: "Tickets", custom: false },
  { api: "line_items", label: "Line item", labelPlural: "Line items", custom: false },
];

/** Association-based related lists (standard objects; customs merge in at describe time). */
const RELATIONSHIPS: Record<string, { api: string; label: string; relatedObject: string }[]> = {
  deals: [
    { api: "deal_contacts", label: "Contacts", relatedObject: "contacts" },
    { api: "deal_company", label: "Company", relatedObject: "companies" },
    { api: "deal_tickets", label: "Tickets", relatedObject: "tickets" },
    { api: "deal_line_items", label: "Line items", relatedObject: "line_items" },
  ],
  contacts: [
    { api: "contact_deals", label: "Deals", relatedObject: "deals" },
    { api: "contact_tickets", label: "Tickets", relatedObject: "tickets" },
  ],
  companies: [
    { api: "company_deals", label: "Deals", relatedObject: "deals" },
    { api: "company_contacts", label: "Contacts", relatedObject: "contacts" },
  ],
};

const REL_TARGET: Record<string, { from: string; to: string }> = {
  deal_contacts: { from: "deals", to: "contacts" },
  deal_company: { from: "deals", to: "companies" },
  deal_tickets: { from: "deals", to: "tickets" },
  deal_line_items: { from: "deals", to: "line_items" },
  contact_deals: { from: "contacts", to: "deals" },
  contact_tickets: { from: "contacts", to: "tickets" },
  company_deals: { from: "companies", to: "deals" },
  company_contacts: { from: "companies", to: "contacts" },
};

const SEARCH_OPS: Record<string, string> = {
  eq: "EQ",
  neq: "NEQ",
  gt: "GT",
  gte: "GTE",
  lt: "LT",
  lte: "LTE",
  contains: "CONTAINS_TOKEN",
};

interface HsProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description?: string;
  hidden?: boolean;
  calculated?: boolean;
  options?: { label: string; value: string; hidden?: boolean }[];
  modificationMetadata?: { readOnlyValue?: boolean };
  showCurrencySymbol?: boolean;
}

function mapType(p: HsProperty): FieldType {
  if (p.showCurrencySymbol || p.name === "amount") return "currency";
  switch (p.type) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "bool":
      return "boolean";
    case "enumeration":
      return "picklist";
    default:
      break;
  }
  switch (p.fieldType) {
    case "textarea":
      return "textarea";
    case "phonenumber":
      return "phone";
    default:
      return "string";
  }
}

export class HubSpotAdapter implements CrmAdapter {
  private describeCache = new Map<string, ObjectDescribe>();
  private customObjects: ObjectSummary[] | null = null;
  /** relationship api → association endpoints, incl. dynamic custom-object rels. */
  private relTargets = new Map<string, { from: string; to: string }>(Object.entries(REL_TARGET));
  /** Custom-object related lists per core object (instance state, not module state). */
  private customRelationships = new Map<string, { api: string; label: string; relatedObject: string }[]>();

  constructor(
    private readonly credentials: HubSpotCredentials,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Custom-object schemas, discovered once (portals without any → []). */
  private async ensureCustomObjects(): Promise<ObjectSummary[]> {
    if (this.customObjects) return this.customObjects;
    try {
      const { results } = await this.request<{
        results: { objectTypeId: string; name: string; labels?: { singular?: string; plural?: string } }[];
      }>("GET", "/crm/v3/schemas");
      this.customObjects = results.map((schema) => ({
        api: schema.objectTypeId,
        label: schema.labels?.singular ?? schema.name,
        labelPlural: schema.labels?.plural ?? schema.name,
        custom: true,
      }));
      // Every custom object is offered as a related list on the core objects;
      // HubSpot associations return empty when a pair was never associated.
      for (const custom of this.customObjects) {
        for (const from of ["deals", "contacts", "companies"]) {
          const api = `${from.slice(0, -1)}_${custom.api}`;
          this.relTargets.set(api, { from, to: custom.api });
          const existing = this.customRelationships.get(from) ?? [];
          existing.push({ api, label: custom.labelPlural, relatedObject: custom.api });
          this.customRelationships.set(from, existing);
        }
      }
    } catch {
      this.customObjects = []; // missing schemas scope → core objects only
    }
    return this.customObjects;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      // A hung request must fail visibly, not spin a loading screen forever.
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) throw new CrmAuthError("HubSpot");
    if (res.status === 403) {
      // Distinct from expiry: the token works but lacks a scope for THIS call.
      throw new Error(
        `HubSpot denied ${method} ${path} (403) — the private app is missing a scope. ` +
          "Check crm.objects.{deals,contacts,companies}.read/write and crm.schemas.*.read.",
      );
    }
    if (res.status === 404) throw new CrmRecordNotFoundError("hubspot resource", path);
    if (res.status === 429) {
      throw new Error("HubSpot rate limit hit (429) — retry in a few seconds.");
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as {
        message?: string;
        category?: string;
        context?: { properties?: string[] };
      };
      if (res.status === 400 && detail.message) {
        throw new CrmValidationError(detail.message, detail.context?.properties?.[0]);
      }
      throw new Error(`HubSpot ${method} ${path} failed (${res.status}): ${detail.message ?? ""}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listObjects(): Promise<ObjectSummary[]> {
    return [...OBJECTS, ...(await this.ensureCustomObjects())];
  }

  async describeObject(objectApi: string): Promise<ObjectDescribe> {
    const summary =
      OBJECTS.find((o) => o.api === objectApi) ??
      SUPPORT_OBJECTS.find((o) => o.api === objectApi) ??
      (await this.ensureCustomObjects()).find((o) => o.api === objectApi);
    if (!summary) throw new CrmObjectNotFoundError(objectApi);
    const cached = this.describeCache.get(objectApi);
    if (cached) return cached;
    const { results } = await this.request<{ results: HsProperty[] }>(
      "GET",
      `/crm/v3/properties/${objectApi}`,
    );
    const fields: FieldDescribe[] = results
      .filter((p) => !p.hidden)
      .map((p) => ({
        api: p.name,
        label: p.label || p.name,
        type: mapType(p),
        required: false, // HubSpot requiredness is form-level; writes surface it
        readOnly: p.calculated === true || p.modificationMetadata?.readOnlyValue === true,
        ...(p.description ? { description: p.description } : {}),
        ...(p.options && p.options.length > 0
          ? { values: p.options.filter((o) => !o.hidden).map((o) => o.value) }
          : {}),
        ...(mapType(p) === "currency" ? { currencyCode: "USD" } : {}),
      }));
    await this.ensureCustomObjects(); // custom-object related lists join here
    const describe: ObjectDescribe = {
      ...summary,
      fields,
      relationships: [
        ...(RELATIONSHIPS[objectApi] ?? []),
        ...(this.customRelationships.get(objectApi) ?? []),
      ],
    };
    this.describeCache.set(objectApi, describe);
    return describe;
  }

  private async propertyNames(objectApi: string): Promise<string[]> {
    return (await this.describeObject(objectApi)).fields.map((f) => f.api);
  }

  private toRecord(objectApi: string, raw: { id: string; properties: Record<string, string | null> }): CrmRecord {
    const describe = this.describeCache.get(objectApi);
    const fields: Record<string, CrmFieldValue> = {};
    for (const [key, value] of Object.entries(raw.properties)) {
      if (value === null || value === "") {
        fields[key] = null;
        continue;
      }
      const type = describe?.fields.find((f) => f.api === key)?.type;
      fields[key] =
        type === "number" || type === "currency" || type === "percent"
          ? Number(value)
          : type === "boolean"
            ? value === "true"
            : type === "date"
              ? value.slice(0, 10)
              : value;
    }
    return { id: raw.id, fields };
  }

  async search(objectApi: string, query: SearchQuery): Promise<RecordPage> {
    const properties = await this.propertyNames(objectApi);
    const filters = (query.filters ?? []).map((f) => ({
      propertyName: f.field,
      operator: SEARCH_OPS[f.op] ?? "EQ",
      value: String(f.value),
    }));
    const body: Record<string, unknown> = {
      properties,
      limit: query.limit ?? 10,
      ...(query.text ? { query: query.text } : {}),
      ...(filters.length > 0 ? { filterGroups: [{ filters }] } : {}),
      ...(query.sort
        ? {
            sorts: [
              { propertyName: query.sort.field, direction: query.sort.dir === "asc" ? "ASCENDING" : "DESCENDING" },
            ],
          }
        : {}),
      ...(query.cursor ? { after: query.cursor } : {}),
    };
    const data = await this.request<{
      total: number;
      results: { id: string; properties: Record<string, string | null> }[];
      paging?: { next?: { after?: string } };
    }>("POST", `/crm/v3/objects/${objectApi}/search`, body);
    const after = data.paging?.next?.after;
    return {
      rows: data.results.map((r) => this.toRecord(objectApi, r)),
      total: data.total,
      hasMore: !!after,
      ...(after ? { cursor: after } : {}),
    };
  }

  async getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord> {
    const properties = fields.length > 0 ? fields : await this.propertyNames(objectApi);
    // batch/read, not GET: real portals have hundreds of properties and a
    // ?properties= query string blows past URL limits (the "stuck loading
    // screen" bug on live sandboxes). POST bodies have no such limit.
    const batch = await this.request<{
      results: { id: string; properties: Record<string, string | null> }[];
    }>("POST", `/crm/v3/objects/${objectApi}/batch/read`, {
      properties,
      inputs: [{ id }],
    });
    const raw = batch.results[0];
    if (!raw) throw new CrmRecordNotFoundError(objectApi, id);
    return this.toRecord(objectApi, raw);
  }

  async getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage> {
    await this.ensureCustomObjects(); // dynamic rel targets register here
    const target = this.relTargets.get(rel.relationship);
    if (!target) return { rows: [], hasMore: false, total: 0 };
    // Pairs that were never associated in this portal come back empty, and an
    // unknown pair must degrade the list, not error the card.
    const assoc = await this.request<{ results: { toObjectId: number | string }[] }>(
      "GET",
      `/crm/v4/objects/${target.from}/${parentId}/associations/${target.to}?limit=100`,
    ).catch(() => ({ results: [] }));
    const ids = assoc.results.map((r) => String(r.toObjectId));
    if (ids.length === 0) return { rows: [], hasMore: false, total: 0 };
    await this.describeObject(target.to); // warm cache for typed values
    const batch = await this.request<{
      results: { id: string; properties: Record<string, string | null> }[];
    }>("POST", `/crm/v3/objects/${target.to}/batch/read`, {
      properties: rel.columns,
      inputs: ids.slice(0, rel.limit).map((id) => ({ id })),
    });
    return {
      rows: batch.results.map((r) => this.toRecord(target.to, r)),
      hasMore: ids.length > rel.limit,
      total: ids.length,
    };
  }

  async getActivity(): Promise<ActivityEntry[]> {
    return []; // engagements timeline has no clean public read API (v1)
  }

  async updateRecord(objectApi: string, id: string, patch: FieldPatch): Promise<CrmRecord> {
    await this.request("PATCH", `/crm/v3/objects/${objectApi}/${id}`, {
      properties: Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, v === null ? "" : String(v)]),
      ),
    });
    return this.getRecord(objectApi, id, []);
  }

  async createRecord(objectApi: string, fields: FieldPatch): Promise<CrmRecord> {
    const created = await this.request<{ id: string }>("POST", `/crm/v3/objects/${objectApi}`, {
      properties: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, v === null ? "" : String(v)]),
      ),
    });
    return this.getRecord(objectApi, created.id, []);
  }

  async listSavedViews(): Promise<SavedView[]> {
    return []; // no public saved-views API — Cardstack lists fill this (5a note)
  }

  async getViewRows(viewId: string): Promise<RecordPage> {
    throw new CrmRecordNotFoundError("saved view", viewId);
  }

  async listTasks(): Promise<TaskPage> {
    const data = await this.request<{
      results: { id: string; properties: Record<string, string | null> }[];
    }>("POST", "/crm/v3/objects/tasks/search", {
      filterGroups: [
        { filters: [{ propertyName: "hs_task_status", operator: "NEQ", value: "COMPLETED" }] },
      ],
      properties: ["hs_task_subject", "hs_timestamp", "hs_task_status"],
      sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
      limit: 20,
    });
    return {
      rows: data.results.map((r) => ({
        id: r.id,
        subject: r.properties.hs_task_subject ?? "(no subject)",
        dueDate: taskDate(r.properties.hs_timestamp),
        status: "open" as const,
      })),
      hasMore: false,
    };
  }

  async completeTask(id: string): Promise<CrmTask> {
    await this.request("PATCH", `/crm/v3/objects/tasks/${id}`, {
      properties: { hs_task_status: "COMPLETED" },
    });
    const raw = await this.request<{ id: string; properties: Record<string, string | null> }>(
      "GET",
      `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_timestamp,hs_task_status`,
    );
    return {
      id: raw.id,
      subject: raw.properties.hs_task_subject ?? "(no subject)",
      dueDate: taskDate(raw.properties.hs_timestamp),
      status: "completed",
    };
  }

  async listRecentRecords(): Promise<RecentRecord[]> {
    return []; // no public "recently viewed" API (v1)
  }

  async getValidationRules(): Promise<RuleSummary[]> {
    return [];
  }

  async listFlows(): Promise<FlowSummary[]> {
    return [];
  }

  async refreshTokenIfNeeded(): Promise<void> {
    // Private-app tokens don't expire; OAuth refresh lands with M7.
  }

  async getConnectedUser(): Promise<string> {
    try {
      const info = await this.request<{ portalId?: number; uiDomain?: string }>(
        "GET",
        "/account-info/v3/details",
      );
      return info.portalId ? `HubSpot portal ${info.portalId}` : "HubSpot private app";
    } catch {
      return "HubSpot private app";
    }
  }

  /**
   * Connect-time validation: prove the token can read records AND schemas —
   * a missing crm.schemas scope otherwise passes connect and breaks every
   * Studio page later (describe 403s).
   */
  async validateConnection(): Promise<string> {
    await this.request("GET", "/crm/v3/objects/deals?limit=1");
    await this.describeObject("deals");
    return this.getConnectedUser();
  }
}

/** hs_timestamp arrives as ISO 8601 or epoch millis depending on the API path. */
function taskDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const parsed = new Date(Number(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}
