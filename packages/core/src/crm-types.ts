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
  /** Picklist values, when type === "picklist". */
  values?: string[];
  currencyCode?: string;
}

export interface ObjectSummary {
  api: string;
  label: string;
  labelPlural: string;
  custom: boolean;
}

export interface ObjectDescribe extends ObjectSummary {
  fields: FieldDescribe[];
  relationships: RelationshipDescribe[];
}

export interface RelationshipDescribe {
  /** Relationship / association API name. */
  api: string;
  label: string;
  relatedObject: string;
}

export type CrmFieldValue = string | number | boolean | null;

export interface CrmRecord {
  id: string;
  /** Field API name → value. Dot-path columns are pre-flattened by the adapter. */
  fields: Record<string, CrmFieldValue>;
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
  limit?: number;
  cursor?: string;
}

export interface FieldFilter {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  value: CrmFieldValue;
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
}

/** "Picked up recently" entry on the home card (design 7a). */
export interface RecentRecord {
  id: string;
  object: string;
  name: string;
  /** One-line activity note ("Contract emailed · 2d ago" without the timestamp). */
  note: string;
  timestamp: string;
}

export interface ActivityEntry {
  id: string;
  kind: "email" | "call" | "note" | "meeting";
  summary: string;
  timestamp: string;
}
