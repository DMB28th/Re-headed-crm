import type { LayoutConfig } from "@cardstack/core";

export interface LayoutDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * A diffable unit: a stable identity key, a fingerprint value, and an optional
 * humanizer that turns before/after fingerprints into a readable suffix for
 * the publish modal's "~ changed" rows (design 2b — the diff must be as
 * legible as the write confirmations reps sign).
 */
interface Unit {
  fp: string;
  describeChange?: (before: string, after: string) => string;
}

type FieldFp = {
  editable: boolean;
  control: string | undefined;
  required: boolean;
  section: string;
};
type RelatedFp = { columns: string[]; limit: number };
type ActionFp = { label: string; inputs?: unknown };

function fingerprint(config: LayoutConfig): Map<string, Unit> {
  const map = new Map<string, Unit>();
  const { header, sections, relatedLists, actions } = config.recordCard;

  // Header, per slot: "~ header badge: dealstage → priority".
  for (const slot of ["title", "subtitle", "badge"] as const) {
    map.set(`header ${slot}`, {
      fp: header[slot] ?? "—",
      describeChange: (b, a) => `: ${b} → ${a}`,
    });
  }

  // Sections keyed by INDEX (labels can duplicate) so a rename is one "~ section
  // renamed" row, not a teardown, and two same-named sections don't collide.
  sections.forEach((section, i) => {
    map.set(`section ${i}`, {
      fp: section.label,
      describeChange: (b, a) => ` renamed: ${b} → ${a}`,
    });
  });

  // Fields keyed by api (deduped by suffix if the same api appears twice). The
  // owning section lives INSIDE the fingerprint, so moving a field between
  // sections reads as one changed row, not add+remove.
  const seen = new Map<string, number>();
  for (const section of sections) {
    for (const field of section.fields) {
      const n = seen.get(field.api) ?? 0;
      seen.set(field.api, n + 1);
      const key = n === 0 ? field.api : `${field.api} #${n + 1}`;
      map.set(key, {
        fp: JSON.stringify({
          editable: field.editable,
          control: field.control,
          required: field.required ?? false,
          section: section.label,
        } satisfies FieldFp),
        describeChange: (b, a) => {
          const before = JSON.parse(b) as FieldFp;
          const after = JSON.parse(a) as FieldFp;
          if (before.section !== after.section) {
            return ` (moved: ${before.section} → ${after.section})`;
          }
          if (before.editable !== after.editable) {
            return after.editable ? " (now editable)" : " (now read-only)";
          }
          if (before.required !== after.required) {
            return after.required ? " (now required)" : " (no longer required)";
          }
          if (before.control !== after.control) {
            return ` (control: ${before.control ?? "auto"} → ${after.control ?? "auto"})`;
          }
          return " (changed)";
        },
      });
    }
  }

  map.set("list columns", {
    fp: config.listView.columns.join(", "),
    describeChange: (b, a) => `: ${b} → ${a}`,
  });

  // Related lists, per relationship: "~ related list · contacts: shows 3 → 5".
  for (const rel of relatedLists) {
    map.set(`related list · ${rel.relationship}`, {
      fp: JSON.stringify({ columns: rel.columns, limit: rel.limit } satisfies RelatedFp),
      describeChange: (b, a) => {
        const before = JSON.parse(b) as RelatedFp;
        const after = JSON.parse(a) as RelatedFp;
        const parts: string[] = [];
        if (before.limit !== after.limit) parts.push(`shows ${before.limit} → ${after.limit}`);
        if (before.columns.join(",") !== after.columns.join(",")) {
          parts.push(`columns ${before.columns.join(", ")} → ${after.columns.join(", ")}`);
        }
        return parts.length > 0 ? `: ${parts.join(" · ")}` : " (changed)";
      },
    });
  }

  // Actions keyed by identity (type + target), label as the mutable value:
  // "~ action · create contacts: “Add contact” → “New contact”".
  for (const action of actions) {
    const key =
      action.type === "update_record"
        ? "action · save"
        : action.type === "create_related"
          ? `action · create ${action.object}`
          : action.type === "quick_action"
            ? `action · quick action ${action.actionApiName}`
            : `action · flow ${action.flowApiName}`;
    map.set(key, {
      fp: JSON.stringify({
        label: action.label,
        ...(action.type === "screen_flow" ? { inputs: action.inputs } : {}),
      } satisfies ActionFp),
      describeChange: (b, a) => {
        const before = JSON.parse(b) as ActionFp;
        const after = JSON.parse(a) as ActionFp;
        const labelChanged = before.label !== after.label;
        const inputsChanged = JSON.stringify(before.inputs ?? {}) !== JSON.stringify(after.inputs ?? {});
        if (labelChanged && inputsChanged) {
          return `: “${before.label}” → “${after.label}” · inputs changed`;
        }
        if (labelChanged) return `: “${before.label}” → “${after.label}”`;
        if (inputsChanged) return " (inputs changed)";
        return " (changed)";
      },
    });
  }

  // Permissions, granularized: a writes toggle plus one row per denylisted
  // field, so publishes read "+ denylisted commission", never "~ permissions".
  map.set("writes from chat", {
    fp: config.permissions.writeEnabled ? "on" : "off",
    describeChange: (b, a) => `: ${b} → ${a}`,
  });
  for (const field of config.permissions.fieldDenylist) {
    map.set(`denylisted ${field}`, { fp: "•" });
  }

  return map;
}

/** Publish-modal diff (design 2b): + added / − removed / ~ changed vs published. */
export function diffLayouts(published: LayoutConfig | null, draft: LayoutConfig): LayoutDiff {
  const before = published ? fingerprint(published) : new Map<string, Unit>();
  const after = fingerprint(draft);
  const diff: LayoutDiff = { added: [], removed: [], changed: [] };
  for (const [key, unit] of after) {
    const prev = before.get(key);
    if (!prev) diff.added.push(key);
    else if (prev.fp !== unit.fp) {
      const suffix = unit.describeChange?.(prev.fp, unit.fp) ?? "";
      diff.changed.push(`${key}${suffix}`);
    }
  }
  for (const key of before.keys()) {
    if (!after.has(key)) diff.removed.push(key);
  }
  return diff;
}
