/**
 * The complete map of Salesforce Flow metadata surface vs what Cardstack's
 * in-chat interpreter supports (design 10a, NATIVE rung).
 *
 * This registry is the single source of truth: flow-analysis derives the
 * per-flow support level from it, the interpreter consults it when it meets an
 * element, and docs/Studio render it. Adding support for an element type means
 * flipping its entry here AND registering a handler — the analysis and the
 * runtime can never disagree about what's supported.
 *
 * Support levels:
 * - "interpret"   — walked/evaluated in chat.
 * - "confirm"     — interpreted, but pauses for a rep confirmation (writes).
 * - "transparent" — definition-level (not traversal) constructs resolved on
 *                   reference; no traversal handler needed.
 * - "degrade"     — not interpretable; the flow (or the rest of it) hands off
 *                   to the CRM. Reason is shown to admins in Studio.
 */

export type FlowSupportLevel = "interpret" | "confirm" | "transparent" | "degrade";

export interface FlowCapability {
  level: FlowSupportLevel;
  /** Why (for degrade) / caveat (for partials). Admin-facing. */
  note?: string;
}

/**
 * Traversal ELEMENT types, keyed by the metadata array that carries them in
 * the flow definition JSON.
 */
export const FLOW_ELEMENT_CAPABILITIES: Record<string, FlowCapability> = {
  // Interpreted
  screens: { level: "interpret" },
  decisions: { level: "interpret" },
  assignments: { level: "interpret" },
  recordLookups: { level: "interpret", note: "Row count capped; rows feed tables, loops and merge fields." },
  loops: { level: "interpret", note: "Iterates bounded in-memory collections." },
  collectionProcessors: {
    level: "interpret",
    note: "Sort and Filter only; Recommendation maps degrade.",
  },
  subflows: { level: "interpret", note: "One nesting level; the subflow is analyzed recursively." },
  customErrors: { level: "interpret", note: "Rendered as an error screen; ends the interview." },

  // Interpreted with a confirmation gate (rule 8 — every write confirms first)
  recordCreates: { level: "confirm" },
  recordUpdates: { level: "confirm" },
  recordDeletes: { level: "confirm" },

  // Definition-level constructs (resolved on reference, not traversed)
  choices: { level: "transparent" },
  dynamicChoiceSets: { level: "transparent" },
  constants: { level: "transparent" },
  variables: { level: "transparent" },
  formulas: {
    level: "transparent",
    note: "Common operators/functions evaluated; a formula the evaluator can't parse degrades that path.",
  },
  textTemplates: { level: "transparent" },
  stages: { level: "transparent", note: "Tracked but not surfaced yet." },

  // Not interpretable in chat — degrade to handoff
  actionCalls: {
    level: "degrade",
    note: "Invocable actions (email, Apex, quick actions) run inside Salesforce only.",
  },
  apexPluginCalls: { level: "degrade", note: "Apex plugins run inside Salesforce only." },
  waits: { level: "degrade", note: "Time-based waits need the CRM's scheduler." },
  recordRollbacks: { level: "degrade", note: "No transaction semantics outside Salesforce." },
  transforms: { level: "degrade", note: "Transform elements not yet interpreted." },
  orchestratedStages: { level: "degrade", note: "Orchestrations run inside Salesforce only." },
  steps: { level: "degrade", note: "Legacy step elements not interpreted." },
};

/**
 * SCREEN FIELD types (the `fieldType` of a screen field, plus ComponentInstance
 * extensions keyed as `extension:<name>`).
 */
export const FLOW_SCREEN_FIELD_CAPABILITIES: Record<string, FlowCapability> = {
  DisplayText: { level: "interpret" },
  InputField: { level: "interpret", note: "String, Number, Currency, Date, DateTime, Boolean." },
  LargeTextArea: { level: "interpret" },
  RadioButtons: { level: "interpret" },
  DropdownBox: { level: "interpret" },
  MultiSelectCheckboxes: { level: "interpret" },
  MultiSelectPicklist: { level: "interpret" },
  RegionContainer: { level: "interpret", note: "Sections/columns flatten into grouped fields." },
  Region: { level: "interpret", note: "Column inside a section." },
  ObjectProvided: {
    level: "interpret",
    note: "Record fields render as typed inputs from the object describe.",
  },
  PasswordField: {
    level: "degrade",
    note: "Secrets must never transit chat — the flow hands off instead.",
  },

  // ComponentInstance extensions (standard flowruntime components)
  "extension:flowruntime:datatable": { level: "interpret" },
  "extension:flowruntime:toggle": { level: "interpret" },
  "extension:flowruntime:slider": { level: "interpret" },
  "extension:flowruntime:email": { level: "interpret" },
  "extension:flowruntime:phone": { level: "interpret" },
  "extension:flowruntime:url": { level: "interpret" },
  "extension:flowruntime:name": { level: "interpret", note: "Renders as first/last name inputs." },
  "extension:flowruntime:address": {
    level: "interpret",
    note: "Renders as street/city/state/zip/country inputs.",
  },
  "extension:flowruntime:image": { level: "interpret", note: "Rendered as a link (chat CSP blocks remote images)." },
  "extension:flowruntime:dependentPicklists": {
    level: "degrade",
    note: "Controlling-field dependency needs live describe wiring — not yet.",
  },
  "extension:flowruntime:lookup": {
    level: "degrade",
    note: "Type-ahead record search inside the interview — not yet.",
  },
  "extension:flowruntime:fileUpload": {
    level: "degrade",
    note: "File upload can't cross the chat sandbox.",
  },
  "extension:forceContent:fileUpload": {
    level: "degrade",
    note: "File upload can't cross the chat sandbox.",
  },
  "extension:flowruntime:repeater": { level: "degrade", note: "Repeater blocks not yet interpreted." },
  // Any custom (c:*, namespaced) LWC lands on the wildcard below.
};

/** Wildcard for unrecognized screen components (custom LWCs etc.). */
export const UNKNOWN_SCREEN_FIELD: FlowCapability = {
  level: "degrade",
  note: "Custom screen components only render inside Salesforce.",
};

/** Wildcard for unrecognized element arrays (new metadata types). */
export const UNKNOWN_ELEMENT: FlowCapability = {
  level: "degrade",
  note: "Unrecognized flow element type.",
};

/**
 * Definition-level SETTINGS arrays that are not element lists — never treated
 * as unsupported elements (they carry strings/config, not traversal nodes).
 */
export const FLOW_SETTINGS_KEYS = new Set([
  "environments",
  "processMetadataValues",
  "interviewLabel",
  "runInModes",
  "sourceTemplate",
]);

export function screenFieldCapability(
  fieldType: string | undefined,
  extensionName?: string | undefined,
): FlowCapability {
  if (fieldType === "ComponentInstance") {
    return (
      FLOW_SCREEN_FIELD_CAPABILITIES[`extension:${extensionName ?? ""}`] ?? UNKNOWN_SCREEN_FIELD
    );
  }
  return FLOW_SCREEN_FIELD_CAPABILITIES[fieldType ?? ""] ?? UNKNOWN_SCREEN_FIELD;
}

export function elementCapability(elementArray: string): FlowCapability {
  return FLOW_ELEMENT_CAPABILITIES[elementArray] ?? UNKNOWN_ELEMENT;
}
