/**
 * MockCrmAdapter — full CrmAdapter over in-memory fixtures. Keeps the dev loop
 * credential-free; all widget/server tests and Studio previews run against it.
 * Writes mutate a per-instance copy, so tests stay isolated.
 */
import type {
  ActivityEntry,
  CrmFieldValue,
  CrmRecord,
  CrmTask,
  FieldFilter,
  FieldPatch,
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
  CrmObjectNotFoundError,
  CrmRecordNotFoundError,
  CrmValidationError,
  type CrmAdapter,
  type PortalInfo,
} from "../adapter.js";
import * as fixtures from "./fixtures.js";
import type { FixtureRecord } from "./fixtures.js";

const OPEN_STAGES = new Set([
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Contract sent",
]);

const clone = <T>(value: T): T => structuredClone(value);

export class MockCrmAdapter implements CrmAdapter {
  private data: Record<string, FixtureRecord[]> = {
    deals: clone(fixtures.DEALS),
    contacts: clone(fixtures.CONTACTS),
    companies: clone(fixtures.COMPANIES),
  };
  private tasks: CrmTask[] = clone(fixtures.TASKS);
  private nextId = 1000;

  async listObjects(): Promise<ObjectSummary[]> {
    return Object.values(fixtures.OBJECTS).map(
      ({ api, label, labelPlural, custom }) => ({ api, label, labelPlural, custom }),
    );
  }

  async describeObject(objectApi: string): Promise<ObjectDescribe> {
    const describe = fixtures.OBJECTS[objectApi];
    if (!describe) throw new CrmObjectNotFoundError(objectApi);
    const out = clone(describe);
    // Semantic hints so the server builds filters from concepts, not literals.
    // In the mock, stage VALUES are the labels ("Closed won"), so closedValues
    // carries those directly.
    const has = (api: string) => out.fields.some((f) => f.api === api);
    if (has("dealstage")) {
      out.stageField = "dealstage";
      const stage = out.fields.find((f) => f.api === "dealstage");
      if (stage && !stage.closedValues) stage.closedValues = ["Closed won", "Closed lost"];
    }
    if (has("amount")) out.amountField = "amount";
    if (has("owner")) out.ownerField = "owner";
    if (has("closedate")) out.closeDateField = "closedate";
    return out;
  }

  async search(objectApi: string, query: SearchQuery): Promise<RecordPage> {
    const rows = this.table(objectApi).filter((r) => this.matches(r, query));
    const sorted = this.sort(rows, query.sort);
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const limit = query.limit ?? 10;
    const page = sorted.slice(offset, offset + limit);
    return {
      rows: page.map((r) => this.toRecord(r)),
      hasMore: offset + limit < sorted.length,
      total: sorted.length,
      ...(offset + limit < sorted.length ? { cursor: String(offset + limit) } : {}),
    };
  }

  async getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord> {
    const row = this.table(objectApi).find((r) => r.id === id);
    if (!row) throw new CrmRecordNotFoundError(objectApi, id);
    const record = this.toRecord(row);
    if (fields.length === 0) return record;
    const picked: Record<string, CrmFieldValue> = {};
    for (const f of fields) {
      picked[f] = record.fields[f] ?? null;
    }
    return { id: record.id, fields: picked };
  }

  async getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage> {
    if (rel.relationship === "deal_contacts") {
      const ids = fixtures.DEAL_CONTACT_ASSOCIATIONS[parentId] ?? [];
      const rows = ids
        .map((id) => this.table("contacts").find((c) => c.id === id))
        .filter((c): c is FixtureRecord => !!c);
      return {
        rows: rows.slice(0, rel.limit).map((r) => this.toRecord(r)),
        hasMore: rows.length > rel.limit,
        total: rows.length,
      };
    }
    if (rel.relationship === "company_deals") {
      const company = this.table("companies").find((c) => c.id === parentId);
      const rows = company
        ? this.table("deals").filter((d) => d.fields.company === company.fields.name)
        : [];
      return {
        rows: rows.slice(0, rel.limit).map((r) => this.toRecord(r)),
        hasMore: rows.length > rel.limit,
        total: rows.length,
      };
    }
    if (rel.relationship === "deal_company") {
      const deal = this.table("deals").find((d) => d.id === parentId);
      const rows = deal
        ? this.table("companies").filter((c) => c.fields.name === deal.fields.company)
        : [];
      return { rows: rows.map((r) => this.toRecord(r)), hasMore: false, total: rows.length };
    }
    return { rows: [], hasMore: false, total: 0 };
  }

