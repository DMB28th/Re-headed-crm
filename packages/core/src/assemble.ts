/**
 * Payload assembly: CRM data + layout config → denylist-filtered
 * structuredContent. THE single choke point for server-side field exposure
 * (CLAUDE.md rule 2). Lives in core (not the server app) so Studio's live
 * preview runs the exact same assembly against the mock adapter — one
 * codepath, guaranteed fidelity.
 */
import type { LayoutConfig, RelatedListConfig } from "./layout-config.js";
import type {
  ActivityEntry,
  CrmRecord,
  FieldDescribe,
  ObjectDescribe,
  ObjectSummary,
  RecentRecord,
  RecordPage,
} from "./crm-types.js";
import type {
  DescribeMetaMap,
  FlowRunPayload,
  FlowRunResolvedInput,
  RecordCardPayload,
  ResultsTablePayload,
  WidgetProvenance,
} from "./payload.js";
import {
  applyDenylist,
  buildCapabilities,
  buildMeta,
  filterPage,
  filterRecord,
  recordCardFieldPaths,
} from "./filtering.js";

/**
 * The slice of CrmAdapter that assembly needs. Structural, so any adapter
 * satisfies it without core depending on the adapters package.
 */
export interface PayloadSource {
  describeObject(objectApi: string): Promise<ObjectDescribe>;
  getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage>;
  getActivity(objectApi: string, id: string, limit: number): Promise<ActivityEntry[]>;
  getConnectedUser(): Promise<string>;
}

const CRM_LABELS = { salesforce: "Salesforce", hubspot: "HubSpot" } as const;

/**
 * Runtime all-fields layout for drill-through into an object no admin has
 * configured (a related list's line item, a reference field's target).
 * Strictly read-only — writes stay layout-gated — and flagged so the widget
 * renders a field-name filter instead of curated sections. Shared by the MCP
 * server and Studio's preview (one codepath).
 */
export function genericLayoutConfig(args: {
  tenantId: string;
  crm: LayoutConfig["crm"];
  object: string;
  describe: ObjectDescribe;
}): LayoutConfig {
  const { tenantId, crm, object, describe } = args;
  const nameField =
    describe.fields.find((f) => f.api === "Name")?.api ??
    describe.fields.find((f) => f.api === "CaseNumber")?.api ??
    describe.fields.find((f) => f.type === "string")?.api ??
    "Id";
  return {
    version: 1,
    tenantId,
    crm,
    object,
    audience: "default",
    name: `${describe.label} · all fields`,
    revision: 1,
    generatedFallback: true,
    listView: { columns: [nameField], rowActions: [] },
    recordCard: {
      header: { title: nameField },
      actions: [],
      sections: [
        {
          label: "All fields",
          columns: 2,
          fields: describe.fields
            .filter((f) => f.api !== "Id")
            .map((f) => ({ api: f.api, editable: false })),
        },
      ],
      relatedLists: [],
    },
    permissions: { writeEnabled: false, fieldDenylist: [], requireConfirmation: true },
  };
}

export function provenanceFor(config: LayoutConfig): WidgetProvenance {
  return {
    crm: config.crm,
    crmLabel: CRM_LABELS[config.crm],
    ...(config.name ? { layoutName: config.name } : {}),
    layoutRevision: config.revision,
    fetchedAt: new Date().toISOString(),
  };
}

export async function buildResultsTablePayload(args: {
  source: PayloadSource;
  config: LayoutConfig;
  page: RecordPage;
  title: string;
  savedViewName?: string;
  savedViewId?: string;
  savedViewFilterSummary?: string;
}): Promise<ResultsTablePayload> {
  const config = applyDenylist(args.config);
  const describe = await args.source.describeObject(config.object);
  const allowed = new Set(config.listView.columns);
  return {
    kind: "results-table",
    object: config.object,
    title: args.title,
    listView: config.listView,
    meta: buildMeta(describe.fields, allowed),
    page: filterPage(args.page, allowed),
    ...(args.savedViewName ? { savedViewName: args.savedViewName } : {}),
    ...(args.savedViewId ? { savedViewId: args.savedViewId } : {}),
    ...(args.savedViewFilterSummary
      ? { savedViewFilterSummary: args.savedViewFilterSummary }
      : {}),
    provenance: {
      ...provenanceFor(config),
      connectedUser: await args.source.getConnectedUser(),
    },
  };
}

