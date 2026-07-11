/**
 * view_exposures — per synced CRM saved view: exposed toggle, "Ask Claude with"
 * aliases, default flag (design 5a). Filters are READ-ONLY from the CRM; there
 * is deliberately no parallel view builder (anti-goal).
 *
 * Migration notes:
 * - v1: initial schema.
 */
import { z } from "zod";

export const ViewExposure = z.object({
  /** CRM saved-view id (HubSpot view / SFDC listview). */
  viewId: z.string().min(1),
  /** Only exposed views are resolvable in chat. Private CRM views stay private. */
  exposed: z.boolean().default(false),
  /** "Ask Claude with" aliases, matched alongside the view's CRM name. */
  aliases: z.array(z.string().min(1)).default([]),
  /** Rendered when the ask names the object with no qualifier ("show my deals"). */
  isDefault: z.boolean().default(false),
});
export type ViewExposure = z.infer<typeof ViewExposure>;

export const ViewExposuresConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  object: z.string().min(1),
  views: z.array(ViewExposure).default([]),
});
export type ViewExposuresConfig = z.infer<typeof ViewExposuresConfig>;
