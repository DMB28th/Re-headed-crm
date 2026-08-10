/**
 * What actions are AVAILABLE to add to an object's action row — the two
 * builtin kinds plus whatever the connected CRM exposes (quick actions,
 * screen flows). Feeds the actions editor's picker (design 3a).
 *
 * Pure shaping only: the route (`.../available-actions/route.ts`) does the
 * fetching and degradation, then hands this function what it found.
 * `quickActions`/`flows` being `null` means the source could not be read;
 * `[]` means the org genuinely has none — the picker renders a teaching
 * state only for the former.
 */
import { findAction, type ActionRef, type CardAction, type QuickActionSummary } from "@cardstack/core";

export interface DiscoveredAction {
  ref: ActionRef;
  label: string;
  /** `undefined` means no known input variables for this entry — for ANY
   *  reason: not a screen flow, or a screen flow whose definition could not
   *  be read (unreadable/managed/installed). Both cases get the same
   *  downstream treatment (the picker's caution state), so they share the
   *  same `undefined`. A screen flow whose definition WAS read but declares
   *  zero input variables gets `[]`, which is a distinct, real fact. */
  inputVariables?: { name: string; dataType: string; isCollection: boolean }[];
  alreadyConfigured: boolean;
}

export interface ActionSource {
  kind: "builtin" | "quick_action" | "screen_flow";
  entries: DiscoveredAction[];
  /** Set when the source could not be read — an empty org is not an error. */
  unavailable?: string;
}

export interface AvailableActionsResponse {
  sources: ActionSource[];
}

/** Shape the route hands in for a screen flow, once it has resolved the
 *  flow's definition (or fallen back to no input variables). */
export interface FlowCatalogInput {
  api: string;
  label: string;
  /** `undefined` when the flow's definition could not be read — passed
   *  through unchanged to `DiscoveredAction.inputVariables` so the picker's
   *  caution state fires. `[]` is a flow that genuinely declares none. */
  inputVariables?: { name: string; dataType: string; isCollection: boolean }[];
}

export interface BuildActionCatalogInput {
  /** The object's currently-configured actions (draft-or-published). A
   *  disabled action still counts as configured — `findAction` doesn't look
   *  at `enabled`. */
  configured: CardAction[];
  /** Target objects for `create_related` builtin entries, unfiltered — that
   *  action posts a followup and the model drives `crm_create_record`, which
   *  doesn't require the target to have a Cardstack layout. */
  objects: string[];
  quickActions: QuickActionSummary[] | null;
  flows: FlowCatalogInput[] | null;
}

/**
 * Best-effort human label from a bare object API name. `objects` here is a
 * plain string list (not `ObjectSummary[]`), so there is no real label to
 * draw on — this only prettifies the identifier itself: snake_case/camelCase
 * word-splitting, a trailing Salesforce "__c" stripped, and a bare lowercase
 * plural singularized (the mock portal's convention, e.g. "deals" -> "deal").
 * Real CRM object api names are already singular and pass through untouched
 * by that last step.
 */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 1 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function humanizeObjectName(api: string): string {
  const base = api.endsWith("__c") ? api.slice(0, -3) : api;
  const spaced = base
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  const words = spaced.split(/\s+/).filter(Boolean);
  const isLowercaseSingleWord = words.length === 1 && base === base.toLowerCase();
  const finalWords = isLowercaseSingleWord ? [singularize(words[0]!)] : words;
  return finalWords.map((w) => w.toLowerCase()).join(" ") || api;
}

export function buildActionCatalog(input: BuildActionCatalogInput): AvailableActionsResponse {
  const { configured, objects, quickActions, flows } = input;
  const isConfigured = (ref: ActionRef) => findAction(configured, ref) !== undefined;

  const updateRecordRef: ActionRef = { type: "update_record" };
  const builtinEntries: DiscoveredAction[] = [
    {
      ref: updateRecordRef,
      label: "Edit fields",
      alreadyConfigured: isConfigured(updateRecordRef),
    },
    ...objects.map((object): DiscoveredAction => {
      const ref: ActionRef = { type: "create_related", object };
      return {
        ref,
        label: `Create ${humanizeObjectName(object)}`,
        alreadyConfigured: isConfigured(ref),
      };
    }),
  ];

  const quickActionSource: ActionSource =
    quickActions === null
      ? {
          kind: "quick_action",
          entries: [],
          unavailable: "Could not read quick actions from the CRM.",
        }
      : {
          kind: "quick_action",
          entries: quickActions.map((qa): DiscoveredAction => {
            const ref: ActionRef = { type: "quick_action", actionApiName: qa.api };
            return { ref, label: qa.label, alreadyConfigured: isConfigured(ref) };
          }),
        };

  const screenFlowSource: ActionSource =
    flows === null
      ? {
          kind: "screen_flow",
          entries: [],
          unavailable: "Could not read screen flows from the CRM.",
        }
      : {
          kind: "screen_flow",
          entries: flows.map((flow): DiscoveredAction => {
            const ref: ActionRef = { type: "screen_flow", flowApiName: flow.api };
            return {
              ref,
              label: flow.label,
              inputVariables: flow.inputVariables,
              alreadyConfigured: isConfigured(ref),
            };
          }),
        };

  // Stable order: the editor renders sources in this order, so it must not
  // be left to how the inputs happened to arrive.
  return {
    sources: [{ kind: "builtin", entries: builtinEntries }, quickActionSource, screenFlowSource],
  };
}