  async getActivity(objectApi: string, id: string, limit: number): Promise<ActivityEntry[]> {
    if (objectApi !== "deals") return [];
    return clone(fixtures.ACTIVITY[id] ?? []).slice(0, limit);
  }

  async updateRecord(objectApi: string, id: string, patch: FieldPatch): Promise<CrmRecord> {
    const row = this.table(objectApi).find((r) => r.id === id);
    if (!row) throw new CrmRecordNotFoundError(objectApi, id);
    this.validate(objectApi, { ...row.fields, ...patch });
    for (const [key, value] of Object.entries(patch)) {
      const describe = fixtures.OBJECTS[objectApi]?.fields.find((f) => f.api === key);
      if (!describe) throw new CrmValidationError(`Unknown field: ${key}`, key);
      if (describe.readOnly) {
        throw new CrmValidationError(`${describe.label} is read-only.`, key);
      }
      if (describe.values && value !== null && !describe.values.includes(String(value))) {
        throw new CrmValidationError(
          `${describe.label} must be one of: ${describe.values.join(", ")}.`,
          key,
        );
      }
      row.fields[key] = value;
    }
    return this.toRecord(row);
  }

  async createRecord(objectApi: string, fields: FieldPatch): Promise<CrmRecord> {
    const describe = fixtures.OBJECTS[objectApi];
    if (!describe) throw new CrmObjectNotFoundError(objectApi);
    for (const f of describe.fields) {
      if (f.required && (fields[f.api] === undefined || fields[f.api] === null)) {
        throw new CrmValidationError(`${f.label} is required.`, f.api);
      }
    }
    this.validate(objectApi, fields);
    const row: FixtureRecord = {
      id: `${objectApi.slice(0, 1)}-${this.nextId++}`,
      fields: Object.fromEntries(
        describe.fields.map((f) => [f.api, fields[f.api] ?? null]),
      ),
    };
    this.table(objectApi).push(row);
    return this.toRecord(row);
  }

  async listSavedViews(objectApi: string): Promise<SavedView[]> {
    return fixtures.SAVED_VIEWS.filter((v) => v.object === objectApi);
  }

  async getViewRows(viewId: string, cursor?: string): Promise<RecordPage> {
    const view = fixtures.SAVED_VIEWS.find((v) => v.id === viewId);
    if (!view) throw new CrmRecordNotFoundError("saved view", viewId);
    const queries: Record<string, SearchQuery> = {
      "v-01": { filters: [{ field: "dealstage", op: "neq", value: "Closed won" }, { field: "dealstage", op: "neq", value: "Closed lost" }] },
      "v-02": { filters: [{ field: "closedate", op: "lte", value: "2026-09-30" }, { field: "dealstage", op: "neq", value: "Closed won" }, { field: "dealstage", op: "neq", value: "Closed lost" }] },
      "v-03": { filters: [{ field: "renewal_date", op: "lte", value: "2026-10-08" }, { field: "renewal_date", op: "gt", value: "2026-07-10" }] },
      "v-04": { filters: [{ field: "amount", op: "gt", value: 50000 }, { field: "dealstage", op: "neq", value: "Closed won" }, { field: "dealstage", op: "neq", value: "Closed lost" }] },
    };
    const query = queries[viewId] ?? {};
    return this.search(view.object, { ...query, ...(cursor ? { cursor } : {}) });
  }

  async listTasks(_userScope: string): Promise<TaskPage> {
    return { rows: clone(this.tasks.filter((t) => t.status === "open")), hasMore: false };
  }

