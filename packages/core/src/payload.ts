/**
 * The structuredContent payload contracts — what the server sends to hydrate
 * each widget. Hidden from the model; the model-facing summary travels in the
 * tool result's `content` text instead.
 *
 * Everything in here has already passed server-side denylist filtering
 * (see filtering.ts). The widget never sees a field the config doesn't allow.
 */
import type { LayoutConfig, ListViewConfig } from "./layout-config.js";
import type {
  ActivityEntry,
  CrmFieldValue,
  CrmRecord,
  FieldDescribe,
  RecordPage,
} from "./crm-types.js";

/** Merged live describe metadata, exposed fields only. Keyed by field API name. */
export type DescribeMetaMap = Record<string, FieldDescribe>;

export interface WidgetCapabilities {
  writeEnabled: boolean;
  /** Fields the current user may edit from the widget (config ∩ CRM read-only ∩ denylist). */
  editableFields: string[];
}

/** Source/maker chip data ("HubSpot · via Cardstack") + layout chip ("layout v4"). */
export interface WidgetProvenance {
  crm: "salesforce" | "hubspot";
  crmLabel: string;
  layoutName?: string;
  layoutRevision: number;
  /** CRM user writes are attributed to ("Written as Dan K." in the diff footer). */
  connectedUser?: string;
}

/** structuredContent for crm_get_record → the record-card widget. */
export interface RecordCardPayload {
  kind: "record-card";
  layout: LayoutConfig;
  meta: DescribeMetaMap;
  record: CrmRecord;
  /** Keyed by relationship API name from layout.recordCard.relatedLists. */
  related: Record<string, RecordPage>;
  /** Activity timeline entries (design 1a right column), newest first. */
  activity: ActivityEntry[];
  capabilities: WidgetCapabilities;
  provenance: WidgetProvenance;
}

/** structuredContent for crm_search / crm_list_view → the results-table widget. */
export interface ResultsTablePayload {
  kind: "results-table";
  object: string;
  /** Natural-language header, e.g. "8 open deals over €50,000". */
  title: string;
  listView: ListViewConfig;
  meta: DescribeMetaMap;
  page: RecordPage;
  /** Set when the table renders a saved CRM view (5b). */
  savedViewName?: string;
  savedViewId?: string;
  /** Human-readable filter summary, read-only from the CRM ("managed in HubSpot"). */
  savedViewFilterSummary?: string;
  provenance: WidgetProvenance;
}

/** Ambiguous saved-view ask → the results-table widget renders a picker (5b). */
export interface ViewPickerOption {
  viewId: string;
  name: string;
  filterSummary: string;
}

export interface ViewPickerPayload {
  kind: "view-picker";
  object: string;
  /** The user's original ask — sent back with the pick so the choice is remembered. */
  query: string;
  options: ViewPickerOption[];
  provenance: WidgetProvenance;
}

/** Per-field outcome of a confirmed write (design 1e partial failure / 4c receipt). */
export interface FieldWriteResult {
  field: string;
  label: string;
  before: CrmFieldValue;
  after: CrmFieldValue;
  ok: boolean;
  /** Verbatim CRM validation message when ok === false — never a generic error. */
  error?: string;
}

/** structuredContent for crm_update_record → consumed by the record-card widget. */
export interface WriteReceiptPayload {
  kind: "write-receipt";
  object: string;
  recordId: string;
  recordName: string;
  results: FieldWriteResult[];
  savedCount: number;
  failedCount: number;
  writtenAs: string;
  timestamp: string;
  /** Fresh post-write record, denylist-filtered like any record payload. */
  record: CrmRecord;
  provenance: WidgetProvenance;
}

export type WidgetPayload =
  | RecordCardPayload
  | ResultsTablePayload
  | WriteReceiptPayload
  | ViewPickerPayload;
