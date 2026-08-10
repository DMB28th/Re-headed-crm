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
import type { FlowPendingWrite, FlowRenderScreen } from "./flow-interview.js";

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
  /** Deep link to this record in the CRM's own UI ("View in Salesforce"). */
  crmUrl?: string;
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

/** One typeahead match for a reference-field lookup editor. */
export interface LookupOption {
  id: string;
  label: string;
}

/** structuredContent for crm_lookup_search → consumed by the lookup editor. */
export interface LookupOptionsPayload {
  kind: "lookup-options";
  /** The TARGET object that was searched (Account, User, …). */
  object: string;
  options: LookupOption[];
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

/**
 * How a write came to be — the server's own answer, not the caller's claim
 * (CLAUDE.md hard rule 8: the confirmation diff is the product's spine).
 *
 * - `widget`: the caller presented a valid confirm token, so the server itself
 *   computed this exact diff and handed it to a rep who confirmed it.
 * - `model`: no token. A legitimate model-driven write, but nobody was shown a
 *   diff first. The audit log must not blur the two.
 */
export interface WriteConfirmation {
  via: "widget" | "model";
  /** Token id (jti) — ties the audit entry to the preview that minted it. */
  confirmationId?: string;
  /** When the diff the rep confirmed was generated. */
  previewedAt?: string;
}

/**
 * structuredContent for crm_preview_update — the server-computed confirmation
 * diff (design 1c). The `before` values are read server-side at preview time,
 * so the diff a rep confirms is the CRM's truth rather than whatever the card
 * happened to be holding.
 */
export interface UpdatePreviewPayload {
  kind: "update-preview";
  object: string;
  recordId: string;
  recordName: string;
  /** Only fields whose value actually changes; an empty diff is not writable. */
  changes: { field: string; label: string; before: CrmFieldValue; after: CrmFieldValue }[];
  /** Opaque, signed, single-use. Pass back to crm_update_record verbatim. */
  confirmToken: string;
  /** ISO timestamp the token stops verifying — the widget can warn before it lapses. */
  expiresAt: string;
  provenance: WidgetProvenance;
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

export type FlowRunStatus =
  | "ready"
  | "needs-input"
  | "launched"
  | "cancelled"
  // NATIVE rung (interview rendered in-chat by the flow interpreter):
  | "in-progress"
  | "confirm-write"
  | "finished";

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
  // NATIVE rung: the interpreter walks the flow definition and the widget
  // renders each screen in-chat. State is an opaque (HMAC-signed when the
  // server has a key) token the widget passes back on crm_flow_continue —
  // the server persists nothing.
  /** Record context the widget echoes back on continue calls. */
  object?: string;
  recordId?: string;
  /** The screen to render, when status is "in-progress". */
  screen?: FlowRenderScreen | null;
  /** Opaque interview state; echo back verbatim on continue. */
  interviewState?: string | null;
  /** The write awaiting confirmation, when status is "confirm-write" (rule 8). */
  pendingWrite?: FlowPendingWrite | null;
  /** Closing summary, when status is "finished". */
  finishedSummary?: string | null;
  /** True when the flow ended on a custom error. */
  finishedFailed?: boolean;
  /** Static renderability: full / partial / handoff (from analyzeFlowSupport). */
  supportLevel?: "full" | "partial" | "handoff" | null;
  /** Why the interview handed off mid-run (unsupported element), if it did. */
  degradeReason?: string | null;
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
  | UpdatePreviewPayload
  | WriteReceiptPayload
  | ViewPickerPayload
  | HomeCardPayload
  | FlowRunPayload
  | ErrorPayload;
