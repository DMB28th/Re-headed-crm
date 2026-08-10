import type {
  CustomScreenConfig,
  FlowRenderModeConfig,
  HomeCardConfig,
  LayoutConfig,
  ViewExposuresConfig,
} from "@cardstack/core";

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

/** Compare two fingerprint maps: + added / − removed / ~ changed. */
function diffUnits(before: Map<string, Unit>, after: Map<string, Unit>): LayoutDiff {
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

export const isEmptyDiff = (diff: LayoutDiff): boolean =>
  diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

/** Publish-modal diff (design 2b): + added / − removed / ~ changed vs published. */
export function diffLayouts(published: LayoutConfig | null, draft: LayoutConfig): LayoutDiff {
  return diffUnits(published ? fingerprint(published) : new Map<string, Unit>(), fingerprint(draft));
}

/**
 * Resolves view / custom-list / flow ids to the names an admin recognizes.
 * The store is CRM-agnostic and holds ids only, so Studio passes this in from
 * the adapter; every lookup falls back to the raw id.
 */
export type DiffLabels = Record<string, string>;

/**
 * View-exposure diff. Only EXPOSED views are fingerprinted: reps can't see an
 * unexposed one, so toggling exposure reads as "+ list · Pipeline" rather than
 * "~ …(exposed: false → true)", and rows an admin never touched stay silent.
 *
 * Both views and custom lists are keyed by resolved NAME, so renaming a custom
 * list reads as one removed + one added row. That's deliberate: the name is the
 * only handle an admin has on a list, and "− Stale deals / + Aging deals" is
 * clearer than a change row against an opaque "cl-" id.
 */
export function diffViewExposures(
  published: ViewExposuresConfig | null,
  draft: ViewExposuresConfig,
  labels: DiffLabels = {},
): LayoutDiff {
  const fp = (config: ViewExposuresConfig | null): Map<string, Unit> => {
    const map = new Map<string, Unit>();
    if (!config) return map;
    const customs = new Map(config.customLists.map((list) => [list.id, list]));
    for (const view of config.views) {
      if (!view.exposed) continue;
      const custom = customs.get(view.viewId);
      const name = labels[view.viewId] ?? custom?.name ?? view.viewId;
      const key = custom ? `custom list · ${name}` : `list · ${name}`;
      map.set(key, {
        fp: JSON.stringify({
          aliases: [...view.aliases].sort(),
          isDefault: view.isDefault,
          ...(custom
            ? {
                filters: custom.filters,
                sort: custom.sort ?? null,
                visibility: custom.visibility,
              }
            : {}),
        }),
        describeChange: (b, a) => {
          const before = JSON.parse(b) as Record<string, unknown>;
          const after = JSON.parse(a) as Record<string, unknown>;
          const parts: string[] = [];
          if (JSON.stringify(before.filters) !== JSON.stringify(after.filters)) {
            parts.push("filters changed");
          }
          if (JSON.stringify(before.sort) !== JSON.stringify(after.sort)) parts.push("sort changed");
          if (before.visibility !== after.visibility) {
            parts.push(`visibility ${String(before.visibility)} → ${String(after.visibility)}`);
          }
          if (before.isDefault !== after.isDefault) {
            parts.push(after.isDefault ? "now the default" : "no longer the default");
          }
          const beforeAliases = (before.aliases as string[]).join(", ");
          const afterAliases = (after.aliases as string[]).join(", ");
          if (beforeAliases !== afterAliases) {
            parts.push(`aliases ${beforeAliases || "none"} → ${afterAliases || "none"}`);
          }
          return parts.length > 0 ? ` (${parts.join(" · ")})` : " (changed)";
        },
      });
    }
    return map;
  };
  return diffUnits(fp(published), fp(draft));
}

/** Flow render-policy diff: "~ flow · Renewal approval: auto → handoff". */
export function diffFlowRenderModes(
  published: FlowRenderModeConfig | null,
  draft: FlowRenderModeConfig,
  labels: DiffLabels = {},
): LayoutDiff {
  const fp = (config: FlowRenderModeConfig | null): Map<string, Unit> => {
    const map = new Map<string, Unit>();
    if (!config) return map;
    map.set(`flow · ${labels[config.flowApiName] ?? config.flowApiName}`, {
      fp: JSON.stringify({ mode: config.mode, fallback: config.fallback }),
      describeChange: (b, a) => {
        const before = JSON.parse(b) as { mode: string; fallback: string };
        const after = JSON.parse(a) as { mode: string; fallback: string };
        const parts: string[] = [];
        if (before.mode !== after.mode) parts.push(`${before.mode} → ${after.mode}`);
        if (before.fallback !== after.fallback) {
          parts.push(`fallback ${before.fallback} → ${after.fallback}`);
        }
        return parts.length > 0 ? `: ${parts.join(" · ")}` : " (changed)";
      },
    });
    return map;
  };
  return diffUnits(fp(published), fp(draft));
}

/** Home-card diff, per launcher block: "+ home · follow-ups", "~ home · recents: 3 → 5". */
export function diffHomeCards(
  published: HomeCardConfig | null,
  draft: HomeCardConfig,
): LayoutDiff {
  const LABEL: Record<HomeCardConfig["blocks"][number]["type"], string> = {
    lists: "lists",
    recent: "recents",
    followups: "follow-ups",
  };
  const fp = (config: HomeCardConfig | null): Map<string, Unit> => {
    const map = new Map<string, Unit>();
    if (!config) return map;
    for (const block of config.blocks) {
      const { type, ...rest } = block;
      map.set(`home · ${LABEL[type]}`, {
        fp: JSON.stringify(rest),
        describeChange: (b, a) => {
          const before = JSON.parse(b) as Record<string, unknown>;
          const after = JSON.parse(a) as Record<string, unknown>;
          const parts: string[] = [];
          for (const field of ["limit", "maxTiles"] as const) {
            if (before[field] !== after[field] && after[field] !== undefined) {
              parts.push(`${String(before[field])} → ${String(after[field])}`);
            }
          }
          if (before.source !== after.source) {
            parts.push(`source ${String(before.source)} → ${String(after.source)}`);
          }
          if (JSON.stringify(before.viewIds) !== JSON.stringify(after.viewIds)) {
            const n = (after.viewIds as unknown[] | undefined)?.length ?? 0;
            parts.push(`${n} list(s) picked`);
          }
          return parts.length > 0 ? `: ${parts.join(" · ")}` : " (changed)";
        },
      });
    }
    return map;
  };
  return diffUnits(fp(published), fp(draft));
}


/**
 * Custom-screen diff. The body is authored SDK source, so there is no useful
 * structural fingerprint — the row says the label changed, the source changed,
 * or both, and the editor is where you read the actual code.
 */
export function diffCustomScreens(
  published: CustomScreenConfig | null,
  draft: CustomScreenConfig,
): LayoutDiff {
  if (!published) return { added: [`screen · ${draft.label}`], removed: [], changed: [] };
  const parts: string[] = [];
  if (published.label !== draft.label) parts.push(`renamed: ${published.label} → ${draft.label}`);
  if (published.source !== draft.source) parts.push("source changed");
  if (parts.length === 0) return { added: [], removed: [], changed: [] };
  return { added: [], removed: [], changed: [`screen · ${draft.label} (${parts.join(" · ")})`] };
}
