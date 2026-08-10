/**
 * Shared capability configuration: CRM flows and custom screens.
 *
 * Migration notes:
 * - v1: initial flow render-mode config and custom-screen config. Both are
 *   tenant-scoped shared resources, not object-scoped layout blocks.
 * - 2026-08-10c: FlowRenderModeConfig gains `active` (default FALSE) — an
 *   explicit per-flow switch for "reps can use this in chat". Nothing is
 *   offered until an admin turns it on, matching how list exposure works: a
 *   synced flow is not a published one. BEHAVIOR CHANGE: before this, every
 *   synced flow was startable from chat whether or not it had a stored policy.
 *   `handoff` also stays in the FlowRenderMode enum for storage tolerance of
 *   rows written earlier, but Studio no longer OFFERS it — opening Salesforce
 *   in a browser tab is a fallback the runtime may still do, not a render mode
 *   an admin should be choosing. The picker exposes auto/native/embedded.
 * - 2026-08-10b: a custom screen is a SCREEN-FLOW screen and nothing else.
 *   `flowApiName` stays OPTIONAL in storage so rows written before this still
 *   parse (one unattached row must not sink the whole list, cf. the exposures
 *   regression), but it is now required to PUBLISH: the flow render ladder is
 *   the only thing that ever executes a screen, so an unattached one is dead
 *   config. Studio can no longer create one without a flow, and existing
 *   unattached screens surface on the Flows page to be reassigned.
 * - 2026-08-10: FlowRenderModeConfig gains `revision` (default 1) so a flow's
 *   render policy can be staged and rolled back like a layout
 *   (docs/studio-staging-model.md). Additive with a default — configs written
 *   before this parse unchanged and land on v1. The STORE envelope changed at
 *   the same time (bare config → draft/published/history); see the migration
 *   notes in file-store.ts / postgres-store.ts.
 */
import { z } from "zod";
import { ActionInputMappings } from "./layout-config.js";

/**
 * `handoff` is retained so configs written before 2026-08-10c parse, but it is
 * NOT an admin-selectable mode — see IN_CHAT_RENDER_MODES.
 */
export const FlowRenderMode = z.enum(["auto", "native", "embedded", "handoff"]);

/** The modes Studio offers. All of them render inside the chat card. */
export const IN_CHAT_RENDER_MODES = ["auto", "native", "embedded"] as const;
export type FlowRenderMode = z.infer<typeof FlowRenderMode>;

export const FlowRenderModeConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  flowApiName: z.string().min(1),
  /** Publish revision — bumps on publish, indexes rollback history. */
  revision: z.number().int().positive().default(1),
  /**
   * Whether reps can run this flow from chat at all. Defaults to false: a flow
   * synced from the CRM is a candidate, not an offering. Enforced server-side
   * in crm_flow_start, so the toggle is a real gate and not decoration.
   */
  active: z.boolean().default(false),
  mode: FlowRenderMode.default("auto"),
  /** Required fallback for hosts that block embedded Salesforce screens. */
  fallback: z.literal("open-in-salesforce").default("open-in-salesforce"),
  updatedAt: z.string().optional(),
});
export type FlowRenderModeConfig = z.infer<typeof FlowRenderModeConfig>;

export const DEFAULT_CUSTOM_SCREEN_SOURCE = `screen({
  id: "onsite-scheduling",
  inputs: {
    recordId: ui.input.text({ label: "Record id" })
  },
  render: ({ ui }) =>
    ui.stack([
      ui.text("Collect the missing inputs in chat-safe controls."),
      ui.input.text({ name: "notes", label: "Notes" })
    ]),
  validate: (values) => values.notes ? [] : ["Notes are required"],
  submit: (values, { flow }) => flow.output(values)
})`;

export const CustomScreenConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  id: z.string().regex(/^cs-[a-z0-9-]+$/),
  label: z.string().min(1),
  /**
   * The screen flow this screen belongs to. Optional only for storage
   * tolerance of pre-2026-08-10b rows — required to publish (see the store's
   * publish verb) because nothing but the flow ladder can render a screen.
   */
  flowApiName: z.string().optional(),
  replacesComponent: z.string().optional(),
  /**
   * Props available to an LWC/custom screen replacement after action-context
   * resolution. The source code can still declare UI inputs; this map governs
   * what the host is allowed to inject.
   */
  inputs: ActionInputMappings,
  source: z.string().min(1).default(DEFAULT_CUSTOM_SCREEN_SOURCE),
  status: z.enum(["draft", "published"]).default("draft"),
  revision: z.number().int().positive().default(1),
  updatedAt: z.string().optional(),
});
export type CustomScreenConfig = z.infer<typeof CustomScreenConfig>;

export interface CustomScreenRecord {
  draft: CustomScreenConfig | null;
  published: CustomScreenConfig | null;
  history: CustomScreenConfig[];
}
