/**
 * Server-side field exposure enforcement (CLAUDE.md rule 2).
 *
 * The denylist is enforced HERE, before anything reaches structuredContent.
 * A field is denied when the denylist contains its full dot-path or the
 * path's leading segment ("Commission__c" also denies "Commission__c.Name").
 */
import type { LayoutConfig } from "./layout-config.js";
import type { CrmRecord, FieldDescribe, RecordPage } from "./crm-types.js";
import type { DescribeMetaMap, WidgetCapabilities } from "./payload.js";

export function isDenied(fieldPath: string, denylist: readonly string[]): boolean {
  if (denylist.length === 0) return false;
  const head = fieldPath.split(".")[0]!;
  return denylist.includes(fieldPath) || denylist.includes(head);
}

/** Every field path the config references for the record card (header + sections). */
export function recordCardFieldPaths(config: LayoutConfig): string[] {
  const { header, sections } = config.recordCard;
  const paths = [header.title, header.subtitle, header.badge].filter(
    (p): p is string => !!p,
  );
  for (const section of sections) {
    for (const field of section.fields) paths.push(field.api);
  }
  return [...new Set(paths)];
}

/**
 * Strip denied fields out of a layout config before it ships to the widget.
 * Sections that end up empty are dropped; header slots fall back sensibly.
 * The denylist itself is also blanked — even the NAMES of hidden fields must
 * not reach the iframe (enforcement already happened here, server-side).
 */
export function applyDenylist(config: LayoutConfig): LayoutConfig {
  const deny = config.permissions.fieldDenylist;
  if (deny.length === 0) return config;

  const header = { ...config.recordCard.header };
  if (header.subtitle && isDenied(header.subtitle, deny)) delete header.subtitle;
  if (header.badge && isDenied(header.badge, deny)) delete header.badge;

  return {
    ...config,
    permissions: { ...config.permissions, fieldDenylist: [] },
    listView: {
      ...config.listView,
      columns: config.listView.columns.filter((c) => !isDenied(c, deny)),
    },
    recordCard: {
      ...config.recordCard,
      header,
      sections: config.recordCard.sections
        .map((s) => ({
          ...s,
          fields: s.fields.filter((f) => !isDenied(f.api, deny)),
        }))
        .filter((s) => s.fields.length > 0),
      relatedLists: config.recordCard.relatedLists.map((rl) => ({
        ...rl,
        columns: rl.columns.filter((c) => !isDenied(c, deny)),
      })),
    },
  };
}

/** Keep only allowed field paths on a record (id always survives). */
export function filterRecord(
  record: CrmRecord,
  allowed: ReadonlySet<string>,
): CrmRecord {
  const fields: CrmRecord["fields"] = {};
  for (const [key, value] of Object.entries(record.fields)) {
    if (allowed.has(key)) fields[key] = value;
  }
  return { id: record.id, fields };
}

export function filterPage(page: RecordPage, allowed: ReadonlySet<string>): RecordPage {
  return { ...page, rows: page.rows.map((r) => filterRecord(r, allowed)) };
}

/** Describe metadata for exposed fields only. */
export function buildMeta(
  describeFields: readonly FieldDescribe[],
  allowed: ReadonlySet<string>,
): DescribeMetaMap {
  const meta: DescribeMetaMap = {};
  for (const field of describeFields) {
    if (allowed.has(field.api)) meta[field.api] = field;
  }
  return meta;
}

/**
 * Editable = config says editable AND writes enabled AND not denied AND the
 * CRM itself doesn't mark it read-only (FLS/formula — the CRM is the floor).
 */
export function buildCapabilities(
  config: LayoutConfig,
  describe: ReadonlyMap<string, FieldDescribe>,
): WidgetCapabilities {
  if (!config.permissions.writeEnabled) {
    return { writeEnabled: false, editableFields: [] };
  }
  const editable: string[] = [];
  for (const section of config.recordCard.sections) {
    for (const field of section.fields) {
      if (!field.editable) continue;
      if (field.api.includes(".")) continue; // parent-object paths are read-only
      if (isDenied(field.api, config.permissions.fieldDenylist)) continue;
      if (describe.get(field.api)?.readOnly) continue;
      editable.push(field.api);
    }
  }
  return { writeEnabled: true, editableFields: [...new Set(editable)] };
}
