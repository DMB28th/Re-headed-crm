/**
 * view_exposures — per synced CRM saved view: exposed toggle, "Ask Claude with"
 * aliases, default flag (design 5a). CRM view filters are READ-ONLY from the
 * CRM; there is deliberately no parallel builder for THOSE. Custom lists are a
 * separate, Cardstack-native concept: admin-defined filters evaluated through
 * the adapter's search, stored here so both Studio and the MCP server see them.
 *
 * Migration notes:
 * - v1: initial schema.
 * - v2 (2026-07-11): added `customLists` (default []) — admin-defined lists with
 *   Cardstack-managed filters. `version` stays literal 1 (additive, old configs
 *   parse unchanged); custom list ids use the reserved "cl-" prefix and get an
 *   exposure entry in `views` like any CRM view.
 * - 2026-07-12: CustomListFilter.op gains "is_empty" | "not_empty" (data-quality
 *   lists: "deals with no amount"); these ops take no value, so `value` is now
 *   optional. Additive + optional — old configs parse unchanged.
 * - 2026-07-12b: CustomListFilter.op gains "in" | "not_in" with a new optional
 *   `values` array operand (one-click "Open deals" = stage not_in closedValues,
 *   instead of eleven neq rows). Additive + optional — old configs parse
 *   unchanged.
 * - 2026-07-20: CustomList gains optional creator + visibility metadata.
 *   Missing visibility defaults to "workspace" so existing admin-defined lists
 *   stay visible to everyone after the migration; newly created user lists are
 *   stamped server-side as private unless the creator shares them.
 * - 2026-08-10: gains `revision` (default 1) so exposures can be staged and
 *   rolled back like layouts (docs/studio-staging-model.md). Additive with a
 *   default — configs written before this parse unchanged and land on v1. The
 *   STORE envelope changed at the same time (bare config → draft/published/
 *   history); see the migration notes in file-store.ts / postgres-store.ts.
 */
import { z } from "zod";

export const ViewExposure = z.object({
  /** CRM saved-view id (HubSpot view / SFDC listview) or a "cl-" custom-list id. */
  viewId: z.string().min(1),
  /** Only exposed views are resolvable in chat. Private CRM views stay private. */
  exposed: z.boolean().default(false),
  /** "Ask Claude with" aliases, matched alongside the view's CRM name. */
  aliases: z.array(z.string().min(1)).default([]),
  /** Rendered when the ask names the object with no qualifier ("show my deals"). */
  isDefault: z.boolean().default(false),
});
export type ViewExposure = z.infer<typeof ViewExposure>;

export const CustomListFilter = z.object({
  field: z.string().min(1),
  op: z.enum([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "in",
    "not_in",
    "is_empty",
    "not_empty",
  ]),
  /** Single operand for eq/neq/gt/gte/lt/lte/contains. Absent for empties. */
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  /** Operand set for in / not_in (e.g. "stage is any of the closed stages"). */
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type CustomListFilter = z.infer<typeof CustomListFilter>;

/** Ops that take no value input. */
export const VALUELESS_LIST_OPS: CustomListFilter["op"][] = ["is_empty", "not_empty"];
/** Ops whose operand is a SET (multi-select), not a single value. */
export const MULTI_VALUE_LIST_OPS: CustomListFilter["op"][] = ["in", "not_in"];

/** Admin-defined list. Filters live in Cardstack (not the CRM) and are ANDed. */
export const CustomList = z.object({
  /** Reserved prefix distinguishes these from CRM view ids. */
  id: z.string().regex(/^cl-/),
  name: z.string().min(1),
  filters: z.array(CustomListFilter).default([]),
  sort: z.object({ field: z.string().min(1), dir: z.enum(["asc", "desc"]) }).optional(),
  /** Precomputed human summary (Studio writes it with field labels). */
  filterSummary: z.string().optional(),
  /**
   * Creator/app identity metadata. Old lists have neither field and therefore
   * parse as workspace-shared for backwards compatibility.
   */
  visibility: z.enum(["workspace", "private"]).default("workspace"),
  createdByUserId: z.string().optional(),
  createdByName: z.string().optional(),
  createdByEmail: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CustomList = z.infer<typeof CustomList>;

export const ViewExposuresConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  object: z.string().min(1),
  /** Publish revision — bumps on publish, indexes rollback history. */
  revision: z.number().int().positive().default(1),
  views: z.array(ViewExposure).default([]),
  customLists: z.array(CustomList).default([]),
});
export type ViewExposuresConfig = z.infer<typeof ViewExposuresConfig>;

/** Field label + value-label lookup, so summaries read in human terms. */
export type FilterLabels = Record<
  string,
  { label?: string; valueLabels?: Record<string, string> }
>;

const OP_PHRASE: Record<CustomListFilter["op"], string> = {
  eq: "is",
  neq: "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  in: "is any of",
  not_in: "is none of",
  is_empty: "is empty",
  not_empty: "is not empty",
};

/**
 * Human summary of a list's filters. Pass `labels` (from the object describe) to
 * resolve field api names and picklist ids to labels ("Deal Stage is Closed won"
 * instead of "dealstage eq 2540864"); without it, falls back to raw values so
 * existing zero-arg callers keep working.
 */
export function summarizeCustomFilters(list: CustomList, labels?: FilterLabels): string {
  if (!labels && list.filterSummary) return list.filterSummary;
  if (list.filters.length === 0) return "All records";
  return list.filters
    .map((f) => {
      const meta = labels?.[f.field];
      const fieldLabel = meta?.label ?? f.field;
      const phrase = OP_PHRASE[f.op] ?? f.op;
      if (VALUELESS_LIST_OPS.includes(f.op)) return `${fieldLabel} ${phrase}`;
      const label = (v: unknown) => meta?.valueLabels?.[String(v)] ?? String(v);
      if (MULTI_VALUE_LIST_OPS.includes(f.op)) {
        const vals = f.values ?? [];
        // Keep long sets readable ("is none of Closed won, Closed lost +3").
        const shown = vals.slice(0, 3).map(label).join(", ");
        const extra = vals.length > 3 ? ` +${vals.length - 3}` : "";
        return `${fieldLabel} ${phrase} ${shown}${extra}`.trim();
      }
      const raw = f.value;
      const valueLabel = raw !== null && raw !== undefined ? label(raw) : "";
      return `${fieldLabel} ${phrase} ${valueLabel}`.trim();
    })
    .join(" · ");
}
