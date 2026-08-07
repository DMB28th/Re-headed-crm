/**
 * The decision behind /api/flows/assign, separated from its I/O so it is
 * testable without a Next.js route harness.
 *
 * Disabling sets `enabled: false` rather than removing: the action keeps its
 * label, position and hand-mapped inputs, and stays re-enableable from the
 * actions editor. Enabling MERGES, so auto-mapping seeds a genuinely new action
 * but never overwrites what an admin mapped by hand.
 */
import {
  setActionEnabled,
  upsertAction,
  type ActionInputMappings,
  type ActionRef,
  type CardAction,
} from "@cardstack/core";

export function planActionAssignment(input: {
  actions: CardAction[];
  kind: "screen_flow" | "quick_action";
  apiName: string;
  enabled: boolean;
  autoMappedInputs: ActionInputMappings;
  discoveredLabel: string;
}): { actions: CardAction[]; mappedInputs: string[] } {
  const ref: ActionRef =
    input.kind === "quick_action"
      ? { type: "quick_action", actionApiName: input.apiName }
      : { type: "screen_flow", flowApiName: input.apiName };

  if (!input.enabled) {
    return { actions: setActionEnabled(input.actions, ref, false), mappedInputs: [] };
  }

  if (input.kind === "quick_action") {
    return {
      actions: upsertAction(input.actions, {
        type: "quick_action",
        actionApiName: input.apiName,
        label: input.discoveredLabel,
        enabled: true,
      }),
      mappedInputs: [],
    };
  }

  return {
    actions: upsertAction(input.actions, {
      type: "screen_flow",
      flowApiName: input.apiName,
      label: input.discoveredLabel,
      embed: "auto",
      enabled: true,
      inputs: input.autoMappedInputs,
    }),
    mappedInputs: Object.keys(input.autoMappedInputs),
  };
}
