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
  CrmTask,
  FieldDescribe,
  RecentRecord,
  RecordPage,
} from "./crm-types.js";
import type { HomeCardBlock } from "./home-card.js";

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
  /** CRM user writes are attributed to ("Written as Demo rep" in the diff footer). */
  connectedUser?: string;
  /** ISO timestamp of when this payload's data was read from the CRM — lets
   *  the model reason about staleness instead of guessing. */
  fetchedAt?: string;
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

/** structuredContent for crm_home → the home-card widget (design 7a). */
export interface HomeListTile {
  viewId: string;
  name: string;
  filterSummary: string;
  /** null = the count could not be loaded (rate limit / scope) — render "—", never a fake 0. */
  count: number | null;
  error?: boolean;
}

export interface HomeCardPayload {
  kind: "home-card";
  blocks: HomeCardBlock[];
  lists: HomeListTile[];
  recent: RecentRecord[];
  tasks: CrmTask[];
  capabilities: { writeEnabled: boolean };
  provenance: WidgetProvenance;
}

/**
 * structuredContent for crm_flow_start / crm_flow_continue → the flow-run widget
 * (design 10a, flow-as-card-state). The HANDOFF rung: inputs are resolved
 * server-side (context/field/literal/selection), any `ask` inputs are collected
 * in chat, and the rep opens the flow in the CRM via the host's openLink. The
 * server is stateless — continue re-resolves from the answers the model passes.
 */
export interface FlowRunResolvedInput {
  name: string;
  value: CrmFieldValue | CrmFieldValue[];
  source: "context" | "field" | "literal" | "selection" | "ask";
}

export interface FlowRunPendingInput {
  name: string;
  prompt: string;
  required: boolean;
}

export type FlowRunStatus = "ready" | "needs-input" | "launched" | "cancelled";

export interface FlowRunPayload {
  kind: "flow-run";
  /** Correlation id for audit + continue calls; NOT server-persisted state. */
  actionSessionId: string;
  flowApiName: string;
  flowLabel: string;
  screens: number;
  writesSummary: string;
  renderMode: "auto" | "native" | "embedded" | "handoff";
  /** Handoff target — open the flow in the CRM. null when the CRM can't provide one. */
  launchUrl: string | null;
  resolvedInputs: FlowRunResolvedInput[];
  pendingInputs: FlowRunPendingInput[];
  /** "needs-input" = required asks unfilled; "ready" = launchable. */
  status: FlowRunStatus;
  provenance: WidgetProvenance;
}

/**
 * Typed tool failure (design 1e): widgets render an actionable error card —
 * "unauthorized" gets the re-auth treatment, everything else gets Retry via
 * the embedded original call.
 */
export interface ErrorPayload {
  kind: "error";
  reason: "unauthorized" | "crm-unavailable" | "not-found" | "unknown";
  /** What happened + what to do, in the CRM's vocabulary. */
  message: string;
  crmLabel?: string;
  retry?: { tool: string; args: Record<string, unknown> };
}

export type WidgetPayload =
  | RecordCardPayload
  | ResultsTablePayload
  | WriteReceiptPayload
  | ViewPickerPayload
  | HomeCardPayload
  | FlowRunPayload
  | ErrorPayload;
