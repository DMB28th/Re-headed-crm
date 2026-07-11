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
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type CustomListFilter = z.infer<typeof CustomListFilter>;

/** Admin-defined list. Filters live in Cardstack (not the CRM) and are ANDed. */
export const CustomList = z.object({
  /** Reserved prefix distinguishes these from CRM view ids. */
  id: z.string().regex(/^cl-/),
  name: z.string().min(1),
  filters: z.array(CustomListFilter).default([]),
  sort: z.object({ field: z.string().min(1), dir: z.enum(["asc", "desc"]) }).optional(),
  /** Precomputed human summary (Studio writes it with field labels). */
  filterSummary: z.string().optional(),
});
export type CustomList = z.infer<typeof CustomList>;

export const ViewExposuresConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  object: z.string().min(1),
  views: z.array(ViewExposure).default([]),
  customLists: z.array(CustomList).default([]),
});
export type ViewExposuresConfig = z.infer<typeof ViewExposuresConfig>;

/** Fallback summary when a custom list has no precomputed one. */
export function summarizeCustomFilters(list: CustomList): string {
  if (list.filterSummary) return list.filterSummary;
  if (list.filters.length === 0) return "All records";
  return list.filters.map((f) => `${f.field} ${f.op} ${String(f.value)}`).join(" · ");
}