export async function buildRecordCardPayload(args: {
  source: PayloadSource;
  config: LayoutConfig;
  record: CrmRecord;
}): Promise<RecordCardPayload> {
  const { source } = args;
  const denied = applyDenylist(args.config);
  // Render-side hygiene: "Id" and the FK back to the parent are useful for
  // fetching but noise as columns (the FK repeats the parent's own name on
  // every row) — strip them from the layout the widget receives.
  const config = {
    ...denied,
    recordCard: {
      ...denied.recordCard,
      relatedLists: denied.recordCard.relatedLists.map((rel) => ({
        ...rel,
        columns: rel.columns.filter(
          (c) => c !== "Id" && c !== (rel.foreignKey ?? rel.relationship),
        ),
      })),
    },
  };
  const describe = await source.describeObject(config.object);
  const allowed = new Set(recordCardFieldPaths(config));

  const related: Record<string, RecordPage> = {};
  for (const rel of config.recordCard.relatedLists) {
    // One broken related list (missing scope, dropped association) degrades
    // its own section to empty — it must never sink the whole card.
    const page = await source
      .getRelated(args.record.id, rel)
      .catch((): RecordPage => ({ rows: [], hasMore: false, total: 0 }));
    related[rel.relationship] = filterPage(page, new Set(rel.columns));
  }

  const activity = await source.getActivity(config.object, args.record.id, 6);
  const describeMap = new Map<string, FieldDescribe>(
    describe.fields.map((f) => [f.api, f]),
  );

  return {
    kind: "record-card",
    layout: config,
    meta: buildMeta(describe.fields, allowed),
    record: filterRecord(args.record, allowed),
    related,
    activity,
    capabilities: buildCapabilities(config, describeMap),
    provenance: {
      ...provenanceFor(config),
      connectedUser: await source.getConnectedUser(),
    },
  };
}

/**
 * Assemble the flow-run payload (design 10a). The HANDOFF rung: `resolved`
 * inputs come from resolveActionInputs; `pending` are the `ask` inputs chat
 * must still collect. The launch button is withheld until every required input
 * is in — a rep should never open a flow that will immediately reject.
 */
export function buildFlowRunPayload(args: {
  actionSessionId: string;
  flow: { api: string; label: string; screens: number; writesSummary: string };
  renderMode: FlowRunPayload["renderMode"];
  launchUrl: string | null;
  resolved: FlowRunResolvedInput[];
  pending: { name: string; prompt: string; required: boolean }[];
  missing: string[];
  provenance: WidgetProvenance;
}): FlowRunPayload {
  const blocked = args.pending.some((p) => p.required) || args.missing.length > 0;
  return {
    kind: "flow-run",
    actionSessionId: args.actionSessionId,
    flowApiName: args.flow.api,
    flowLabel: args.flow.label,
    screens: args.flow.screens,
    writesSummary: args.flow.writesSummary,
    renderMode: args.renderMode,
    launchUrl: blocked ? null : args.launchUrl,
    resolvedInputs: args.resolved,
    pendingInputs: args.pending,
    status: blocked ? "needs-input" : "ready",
    provenance: args.provenance,
  };
}

/**
 * Attach the singular display label ("Company") to each recent record for the
 * home card's type pill — the widget must never derive it by string-hacking
 * the object api. listObjects() is cheap (adapters cache it); any failure
 * leaves the records unlabeled and the widget falls back to the api string.
 */
export async function labelRecentRecords(
  recent: RecentRecord[],
  listObjects: () => Promise<ObjectSummary[]>,
): Promise<RecentRecord[]> {
  if (recent.length === 0) return recent;
  const objects = await listObjects().catch((): ObjectSummary[] => []);
  const labels = new Map(objects.map((o) => [o.api, o.label]));
  return recent.map((r) => {
    const objectLabel = labels.get(r.object);
    return objectLabel ? { ...r, objectLabel } : r;
  });
}

/**
 * V3 (Contextary crossover): the CRM's own field descriptions ride along in the
 * model-facing content so the model interprets values correctly. Never the full
 * record — the widget carries the detail.
 */
export function fieldNotes(meta: DescribeMetaMap, max = 4): string {
  const notes = Object.values(meta)
    .filter((f) => f.description)
    .slice(0, max)
    .map((f) => `${f.label}: ${f.description}`);
  return notes.length > 0 ? ` Field notes — ${notes.join(" · ")}` : "";
}
