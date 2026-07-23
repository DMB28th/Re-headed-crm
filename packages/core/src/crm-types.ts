/**
 * CRM-agnostic data shapes shared by adapters, server, and widgets.
 * The CrmAdapter interface itself lives in @cardstack/crm-adapters.
 */

export type FieldType =
  | "string"
  | "textarea"
  | "number"
  | "currency"
  | "percent"
  | "boolean"
  | "date"
  | "datetime"
  | "picklist"
  | "email"
  | "phone"
  | "url"
  | "reference";

export interface FieldDescribe {
  api: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** CRM-side read-only (formula, system, FLS). Overrides any config `editable`. */
  readOnly: boolean;
  /**
   * Field description from the CRM's own metadata (SFDC description/inlineHelpText,
   * HubSpot property description). One source, three consumers: model-facing
   * content (V3), Studio coverage nudges, and the rep-facing ⓘ tooltip.
   * Empty string / undefined = metadata gap.
   */
  description?: string;
  /** Picklist values (INTERNAL values — what the CRM stores), when type === "picklist". */
  values?: string[];
  /**
   * Internal value → human label, when they differ (HubSpot pipeline-stage ids,
   * owner ids, Salesforce picklist labels). Display surfaces render the label;
   * writes always send the internal value.
   */
  valueLabels?: Record<string, string>;
  currencyCode?: string;
  /**
   * For stage-like picklists: the INTERNAL values that mean "closed"
   * (HubSpot pipeline stages with metadata.isClosed, Salesforce
   * OpportunityStage.IsClosed). Lets the server build a correct
   * openOnly filter instead of guessing by label.
   */
  closedValues?: string[];
  /** For reference fields: target object api name(s) — drill-through target. */
  referenceTo?: string[];
}

import type { ActionInputValueType } from "./layout-config.js";

export interface ObjectSummary {
  api: string;
  label: string;
  labelPlural: string;
  custom: boolean;
}

export interface ObjectDescribe extends ObjectSummary {
  fields: FieldDescribe[];
  relationships: RelationshipDescribe[];
  /**
   * Semantic field hints, so CRM-agnostic callers (crm_search filters) never
   * hardcode HubSpot names into Salesforce queries. Each is a field api name
   * present in `fields`, set only when the object has that concept:
   * stage ("dealstage"/"StageName"), amount ("amount"/"Amount"),
   * owner ("hubspot_owner_id"/"OwnerId"), closeDate ("closedate"/"CloseDate").
   */
  stageField?: string;
  amountField?: string;
  ownerField?: string;
  closeDateField?: string;
}

export interface RelationshipDescribe {
  /** UNIQUE relationship API name (Salesforce relationshipName / HubSpot assoc). */
  api: string;
  label: string;
  relatedObject: string;
  /**
   * Salesforce only: the child's foreign-key FIELD that points back to the
   * parent (from describe childRelationships). getRelated queries by it. Absent
   * for HubSpot (which resolves related records via the associations API).
   * Multiple relationships can share a foreign key (Contacts/Opportunities/Cases
   * all use AccountId), which is why `api` — not this — is the unique id.
   */
  foreignKey?: string;
}

export type CrmFieldValue = string | number | boolean | null;

export interface CrmRecord {
  id: string;
  /** Field API name → value. Dot-path columns are pre-flattened by the adapter. */
  fields: Record<string, CrmFieldValue>;
  /**
   * For reference fields whose value was resolved to a display name: the
   * referenced record's id, so the widget can open it (drill-through).
   * Only present for fields also present in `fields`.
   */
  refs?: Record<string, string>;
}

export interface RecordPage {
  rows: CrmRecord[];
  hasMore: boolean;
  total?: number;
  cursor?: string;
}

export interface SearchQuery {
  /** Free-text query, matched against name-ish fields. */
  text?: string;
  /** Simple field filters, ANDed. */
  filters?: FieldFilter[];
  sort?: { field: string; dir: "asc" | "desc" };
  /**
   * Fields the caller actually renders (e.g. the layout's list columns).
   * Adapters SHOULD restrict their fetch to these — selecting an object's
   * full field list drags in system references whose traversal can be
   * unqueryable (seen live: OpportunityHistory has no Name). Absent = all.
   */
  columns?: string[];
  limit?: number;
  cursor?: string;
}

export interface FieldFilter {
  field: string;
  op:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "in"
    | "not_in"
    | "is_empty"
    | "not_empty";
  /** Absent for is_empty / not_empty (they take no operand). */
  value?: CrmFieldValue;
  /** Operand set for in / not_in. */
  values?: CrmFieldValue[];
}

export type FieldPatch = Record<string, CrmFieldValue>;

// --- Design-handoff adapter extensions (PLAN.md "New adapter capabilities") ---

export interface SavedView {
  id: string;
  object: string;
  name: string;
  /** Human-readable filter summary, read-only from the CRM (5a). */
  filterSummary: string;
  visibility: "shared" | "private";
}

export interface CrmTask {
  id: string;
  subject: string;
  dueDate: string | null;
  status: "open" | "completed";
  relatedRecordId?: string;
  relatedRecordName?: string;
}

export interface TaskPage {
  rows: CrmTask[];
  hasMore: boolean;
}

export interface RuleSummary {
  id: string;
  name: string;
  fields: string[];
  /** Verbatim from the CRM ("listed for awareness" — never evaluated). */
  errorMessage: string;
}

export interface FlowSummary {
  api: string;
  label: string;
  screens: number;
  writesSummary: string;
  /**
   * Input variables the CRM/runtime can discover. Optional because live
   * adapters may not have metadata coverage yet; Studio still lets admins add
   * explicit mappings by hand.
   */
  inputVariables?: FlowInputVariable[];
}

export interface FlowInputVariable {
  name: string;
  label?: string;
  valueType?: ActionInputValueType;
  required?: boolean;
  description?: string;
}

/** "Picked up recently" entry on the home card (design 7a). */
export interface RecentRecord {
  id: string;
  object: string;
  /** Singular display label for the type pill ("Company") — never derived by string-hacking the api. */
  objectLabel?: string;
  name: string;
  /** One-line activity note ("Contract emailed · 2d ago" without the timestamp). */
  note: string;
  timestamp: string;
}

/** One row of a server-side aggregation (crm_aggregate). */
export interface AggregateBucket {
  /** The groupBy field's value; null for the ungrouped total. */
  group: string | null;
  count: number;
  /** Present when a sum field was requested. */
  sum?: number | null;
}

export interface AggregateQuery {
  groupBy?: string;
  sumField?: string;
  filters?: FieldFilter[];
}

export interface ActivityEntry {
  id: string;
  /** "update" = a field change from CRM history; "task" = a CRM task/to-do. */
  kind: "email" | "call" | "note" | "meeting" | "task" | "update";
  summary: string;
  timestamp: string;
}
