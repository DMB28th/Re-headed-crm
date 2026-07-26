/**
 * One interface, N implementations (mock → hubspot → salesforce).
 * Everything above the adapter is CRM-agnostic; adapters never import from apps/*.
 */
import type {
  ActivityEntry,
  AggregateBucket,
  AggregateQuery,
  CrmRecord,
  CrmTask,
  FieldPatch,
  FlowDefinitionJson,
  FlowSummary,
  FlowTableRow,
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

export interface CrmAdapter {
  // Metadata
  listObjects(): Promise<ObjectSummary[]>;
  describeObject(objectApi: string): Promise<ObjectDescribe>;

  // Data
  search(objectApi: string, query: SearchQuery): Promise<RecordPage>;
  /** Server-side count/sum over ALL matching records (optionally grouped) —
   *  totals must not depend on paging rows into context. Optional: CRMs
   *  without a native aggregate surface may omit it. */
  aggregate?(objectApi: string, query: AggregateQuery): Promise<AggregateBucket[]>;
  getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord>;
  getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage>;
  getActivity(objectApi: string, id: string, limit: number): Promise<ActivityEntry[]>;
  updateRecord(objectApi: string, id: string, patch: FieldPatch): Promise<CrmRecord>;
  createRecord(objectApi: string, fields: FieldPatch): Promise<CrmRecord>;

  // Saved views (design 5a/5b)
  listSavedViews(objectApi: string): Promise<SavedView[]>;
  /** `columns` mirrors SearchQuery.columns — the fields the caller renders;
   *  adapters should restrict the fetch to them when provided. */
  getViewRows(viewId: string, cursor?: string, columns?: string[]): Promise<RecordPage>;

  // Tasks / follow-ups + recents (home card, 7a)
  listTasks(userScope: string): Promise<TaskPage>;
  completeTask(id: string): Promise<CrmTask>;
  listRecentRecords(userScope: string, limit: number): Promise<RecentRecord[]>;

  // Governance metadata (3d, 10c)
  getValidationRules(objectApi: string): Promise<RuleSummary[]>;
  listFlows(): Promise<FlowSummary[]>;
  /**
   * HANDOFF-rung launch target (design 10a): a URL that opens the flow in the
   * CRM's own UI. Optional — returns null when the CRM has no user-launchable
   * flow URL (e.g. HubSpot workflows). Never drives an interview; the CRM owns
   * the screens and the write.
   */
  getFlowLaunchUrl?(flowApiName: string, params?: Record<string, string>): string | null;
  /**
   * NATIVE-rung flow definition (experimental spike): the CRM's screen-flow
   * definition JSON for in-chat interpretation. Optional — null when the CRM
   * can't expose the definition (then only the handoff rung is available).
   */
  getFlowDefinition?(flowApiName: string): Promise<FlowDefinitionJson | null>;
  /**
   * Generic row fetch feeding flow data tables / record choice sets. Optional;
   * identifiers are validated by the adapter before querying.
   */
  queryRows?(
    objectApi: string,
    fields: string[],
    opts: { sortField?: string; sortOrder?: "Asc" | "Desc"; limit?: number },
  ): Promise<FlowTableRow[]>;

  // Auth
  refreshTokenIfNeeded(): Promise<void>;
  /** Display name of the CRM user this connection acts as (writes are attributed to them). */
  getConnectedUser(): Promise<string>;

  /** Portal-level facts Studio surfaces (real counts, real currency, scope coverage). */
  getPortalInfo(): Promise<PortalInfo>;
}

/**
 * Live-portal facts. null = unknown/unavailable — surfaces must degrade the
 * copy (drop the number), never invent one.
 */
export interface PortalInfo {
  /** Number of CRM users/owners, for "N reps use these cards" / "Publishes to N users". */
  userCount: number | null;
  /** CRM portal/org id, for deep links back into the CRM. */
  portalId: string | null;
  /** Portal default currency code (ISO 4217), e.g. "SEK". */
  defaultCurrency: string | null;
  /**
   * True when this connection points at a sandbox org (Salesforce
   * Organization.IsSandbox). null = the CRM has no such concept or the
   * adapter can't tell (HubSpot). Studio badges PRODUCTION loudly.
   */
  isSandbox?: boolean | null;
  /**
   * Human-readable capability gaps caused by missing token scopes, e.g.
   * "Custom objects are hidden — add crm.schemas.custom.read and reconnect."
   * Empty = full coverage as far as the adapter can tell.
   */
  scopeGaps: string[];
}

export class CrmObjectNotFoundError extends Error {
  constructor(objectApi: string) {
    super(`Unknown object: ${objectApi}`);
    this.name = "CrmObjectNotFoundError";
  }
}

export class CrmRecordNotFoundError extends Error {
  constructor(objectApi: string, id: string) {
    super(`No ${objectApi} record with id ${id}`);
    this.name = "CrmRecordNotFoundError";
  }
}

export class CrmAuthError extends Error {
  constructor(crmLabel: string, message?: string) {
    super(message ?? `${crmLabel} connection expired. Reconnect to continue; unsaved edits are kept.`);
    this.name = "CrmAuthError";
  }
}

/**
 * The CRM's API budget is exhausted (HubSpot second 429, Salesforce
 * REQUEST_LIMIT_EXCEEDED). Distinct from CrmAuthError so it never renders
 * as "reconnect" — the fix is waiting, not re-authing.
 */
export class CrmRateLimitError extends Error {
  constructor(crmLabel: string, detail?: string) {
    super(
      `${crmLabel} rate limit reached${detail ? ` (${detail})` : ""} — retry in a few minutes; the connection itself is fine.`,
    );
    this.name = "CrmRateLimitError";
  }
}

export class CrmValidationError extends Error {
  /** Verbatim CRM validation message, surfaced inline per design 1e. */
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "CrmValidationError";
  }
}
