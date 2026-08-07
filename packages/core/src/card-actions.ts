/**
 * The single owner of what "off", "primary", and "already configured" mean for
 * a record card's action row.
 *
 * Every mutation of `recordCard.actions` goes through here — the Studio actions
 * editor, the Flows admin toggle (`/api/flows/assign`), and the record card's
 * render decision. Two surfaces editing this array with different semantics is
 * what this module exists to prevent: before it, disabling a flow from the Flows
 * page DELETED the action and destroyed any hand-mapped inputs.
 *
 * Pure by design. `packages/widgets` has no test runner, so the card's render
 * decision lives here where vitest can reach it.
 */
import type { CardAction } from "./layout-config.js";

/** Identifies an action within a list, independent of position. */
export type ActionRef =
  | { type: "update_record" }
  | { type: "create_related"; object: string }
  | { type: "quick_action"; actionApiName: string }
  | { type: "screen_flow"; flowApiName: string };

export function actionRef(action: CardAction): ActionRef {
  switch (action.type) {
    case "update_record":
      return { type: "update_record" };
    case "create_related":
      return { type: "create_related", object: action.object };
    case "quick_action":
      return { type: "quick_action", actionApiName: action.actionApiName };
    case "screen_flow":
      return { type: "screen_flow", flowApiName: action.flowApiName };
  }
}

function sameRef(a: ActionRef, b: ActionRef): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "update_record":
      return true;
    case "create_related":
      return a.object === (b as Extract<ActionRef, { type: "create_related" }>).object;
    case "quick_action":
      return (
        a.actionApiName === (b as Extract<ActionRef, { type: "quick_action" }>).actionApiName
      );
    case "screen_flow":
      return a.flowApiName === (b as Extract<ActionRef, { type: "screen_flow" }>).flowApiName;
  }
}

export function findAction(actions: CardAction[], ref: ActionRef): CardAction | undefined {
  return actions.find((a) => sameRef(actionRef(a), ref));
}

/**
 * Adds the action if absent. If present, MERGES rather than replaces:
 * hand-mapped `inputs` always survive a re-add from a surface that rebuilds
 * the action from CRM metadata, but a customized label survives only when
 * the INCOMING label is the bare api name (i.e. the re-adding surface had no
 * better metadata to offer). When the incoming label is a real discovered
 * name — e.g. `/api/flows/assign` after a successful `getFlowDefinition` —
 * it overwrites the admin's rename. See `card-actions.test.ts:75-83`.
 */
export function upsertAction(
  actions: CardAction[],
  action: CardAction,
  opts: { overwriteInputs?: boolean } = {},
): CardAction[] {
  const ref = actionRef(action);
  const index = actions.findIndex((a) => sameRef(actionRef(a), ref));
  if (index === -1) return [...actions, action];

  // Safe: index came from findIndex above and is not -1, so this is always
  // present.
  const existing = actions[index]!;
  // An incoming label equal to the action's own api name carries no admin
  // intent — it is what a discovery source emits when the CRM gave it nothing
  // better. It must never overwrite a label the admin chose. This applies to
  // EVERY type: a renamed quick action is as much the admin's work as a
  // renamed flow.
  const bareApiName =
    action.type === "screen_flow"
      ? action.flowApiName
      : action.type === "quick_action"
        ? action.actionApiName
        : undefined;
  let merged: CardAction = {
    ...action,
    label: bareApiName !== undefined && action.label === bareApiName ? existing.label : action.label,
  };
  // Only screen_flow carries `inputs`, so only it can lose hand-mapped ones.
  if (existing.type === "screen_flow" && merged.type === "screen_flow") {
    merged = {
      ...merged,
      inputs: opts.overwriteInputs
        ? merged.inputs
        : { ...merged.inputs, ...existing.inputs },
    };
  }
  const next = [...actions];
  next[index] = merged;
  return next;
}

export function removeAction(actions: CardAction[], ref: ActionRef): CardAction[] {
  return actions.filter((a) => !sameRef(actionRef(a), ref));
}

export function setActionEnabled(
  actions: CardAction[],
  ref: ActionRef,
  enabled: boolean,
): CardAction[] {
  return actions.map((a) => (sameRef(actionRef(a), ref) ? { ...a, enabled } : a));
}

export function reorderActions(actions: CardAction[], from: number, to: number): CardAction[] {
  if (from < 0 || to < 0 || from >= actions.length || to >= actions.length) return actions;
  const next = [...actions];
  // Safe: from is within [0, length) per the guard above, so splice always
  // removes exactly one element.
  const [moved] = next.splice(from, 1) as [CardAction];
  next.splice(to, 0, moved);
  return next;
}

/**
 * What the record card should render, in configured order.
 *
 * The FIRST element is the primary button — order is the admin's control over
 * which action leads (design 3a). Disabled actions never render, and
 * `update_record` is skipped when permissions or the layout leave nothing
 * editable, so the next enabled action is promoted rather than leaving a gap.
 *
 * Callers must handle the empty result: an empty CONFIGURATION is not the same
 * as an empty RESULT, and the card falls back to its legacy edit button only in
 * the former case.
 */
export function selectRenderableActions(
  actions: CardAction[],
  opts: { canEdit: boolean },
): CardAction[] {
  return actions.filter((action) => {
    if (action.enabled === false) return false;
    if (action.type === "update_record" && !opts.canEdit) return false;
    return true;
  });
}
