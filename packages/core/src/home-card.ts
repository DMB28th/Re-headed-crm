/**
 * home_card_configs — the block-based "open my CRM" launcher (design 7a/8a).
 * A launcher, NOT a dashboard: no chart/KPI blocks exist on purpose (anti-goal).
 *
 * Migration notes:
 * - v1: initial schema. Audience-keyed like layouts (default-only in v1).
 */
import { z } from "zod";

export const HomeCardBlock = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lists"),
    /** "all" = every exposed view; "curated" = the listed viewIds, in order. */
    source: z.enum(["all", "curated"]).default("all"),
    maxTiles: z.union([z.literal(2), z.literal(4), z.literal(6)]).default(4),
    viewIds: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal("recent"),
    limit: z.number().int().positive().max(10).default(3),
  }),
  z.object({
    type: z.literal("followups"),
    limit: z.number().int().positive().max(10).default(5),
  }),
]);
export type HomeCardBlock = z.infer<typeof HomeCardBlock>;

export const HomeCardConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  audience: z.string().min(1).default("default"),
  revision: z.number().int().positive().default(1),
  blocks: z.array(HomeCardBlock).min(1),
});
export type HomeCardConfig = z.infer<typeof HomeCardConfig>;
