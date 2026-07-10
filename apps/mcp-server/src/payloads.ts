/**
 * Payload assembly: adapter data + layout config → denylist-filtered
 * structuredContent. This is the ONLY place widget payloads are built, so the
 * server-side enforcement rule has a single choke point.
 */
import {
  applyDenylist,
  buildCapabilities,
  buildMeta,
  filterPage,
  filterRecord,
  isDenied,
  recordCardFieldPaths,
  type CrmRecord,
  type DescribeMetaMap,
  type FieldDescribe,
  type LayoutConfig,
  type ObjectDescribe,
  type RecordCardPayload,
  type RecordPage,
  type ResultsTablePayload,
  type WidgetProvenance,
} from "@cardstack/core";
import type { CrmAdapter } from "@cardstack/crm-adapters";

const CRM_LABELS = { salesforce: "Salesforce", hubspot: "HubSpot" } as const;

export function provenanceFor(config: LayoutConfig): WidgetProvenance {
  return {
    crm: config.crm,
    crmLabel: CRM_LABELS[config.crm],
    ...(config.name ? { layoutName: config.name } : {}),
    layoutRevision: config.revision,
  };
}

function describeMap(describe: ObjectDescribe): Map<string, FieldDescribe> {
  return new Map(describe.fields.map((f) => [f.api, f]));
}

export async function buildResultsTablePayload(args: {
  adapter: CrmAdapter;
  config: LayoutConfig;
  page: RecordPage;
  title: string;
  savedViewName?: string;
}): Promise<ResultsTablePayload> {
  const config = applyDenylist(args.config);
  const describe = await args.adapter.describeObject(config.object);
  const allowed = new Set(config.listView.columns);
  return {
    kind: "results-table",
    object: config.object,
    title: args.title,
    listView: config.listView,
    meta: buildMeta(describe.fields, allowed),
    page: filterPage(args.page, allowed),
    ...(args.savedViewName ? { savedViewName: args.savedViewName } : {}),
    provenance: {
      ...provenanceFor(config),
      connectedUser: await args.adapter.getConnectedUser(),
    },
  };
}

export async function buildRecordCardPayload(args: {
  adapter: CrmAdapter;
  config: LayoutConfig;
  record: CrmRecord;
}): Promise<RecordCardPayload> {
  const { adapter } = args;
  const config = applyDenylist(args.config);
  const describe = await adapter.describeObject(config.object);
  const allowed = new Set(recordCardFieldPaths(config));

  const related: Record<string, RecordPage> = {};
  for (const rel of config.recordCard.relatedLists) {
    const page = await adapter.getRelated(args.record.id, rel);
    related[rel.relationship] = filterPage(page, new Set(rel.columns));
  }

  const activity = await adapter.getActivity(config.object, args.record.id, 6);

  return {
    kind: "record-card",
    layout: config,
    meta: buildMeta(describe.fields, allowed),
    record: filterRecord(args.record, allowed),
    related,
    activity,
    capabilities: buildCapabilities(config, describeMap(describe)),
    provenance: {
      ...provenanceFor(config),
      connectedUser: await adapter.getConnectedUser(),
    },
  };
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

export function assertNotDenied(fields: string[], config: LayoutConfig): void {
  for (const field of fields) {
    if (isDenied(field, config.permissions.fieldDenylist)) {
      throw new Error(`Field "${field}" is not exposed for ${config.object}.`);
    }
  }
}
