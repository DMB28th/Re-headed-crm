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
  provenance: WidgetProvenance;
}

export type WidgetPayload = RecordCardPayload | ResultsTablePayload;