  async listRecentRecords(_userScope: string, limit: number): Promise<RecentRecord[]> {
    return clone(fixtures.RECENT_RECORDS)
      .slice(0, limit)
      .map((r) => ({ ...r, objectLabel: fixtures.OBJECTS[r.object]?.label ?? r.object }));
  }

  async completeTask(id: string): Promise<CrmTask> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new CrmRecordNotFoundError("task", id);
    task.status = "completed";
    return clone(task);
  }

  async getValidationRules(objectApi: string): Promise<RuleSummary[]> {
    return objectApi === "deals" ? clone(fixtures.VALIDATION_RULES) : [];
  }

  async listFlows(): Promise<FlowSummary[]> {
    return clone(fixtures.FLOWS);
  }

  async refreshTokenIfNeeded(): Promise<void> {
    // no-op: the mock portal has no auth
  }

  async getConnectedUser(): Promise<string> {
    // Self-describing demo persona (feedback 2026-07-11: no unexplained names).
    return "Demo rep";
  }

  async getPortalInfo(): Promise<PortalInfo> {
    // The demo portal's canonical numbers (the design's "38 reps").
    return { userCount: 38, portalId: null, defaultCurrency: "USD", scopeGaps: [] };
  }

  // --- internals ---

  private table(objectApi: string): FixtureRecord[] {
    const rows = this.data[objectApi];
    if (!rows) throw new CrmObjectNotFoundError(objectApi);
    return rows;
  }

  private toRecord(row: FixtureRecord): CrmRecord {
    return clone({ id: row.id, fields: row.fields });
  }

  private nameField(row: FixtureRecord): string {
    return String(row.fields.dealname ?? row.fields.name ?? "");
  }

  private matches(row: FixtureRecord, query: SearchQuery): boolean {
    if (query.text) {
      const haystack = `${this.nameField(row)} ${row.fields.company ?? ""}`.toLowerCase();
      const hit = query.text
        .toLowerCase()
        .split(/\s+/)
        .every((term) => haystack.includes(term));
      if (!hit) return false;
    }
    for (const filter of query.filters ?? []) {
      if (!this.applyFilter(row.fields[filter.field] ?? null, filter)) return false;
    }
    return true;
  }

  private applyFilter(value: CrmFieldValue, filter: FieldFilter): boolean {
    const { op } = filter;
    const expected = filter.value ?? null;
    // Emptiness ops read null directly; other comparisons on null are false
    // except neq / not_in.
    if (op === "is_empty") return value === null;
    if (op === "not_empty") return value !== null;
    if (op === "in") return (filter.values ?? []).some((v) => v === value);
    if (op === "not_in") return !(filter.values ?? []).some((v) => v === value);
    if (value === null) return op === "neq";
    switch (op) {
      case "eq":
        return value === expected;
      case "neq":
        return value !== expected;
      case "contains":
        return String(value).toLowerCase().includes(String(expected).toLowerCase());
      case "gt":
        return compareValues(value, expected) > 0;
      case "gte":
        return compareValues(value, expected) >= 0;
      case "lt":
        return compareValues(value, expected) < 0;
      case "lte":
        return compareValues(value, expected) <= 0;
      default:
        return false;
    }
  }

  private sort(
    rows: FixtureRecord[],
    sort: SearchQuery["sort"],
  ): FixtureRecord[] {
    if (!sort) return rows;
    const { field, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a.fields[field] ?? null;
      const bv = b.fields[field] ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
  }

  private validate(objectApi: string, fields: Record<string, CrmFieldValue>): void {
    if (objectApi !== "deals") return;
    // Mirrors fixtures.VALIDATION_RULES — the mock actually enforces them so the
    // partial-failure design state (1e) is exercisable.
    if (fields.dealstage === "Closed lost" && !fields.loss_reason) {
      throw new CrmValidationError(
        "Loss reason is required when the deal stage is Closed lost.",
        "loss_reason",
      );
    }
    if (fields.amount !== null && fields.amount !== undefined && Number(fields.amount) <= 0) {
      throw new CrmValidationError("Amount must be greater than zero.", "amount");
    }
  }
}

function compareValues(a: CrmFieldValue, b: CrmFieldValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export { OPEN_STAGES };
