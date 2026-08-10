/**
 * Shared capability configuration: CRM flows and custom screens.
 *
 * Migration notes:
 * - v1: initial flow render-mode config and custom-screen config. Both are
 *   tenant-scoped shared resources, not object-scoped layout blocks.
 * - 2026-08-10: FlowRenderModeConfig gains `revision` (default 1) so a flow's
 *   render policy can be staged and rolled back like a layout
 *   (docs/studio-staging-model.md). Additive with a default — configs written
 *   before this parse unchanged and land on v1. The STORE envelope changed at
 *   the same time (bare config → draft/published/history); see the migration
 *   notes in file-store.ts / postgres-store.ts.
 */
import { z } from "zod";
import { ActionInputMappings } from "./layout-config.js";

export const FlowRenderMode = z.enum(["auto", "native", "embedded", "handoff"]);
export type FlowRenderMode = z.infer<typeof FlowRenderMode>;

export const FlowRenderModeConfig = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  flowApiName: z.string().min(1),
  /** Publish revision — bumps on publish, indexes rollback history. */
  revision: z.number().int().positive().default(1),
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
