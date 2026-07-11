import type { LayoutConfig } from "@cardstack/core";

export interface LayoutDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Card-field paths keyed for diffing: "Section/field" plus header + list columns. */
function fingerprint(config: LayoutConfig): Map<string, string> {
  const map = new Map<string, string>();
  const { header, sections, relatedLists, actions } = config.recordCard;
  map.set("header", JSON.stringify(header));
  for (const section of sections) {
    for (const field of section.fields) {
      map.set(`${section.label} · ${field.api}`, JSON.stringify(field));
    }
  }
  map.set("list columns", JSON.stringify(config.listView.columns));
  map.set("related lists", JSON.stringify(relatedLists));
  map.set("actions", JSON.stringify(actions));
  map.set("permissions", JSON.stringify(config.permissions));
  return map;
}

/** Publish-modal diff (design 2b): + added / − removed / ~ changed vs published. */
export function diffLayouts(published: LayoutConfig | null, draft: LayoutConfig): LayoutDiff {
  const before = published ? fingerprint(published) : new Map<string, string>();
  const after = fingerprint(draft);
  const diff: LayoutDiff = { added: [], removed: [], changed: [] };
  for (const [key, value] of after) {
    if (!before.has(key)) diff.added.push(key);
    else if (before.get(key) !== value) diff.changed.push(key);
  }
  for (const key of before.keys()) {
    if (!after.has(key)) diff.removed.push(key);
  }
  return diff;
}
