/**
 * One interface, N implementations (mock → hubspot → salesforce).
 * Everything above the adapter is CRM-agnostic; adapters never import from apps/*.
 */
import type {
  ActivityEntry,
  CrmRecord,
  CrmTask,
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

export interface CrmAdapter {
  // Metadata
  listObjects(): Promise<ObjectSummary[]>;
  describeObject(objectApi: string): Promise<ObjectDescribe>;

  // Data
  search(objectApi: string, query: SearchQuery): Promise<RecordPage>;
  getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord>;
  getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage>;
  getActivity(objectApi: string, id: string, limit: number): Promise<ActivityEntry[]>;
  updateRecord(objectApi: string, id: string, patch: FieldPatch): Promise<CrmRecord>;
  createRecord(objectApi: string, fields: FieldPatch): Promise<CrmRecord>;

  // Saved views (design 5a/5b)
  listSavedViews(objectApi: string): Promise<SavedView[]>;
  getViewRows(viewId: string, cursor?: string): Promise<RecordPage>;

  // Tasks / follow-ups + recents (home card, 7a)
  listTasks(userScope: string): Promise<TaskPage>;
  completeTask(id: string): Promise<CrmTask>;
  listRecentRecords(userScope: string, limit: number): Promise<RecentRecord[]>;

  // Governance metadata (3d, 10c)
  getValidationRules(objectApi: string): Promise<RuleSummary[]>;
  listFlows(): Promise<FlowSummary[]>;

  // Auth
  refreshTokenIfNeeded(): Promise<void>;
  /** Display name of the CRM user this connection acts as (writes are attributed to them). */
  getConnectedUser(): Promise<string>;
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
  constructor(crmLabel: string) {
    super(`${crmLabel} connection expired. Reconnect to continue; unsaved edits are kept.`);
    this.name = "CrmAuthError";
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
