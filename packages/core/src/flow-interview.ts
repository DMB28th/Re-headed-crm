/**
 * Screen-flow interview interpreter (design 10a, NATIVE rung).
 *
 * Walks a CRM screen-flow definition (Salesforce Flow metadata JSON) and
 * renders each screen as widget-ready fields. The server stays stateless: the
 * whole interview state (frame stack, answers, cursors) round-trips through an
 * opaque — optionally HMAC-signed — token in the payload.
 *
 * Coverage is governed by flow-capabilities.ts: interpreted elements are
 * handled here; anything else surfaces as a typed "degrade" step so the flow
 * hands off to the CRM with a reason instead of breaking. Writes (create /
 * update / delete) NEVER execute during traversal — the interview pauses at a
 * "confirm-write" step and proceeds only when the continue call carries
 * confirmWrite (hard rule 8).
 *
 * Sessions are a FRAME STACK: subflows push a frame with their own namespace
 * and pop back into the parent through output assignments.
 */
import type { CrmFieldValue } from "./crm-types.js";
import { evaluateFormula } from "./flow-expressions.js";
import { elementCapability, screenFieldCapability } from "./flow-capabilities.js";

// ---------------------------------------------------------------------------
// Flow metadata (loose) — the subset of the Salesforce Flow JSON we touch.
// Tooling-API JSON writes explicit nulls into unused slots; every read here
// treats null as absent.
// ---------------------------------------------------------------------------

interface MetaValue {
  stringValue?: string | null;
  numberValue?: number | null;
  booleanValue?: boolean | null;
  dateValue?: string | null;
  dateTimeValue?: string | null;
  elementReference?: string | null;
}

interface MetaConnector {
  targetReference?: string | null;
}

interface MetaChoice {
  name: string;
  choiceText?: string | null;
  value?: MetaValue | null;
}

interface MetaDynamicChoiceSet {
  name: string;
  object?: string | null;
  displayField?: string | null;
  valueField?: string | null;
}

interface MetaCondition {
  leftValueReference?: string | null;
  operator?: string | null;
  rightValue?: MetaValue | null;
}

interface MetaVisibilityRule {
  conditionLogic?: string | null;
  conditions?: MetaCondition[] | null;
}

interface MetaInputParameter {
  name?: string | null;
  value?: MetaValue | null;
}

interface MetaScreenField {
  name: string;
  fieldType?: string | null;
  fieldText?: string | null;
  dataType?: string | null;
  isRequired?: boolean | null;
  defaultValue?: MetaValue | null;
  choiceReferences?: string[] | string | null;
  defaultSelectedChoiceReference?: string | null;
  extensionName?: string | null;
  inputParameters?: MetaInputParameter[] | null;
  helpText?: string | null;
  fields?: MetaScreenField[] | null; // RegionContainer nesting
  regionContainerType?: string | null;
  visibilityRule?: MetaVisibilityRule | null;
  validationRule?: { formulaExpression?: string | null; errorMessage?: string | null } | null;
  objectFieldReference?: string | null;
}

interface MetaScreen {
  name: string;
  label?: string | null;
  allowBack?: boolean | null;
  allowFinish?: boolean | null;
  connector?: MetaConnector | null;
  fields?: MetaScreenField[] | null;
}

interface MetaDecisionRule {
  name: string;
  conditionLogic?: string | null;
  conditions?: MetaCondition[] | null;
  connector?: MetaConnector | null;
}

interface MetaDecision {
  name: string;
  rules?: MetaDecisionRule[] | null;
  defaultConnector?: MetaConnector | null;
}

interface MetaFilter {
  field?: string | null;
  operator?: string | null;
  value?: MetaValue | null;
}

interface MetaRecordLookup {
  name: string;
  object?: string | null;
  sortField?: string | null;
  sortOrder?: string | null;
  getFirstRecordOnly?: boolean | null;
  filters?: MetaFilter[] | null;
  queriedFields?: string[] | null;
  connector?: MetaConnector | null;
}

interface MetaInputAssignment {
  field?: string | null;
  value?: MetaValue | null;
}

interface MetaRecordCreate {
  name: string;
  object?: string | null;
  inputAssignments?: MetaInputAssignment[] | null;
  inputReference?: string | null;
  connector?: MetaConnector | null;
}

interface MetaRecordUpdate {
  name: string;
  object?: string | null;
  inputAssignments?: MetaInputAssignment[] | null;
  inputReference?: string | null;
  filters?: MetaFilter[] | null;
  connector?: MetaConnector | null;
}

interface MetaRecordDelete {
  name: string;
  object?: string | null;
  inputReference?: string | null;
  filters?: MetaFilter[] | null;
  connector?: MetaConnector | null;
}

interface MetaAssignmentItem {
  assignToReference?: string | null;
  operator?: string | null;
  value?: MetaValue | null;
}

interface MetaAssignment {
  name: string;
  assignmentItems?: MetaAssignmentItem[] | null;
  connector?: MetaConnector | null;
}

interface MetaLoop {
  name: string;
  collectionReference?: string | null;
  iterationOrder?: string | null;
  nextValueConnector?: MetaConnector | null;
  noMoreValuesConnector?: MetaConnector | null;
}

interface MetaCollectionProcessor {
  name: string;
  elementSubtype?: string | null;
  collectionReference?: string | null;
  limitCount?: number | null;
  sortOptions?: { sortField?: string | null; sortOrder?: string | null }[] | null;
  conditionLogic?: string | null;
  conditions?: MetaCondition[] | null;
  connector?: MetaConnector | null;
}

interface MetaSubflow {
  name: string;
  flowName?: string | null;
  inputAssignments?: { name?: string | null; value?: MetaValue | null }[] | null;
  outputAssignments?: { name?: string | null; assignToReference?: string | null }[] | null;
  storeOutputAutomatically?: boolean | null;
  connector?: MetaConnector | null;
}

interface MetaCustomError {
  name: string;
  customErrorMessages?: { errorMessage?: string | null }[] | null;
}

interface MetaVariable {
  name: string;
  dataType?: string | null;
  isCollection?: boolean | null;
  isInput?: boolean | null;
  value?: MetaValue | null;
}

interface MetaConstant {
  name: string;
  value?: MetaValue | null;
}

interface MetaFormula {
  name: string;
  expression?: string | null;
}

interface MetaTextTemplate {
  name: string;
  text?: string | null;
}

/** The flow definition JSON (Tooling API `Flow.Metadata` / parsed flow XML). */
export interface FlowDefinitionJson {
  label?: string | null;
  start?: { connector?: MetaConnector | null } | null;
  screens?: MetaScreen[] | null;
  decisions?: MetaDecision[] | null;
  recordLookups?: MetaRecordLookup[] | null;
  recordCreates?: MetaRecordCreate[] | null;
  recordUpdates?: MetaRecordUpdate[] | null;
  recordDeletes?: MetaRecordDelete[] | null;
  assignments?: MetaAssignment[] | null;
  loops?: MetaLoop[] | null;
  collectionProcessors?: MetaCollectionProcessor[] | null;
  subflows?: MetaSubflow[] | null;
  customErrors?: MetaCustomError[] | null;
  choices?: MetaChoice[] | null;
  dynamicChoiceSets?: MetaDynamicChoiceSet[] | null;
  variables?: MetaVariable[] | null;
  constants?: MetaConstant[] | null;
  formulas?: MetaFormula[] | null;
  textTemplates?: MetaTextTemplate[] | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Widget-facing render model
// ---------------------------------------------------------------------------

export interface FlowChoiceOption {
  value: string;
  label: string;
}

export interface FlowTableRow {
  id: string;
  cells: Record<string, CrmFieldValue>;
}

/** Same-screen visibility rule, evaluated live by the widget. */
export interface FlowVisibilityRule {
  logic: "and" | "or";
  conditions: { ref: string; operator: string; value: CrmFieldValue }[];
}

interface FieldCommon {
  name: string;
  /** Present when the field only shows under a same-screen condition. */
  visibility?: FlowVisibilityRule;
  /** Validation failure from the last continue attempt. */
  error?: string;
  helpText?: string;
}

export type FlowRenderField =
  | ({ kind: "display"; html: string } & FieldCommon)
  | ({
      kind: "input";
      label: string;
      dataType: "String" | "Number" | "Currency" | "Date" | "DateTime" | "Boolean";
      inputStyle?: "toggle" | "email" | "phone" | "url";
      required: boolean;
      defaultValue: CrmFieldValue;
    } & FieldCommon)
  | ({ kind: "textarea"; label: string; required: boolean; defaultValue: string | null } & FieldCommon)
  | ({
      kind: "choice";
      label: string;
      style: "radio" | "dropdown" | "multiselect";
      required: boolean;
      options: FlowChoiceOption[];
      defaultValue: string | null;
    } & FieldCommon)
  | ({
      kind: "slider";
      label: string;
      min: number;
      max: number;
      step: number;
      defaultValue: number;
    } & FieldCommon)
  | ({
      kind: "composite";
      label: string;
      /** name/address sub-inputs; answers post as `${name}.${sub.key}`. */
      inputs: { key: string; label: string }[];
    } & FieldCommon)
  | ({
      kind: "datatable";
      label: string;
      selectionMode: "single" | "multi" | "none";
      required: boolean;
      maxSelection: number;
      columns: { api: string; label: string }[];
      rows: FlowTableRow[];
    } & FieldCommon)
  | ({ kind: "section"; label: string; fields: FlowRenderField[] } & FieldCommon)
  | ({ kind: "unsupported"; label: string; componentType: string; note: string } & FieldCommon);

export interface FlowRenderScreen {
  name: string;
  label: string;
  allowBack: boolean;
  allowFinish: boolean;
  stepIndex: number;
  fields: FlowRenderField[];
}

export interface FlowPendingWrite {
  kind: "create" | "update" | "delete";
  object: string;
  /** Records affected (update/delete). Empty for create. */
  targetIds: string[];
  assignments: { field: string; value: CrmFieldValue }[];
  description: string;
}

// ---------------------------------------------------------------------------
// Session — a frame stack; round-trips as base64 JSON (+ optional HMAC).
// ---------------------------------------------------------------------------

export type FlowAnswerValue = CrmFieldValue | string[];

interface FlowFrame {
  flow: string;
  cursor: string;
  visitedScreens: string[];
  answers: Record<string, FlowAnswerValue>;
  createdIds: Record<string, string>;
  collections: Record<string, FlowTableRow[]>;
  loops: Record<string, number>;
  pendingWrite: string | null;
  /** Parent element to resume after this (subflow) frame pops. */
  returnTo: string | null;
  /** Subflow element name in the parent (namespaces auto-stored outputs). */
  subflowElement: string | null;
  screenCount: number;
}

export interface FlowInterviewSession {
  v: 2;
  frames: FlowFrame[];
}

function activeFrame(session: FlowInterviewSession): FlowFrame {
  const frame = session.frames[session.frames.length - 1];
  if (!frame) throw new Error("Interview session has no active frame.");
  return frame;
}

// NOTE: token SIGNING is deliberately not here — core must stay browser-safe
// (Studio bundles it into client components). The MCP server HMAC-wraps these
// tokens before they leave the process; see signInterviewState in apps/mcp-server.
export function encodeInterviewState(session: FlowInterviewSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeInterviewState(state: string): FlowInterviewSession {
  const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as FlowInterviewSession;
  if (parsed.v !== 2 || !Array.isArray(parsed.frames)) {
    throw new Error("Unrecognized interview state token.");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Effects — what the interpreter needs from the CRM.
// ---------------------------------------------------------------------------

export interface FlowQueryFilter {
  field: string;
  operator: string;
  value: CrmFieldValue;
}

export interface FlowRuntimeEffects {
  queryRecords(
    object: string,
    fields: string[],
    opts: {
      sortField?: string;
      sortOrder?: "Asc" | "Desc";
      limit?: number;
      filters?: FlowQueryFilter[];
    },
  ): Promise<FlowTableRow[]>;
  choiceOptions(object: string, valueField: string, displayField: string): Promise<FlowChoiceOption[]>;
  createRecord(object: string, fields: Record<string, CrmFieldValue>): Promise<string>;
  updateRecord?(object: string, id: string, fields: Record<string, CrmFieldValue>): Promise<void>;
  deleteRecord?(object: string, id: string): Promise<void>;
}

export type FlowDefResolver = (flowApiName: string) => Promise<FlowDefinitionJson | null>;

export type FlowStepResult =
  | { type: "screen"; screen: FlowRenderScreen; session: FlowInterviewSession }
  | { type: "confirm-write"; write: FlowPendingWrite; session: FlowInterviewSession }
  | { type: "finished"; session: FlowInterviewSession; summary: string; failed?: boolean }
  | { type: "degrade"; element: string; reason: string };

/** Raised when traversal meets something the NATIVE rung can't run. */
class FlowUnsupported extends Error {
  constructor(
    public readonly element: string,
    public readonly reason: string,
  ) {
    super(`${element}: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Value plumbing
// ---------------------------------------------------------------------------

const MAX_STEPS = 1000; // loops iterate; a definition cycle must still terminate
const ROW_LIMIT = 100;
const TABLE_ROW_LIMIT = 50;
const MAX_REF_DEPTH = 10;

function literalOf(value: MetaValue | null | undefined): CrmFieldValue {
  if (!value) return null;
  if (value.stringValue != null) return value.stringValue;
  if (value.numberValue != null) return value.numberValue;
  if (value.booleanValue != null) return value.booleanValue;
  if (value.dateValue != null) return value.dateValue;
  if (value.dateTimeValue != null) return value.dateTimeValue;
  return null;
}

function asArray<T>(v: T[] | T | null | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function scalarOf(v: FlowAnswerValue | undefined): CrmFieldValue {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.join(", ");
  return v;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

// ---------------------------------------------------------------------------
// Definition index + reference resolution
// ---------------------------------------------------------------------------

class DefIndex {
  readonly screens = new Map<string, MetaScreen>();
  readonly decisions = new Map<string, MetaDecision>();
  readonly lookups = new Map<string, MetaRecordLookup>();
  readonly creates = new Map<string, MetaRecordCreate>();
  readonly updates = new Map<string, MetaRecordUpdate>();
  readonly deletes = new Map<string, MetaRecordDelete>();
  readonly assignments = new Map<string, MetaAssignment>();
  readonly loops = new Map<string, MetaLoop>();
  readonly processors = new Map<string, MetaCollectionProcessor>();
  readonly subflows = new Map<string, MetaSubflow>();
  readonly customErrors = new Map<string, MetaCustomError>();
  readonly choices = new Map<string, MetaChoice>();
  readonly dynamicChoiceSets = new Map<string, MetaDynamicChoiceSet>();
  readonly variables = new Map<string, MetaVariable>();
  readonly constants = new Map<string, MetaConstant>();
  readonly formulas = new Map<string, MetaFormula>();
  readonly textTemplates = new Map<string, MetaTextTemplate>();
  /** Element arrays present in the definition that the interpreter can't run. */
  readonly unsupportedElements = new Map<string, string>();

  constructor(readonly def: FlowDefinitionJson) {
    const fill = <T extends { name: string }>(map: Map<string, T>, items: T[] | null | undefined) => {
      for (const item of items ?? []) map.set(item.name, item);
    };
    fill(this.screens, def.screens);
    fill(this.decisions, def.decisions);
    fill(this.lookups, def.recordLookups);
    fill(this.creates, def.recordCreates);
    fill(this.updates, def.recordUpdates);
    fill(this.deletes, def.recordDeletes);
    fill(this.assignments, def.assignments);
    fill(this.loops, def.loops);
    fill(this.processors, def.collectionProcessors);
    fill(this.subflows, def.subflows);
    fill(this.customErrors, def.customErrors);
    fill(this.choices, def.choices);
    fill(this.dynamicChoiceSets, def.dynamicChoiceSets);
    fill(this.variables, def.variables);
    fill(this.constants, def.constants);
    fill(this.formulas, def.formulas);
    fill(this.textTemplates, def.textTemplates);
    // Anything else that looks like an element array with connectors we can't run
    for (const [key, value] of Object.entries(def)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const capability = elementCapability(key);
      if (capability.level === "degrade") {
        for (const el of value as { name?: string }[]) {
          if (el?.name) this.unsupportedElements.set(el.name, capability.note ?? key);
        }
      }
    }
  }
}

/**
 * Resolve a merge reference within the active frame: answers (incl. composite
 * dotted answers), created ids, single-record lookup fields, loop current
 * items, constants, formulas, text templates.
 */
function resolveRef(
  ref: string,
  frame: FlowFrame,
  index: DefIndex,
  depth = 0,
): FlowAnswerValue | undefined {
  if (depth > MAX_REF_DEPTH) return undefined;
  if (ref in frame.answers) return frame.answers[ref];
  if (ref in frame.createdIds) return frame.createdIds[ref];

  const constant = index.constants.get(ref);
  if (constant) return literalOf(constant.value);

  const formula = index.formulas.get(ref);
  if (formula?.expression != null) {
    const result = evaluateFormula(formula.expression, (r) =>
      scalarOf(resolveRef(r, frame, index, depth + 1)),
    );
    if (!result.ok) throw new FlowUnsupported(ref, `formula not evaluable (${result.reason})`);
    return result.value;
  }

  const template = index.textTemplates.get(ref);
  if (template?.text != null) return interpolate(template.text, frame, index, depth + 1);

  // Dotted refs: Element.Field / LoopName.Field / Composite.sub
  const dot = ref.indexOf(".");
  if (dot > 0) {
    const head = ref.slice(0, dot);
    const rest = ref.slice(dot + 1);
    // Screen-component outputs ({!Toggle.value}, {!Slider.value}) live in the
    // answers map under the component's name.
    if (rest === "value" && head in frame.answers) return frame.answers[head];
    // Loop current item
    const loop = index.loops.get(head);
    if (loop) {
      const rows = frame.collections[loop.collectionReference ?? ""] ?? [];
      const item = rows[frame.loops[head] ?? 0];
      if (!item) return undefined;
      return rest === "Id" ? item.id : item.cells[rest];
    }
    // Single-record lookup output
    const rows = frame.collections[head];
    if (rows) {
      const first = rows[0];
      if (!first) return undefined;
      return rest === "Id" ? first.id : first.cells[rest];
    }
  }

  const variable = index.variables.get(ref);
  if (variable) return literalOf(variable.value);

  return undefined;
}

function interpolate(text: string, frame: FlowFrame, index: DefIndex, depth = 0): string {
  return text.replace(/\{!([A-Za-z0-9_.$]+)\}/g, (_m, ref: string) => {
    try {
      const v = resolveRef(ref, frame, index, depth);
      return v === undefined || v === null ? "" : String(scalarOf(v) ?? "");
    } catch {
      return "";
    }
  });
}

// ---------------------------------------------------------------------------
// Conditions (decisions, visibility, collection filters)
// ---------------------------------------------------------------------------

function typedCompare(l: CrmFieldValue, operator: string, r: CrmFieldValue): boolean {
  switch (operator) {
    case "EqualTo":
      return looseEq(l, r);
    case "NotEqualTo":
      return !looseEq(l, r);
    case "IsNull":
      return r === true || r === null ? l == null || l === "" : !(l == null || l === "");
    case "IsBlank":
      return l == null || l === "";
    case "GreaterThan":
      return orderable(l, r, (a, b) => a > b);
    case "GreaterThanOrEqualTo":
      return orderable(l, r, (a, b) => a >= b);
    case "LessThan":
      return orderable(l, r, (a, b) => a < b);
    case "LessThanOrEqualTo":
      return orderable(l, r, (a, b) => a <= b);
    case "Contains":
      return String(l ?? "").includes(String(r ?? ""));
    case "StartsWith":
      return String(l ?? "").startsWith(String(r ?? ""));
    case "EndsWith":
      return String(l ?? "").endsWith(String(r ?? ""));
    default:
      throw new FlowUnsupported("condition", `operator ${operator} not supported`);
  }
}

function looseEq(l: CrmFieldValue, r: CrmFieldValue): boolean {
  if (l === null || r === null) return (l ?? null) === (r ?? null);
  if (typeof l === "boolean" || typeof r === "boolean") {
    return (l === true || l === "true") === (r === true || r === "true");
  }
  if (typeof l === "number" || typeof r === "number") {
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn)) return ln === rn;
  }
  return String(l) === String(r);
}

function orderable(l: CrmFieldValue, r: CrmFieldValue, cmp: (a: number | string, b: number | string) => boolean): boolean {
  const ln = Number(l);
  const rn = Number(r);
  if (l != null && r != null && Number.isFinite(ln) && Number.isFinite(rn)) return cmp(ln, rn);
  return cmp(String(l ?? ""), String(r ?? "")); // ISO dates compare lexically
}

function conditionsHold(
  logic: string | null | undefined,
  conditions: MetaCondition[] | null | undefined,
  frame: FlowFrame,
  index: DefIndex,
): boolean {
  const results = (conditions ?? []).map((c) => {
    const left =
      c.leftValueReference != null ? scalarOf(resolveRef(c.leftValueReference, frame, index)) : null;
    const right =
      c.rightValue?.elementReference != null
        ? scalarOf(resolveRef(c.rightValue.elementReference, frame, index))
        : literalOf(c.rightValue);
    return typedCompare(left, c.operator ?? "EqualTo", right);
  });
  if (results.length === 0) return true;
  return (logic ?? "and") === "or" ? results.some(Boolean) : results.every(Boolean);
}

// ---------------------------------------------------------------------------
// Record lookups (eager, bounded) — fields discovered from usage
// ---------------------------------------------------------------------------

function referencedFields(index: DefIndex, lookupName: string): string[] {
  const lookup = index.lookups.get(lookupName);
  const fields = new Set<string>(lookup?.queriedFields ?? []);
  if (lookup?.sortField) fields.add(lookup.sortField);
  // Data-table columns bound to this lookup
  for (const screen of index.screens.values()) {
    for (const field of flattenFields(screen.fields)) {
      if (field.extensionName !== "flowruntime:datatable") continue;
      const params = paramMap(field);
      if (params.get("tableData")?.elementReference !== lookupName) continue;
      for (const column of parseColumns(params)) fields.add(column.api);
    }
  }
  // Dotted merge refs anywhere in the definition
  const pattern = new RegExp(`\\{!${lookupName}\\.([A-Za-z0-9_]+)\\}`, "g");
  const raw = JSON.stringify(index.def);
  for (const match of raw.matchAll(pattern)) fields.add(match[1]!);
  // Bare dotted references in condition/assignment slots
  const bare = new RegExp(`"${lookupName}\\.([A-Za-z0-9_]+)"`, "g");
  for (const match of raw.matchAll(bare)) fields.add(match[1]!);
  fields.delete("Id");
  return [...fields].slice(0, 20);
}

function flattenFields(fields: MetaScreenField[] | null | undefined): MetaScreenField[] {
  const out: MetaScreenField[] = [];
  for (const f of fields ?? []) {
    out.push(f);
    if (f.fields?.length) out.push(...flattenFields(f.fields));
  }
  return out;
}

function paramMap(field: MetaScreenField): Map<string, MetaValue> {
  const params = new Map<string, MetaValue>();
  for (const p of field.inputParameters ?? []) {
    if (p.name != null) params.set(p.name, p.value ?? {});
  }
  return params;
}

function parseColumns(params: Map<string, MetaValue>): { api: string; label: string }[] {
  const raw = literalOf(params.get("columns"));
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as {
      apiName?: string;
      customHeaderLabel?: string;
      hasCustomHeaderLabel?: boolean;
    }[];
    return parsed
      .filter((c) => c.apiName)
      .map((c) => ({
        api: c.apiName!,
        label: c.hasCustomHeaderLabel && c.customHeaderLabel ? c.customHeaderLabel : c.apiName!,
      }));
  } catch {
    return [];
  }
}

async function runLookup(
  lookup: MetaRecordLookup,
  frame: FlowFrame,
  index: DefIndex,
  effects: FlowRuntimeEffects,
): Promise<void> {
  if (!lookup.object) throw new FlowUnsupported(lookup.name, "lookup has no object");
  const filters: FlowQueryFilter[] = (lookup.filters ?? []).map((f) => ({
    field: f.field ?? "Id",
    operator: f.operator ?? "EqualTo",
    value:
      f.value?.elementReference != null
        ? scalarOf(resolveRef(f.value.elementReference, frame, index))
        : literalOf(f.value),
  }));
  const limit = lookup.getFirstRecordOnly ? 1 : ROW_LIMIT;
  const rows = await effects.queryRecords(lookup.object, referencedFields(index, lookup.name), {
    ...(lookup.sortField ? { sortField: lookup.sortField } : {}),
    sortOrder: lookup.sortOrder === "Desc" ? "Desc" : "Asc",
    limit,
    ...(filters.length ? { filters } : {}),
  });
  // Enforce the bound here too — an adapter that over-returns must not widen
  // a single-record reference into a bulk write target.
  frame.collections[lookup.name] = rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Screen rendering
// ---------------------------------------------------------------------------

function visibilityFor(
  field: MetaScreenField,
  screen: MetaScreen,
  frame: FlowFrame,
  index: DefIndex,
): { include: boolean; rule?: FlowVisibilityRule } {
  const rule = field.visibilityRule;
  if (!rule?.conditions?.length) return { include: true };
  const screenFieldNames = new Set(flattenFields(screen.fields).map((f) => f.name));
  const sameScreen = rule.conditions.every(
    (c) => c.leftValueReference != null && screenFieldNames.has(c.leftValueReference.split(".")[0]!),
  );
  if (sameScreen) {
    // Ship to the widget for live evaluation.
    return {
      include: true,
      rule: {
        logic: (rule.conditionLogic ?? "and") === "or" ? "or" : "and",
        conditions: rule.conditions.map((c) => ({
          ref: c.leftValueReference ?? "",
          operator: c.operator ?? "EqualTo",
          value:
            c.rightValue?.elementReference != null
              ? scalarOf(resolveRef(c.rightValue.elementReference, frame, index))
              : literalOf(c.rightValue),
        })),
      },
    };
  }
  // Cross-screen refs: server decides now.
  return { include: conditionsHold(rule.conditionLogic, rule.conditions, frame, index) };
}

async function renderField(
  f: MetaScreenField,
  screen: MetaScreen,
  frame: FlowFrame,
  index: DefIndex,
  effects: FlowRuntimeEffects,
): Promise<FlowRenderField | null> {
  const vis = visibilityFor(f, screen, frame, index);
  if (!vis.include) return null;
  const common: FieldCommon = {
    name: f.name,
    ...(vis.rule ? { visibility: vis.rule } : {}),
    ...(f.helpText != null ? { helpText: f.helpText } : {}),
  };
  const fieldType = f.fieldType ?? "";
  const capability = screenFieldCapability(fieldType, f.extensionName ?? undefined);

  if (fieldType === "RegionContainer" || fieldType === "Region") {
    const children: FlowRenderField[] = [];
    for (const child of f.fields ?? []) {
      const rendered = await renderField(child, screen, frame, index, effects);
      if (rendered) children.push(rendered);
    }
    return { kind: "section", label: f.fieldText ?? "", fields: children, ...common };
  }

  if (capability.level === "degrade") {
    return {
      kind: "unsupported",
      label: f.fieldText ?? f.name,
      componentType: f.extensionName ?? fieldType,
      note: capability.note ?? "Not supported in chat.",
      ...common,
    };
  }

  if (fieldType === "DisplayText") {
    return { kind: "display", html: sanitizeHtml(interpolate(f.fieldText ?? "", frame, index)), ...common };
  }

  if (fieldType === "InputField" || fieldType === "ObjectProvided") {
    const dataType = (f.dataType ?? "String") as
      | "String"
      | "Number"
      | "Currency"
      | "Date"
      | "DateTime"
      | "Boolean";
    const label =
      fieldType === "ObjectProvided"
        ? (f.objectFieldReference?.split(".").pop() ?? f.name)
        : (f.fieldText ?? f.name);
    const answerKey = fieldType === "ObjectProvided" ? (f.objectFieldReference ?? f.name) : f.name;
    return {
      kind: "input",
      name: answerKey,
      ...(vis.rule ? { visibility: vis.rule } : {}),
      ...(f.helpText != null ? { helpText: f.helpText } : {}),
      label,
      dataType,
      required: f.isRequired ?? false,
      defaultValue:
        scalarOf(frame.answers[answerKey]) ??
        (f.defaultValue?.elementReference != null
          ? scalarOf(resolveRef(f.defaultValue.elementReference, frame, index))
          : literalOf(f.defaultValue)),
    };
  }

  if (fieldType === "LargeTextArea") {
    const prior = scalarOf(frame.answers[f.name]);
    return {
      kind: "textarea",
      label: f.fieldText ?? f.name,
      required: f.isRequired ?? false,
      defaultValue: prior === null ? null : String(prior),
      ...common,
    };
  }

  if (
    fieldType === "RadioButtons" ||
    fieldType === "DropdownBox" ||
    fieldType === "MultiSelectCheckboxes" ||
    fieldType === "MultiSelectPicklist"
  ) {
    const staticOptions: FlowChoiceOption[] = [];
    let dynamicSet: MetaDynamicChoiceSet | null = null;
    for (const ref of asArray(f.choiceReferences)) {
      const choice = index.choices.get(ref);
      if (choice) {
        const value = literalOf(choice.value);
        staticOptions.push({
          value: value === null ? choice.name : String(value),
          label: choice.choiceText ?? choice.name,
        });
        continue;
      }
      dynamicSet = index.dynamicChoiceSets.get(ref) ?? dynamicSet;
    }
    let options = staticOptions;
    if (dynamicSet?.object && dynamicSet.displayField && dynamicSet.valueField) {
      try {
        options = [
          ...staticOptions,
          ...(await effects.choiceOptions(dynamicSet.object, dynamicSet.valueField, dynamicSet.displayField)),
        ];
      } catch {
        // Choice source unavailable — the field stays usable with static options.
      }
    }
    const defaultChoice = f.defaultSelectedChoiceReference
      ? index.choices.get(f.defaultSelectedChoiceReference)
      : undefined;
    const prior = frame.answers[f.name];
    return {
      kind: "choice",
      label: f.fieldText ?? f.name,
      style:
        fieldType === "RadioButtons" ? "radio" : fieldType === "DropdownBox" ? "dropdown" : "multiselect",
      required: f.isRequired ?? false,
      options,
      defaultValue:
        prior !== undefined && prior !== null
          ? String(scalarOf(prior))
          : defaultChoice
            ? String(literalOf(defaultChoice.value) ?? defaultChoice.name)
            : null,
      ...common,
    };
  }

  if (fieldType === "ComponentInstance") {
    const params = paramMap(f);
    const extension = f.extensionName ?? "";
    const label = String(literalOf(params.get("label")) ?? f.fieldText ?? f.name);

    if (extension === "flowruntime:datatable") {
      const modeRaw = String(literalOf(params.get("selectionMode")) ?? "").toUpperCase();
      const selectionMode =
        modeRaw === "SINGLE_SELECT" ? "single" : modeRaw === "NO_SELECTION" ? "none" : "multi";
      const columns = parseColumns(params);
      const sourceRef = params.get("tableData")?.elementReference ?? null;
      const rows = sourceRef ? (frame.collections[sourceRef] ?? []).slice(0, TABLE_ROW_LIMIT) : [];
      const max = literalOf(params.get("maxRowSelection"));
      return {
        kind: "datatable",
        label,
        selectionMode,
        required: f.isRequired ?? false,
        maxSelection:
          selectionMode === "single" ? 1 : typeof max === "number" && max > 0 ? max : TABLE_ROW_LIMIT,
        columns,
        rows,
        ...common,
      };
    }
    if (extension === "flowruntime:toggle") {
      return {
        kind: "input",
        label: String(literalOf(params.get("label")) ?? f.name),
        dataType: "Boolean",
        inputStyle: "toggle",
        required: false,
        defaultValue: scalarOf(frame.answers[f.name]) ?? literalOf(params.get("value")),
        ...common,
      };
    }
    if (extension === "flowruntime:slider") {
      const numberOr = (name: string, fallback: number) => {
        const v = literalOf(params.get(name));
        return typeof v === "number" ? v : fallback;
      };
      const prior = scalarOf(frame.answers[f.name]);
      return {
        kind: "slider",
        label,
        min: numberOr("min", 0),
        max: numberOr("max", 100),
        step: numberOr("step", 1),
        defaultValue: typeof prior === "number" ? prior : numberOr("value", 0),
        ...common,
      };
    }
    if (extension === "flowruntime:email" || extension === "flowruntime:phone" || extension === "flowruntime:url") {
      const style = extension.split(":")[1] as "email" | "phone" | "url";
      return {
        kind: "input",
        label,
        dataType: "String",
        inputStyle: style,
        required: literalOf(params.get("required")) === true,
        defaultValue: scalarOf(frame.answers[f.name]) ?? literalOf(params.get("value")),
        ...common,
      };
    }
    if (extension === "flowruntime:name") {
      return {
        kind: "composite",
        label,
        inputs: [
          { key: "firstName", label: "First name" },
          { key: "lastName", label: "Last name" },
        ],
        ...common,
      };
    }
    if (extension === "flowruntime:address") {
      return {
        kind: "composite",
        label,
        inputs: [
          { key: "street", label: "Street" },
          { key: "city", label: "City" },
          { key: "province", label: "State/Province" },
          { key: "postalCode", label: "Postal code" },
          { key: "country", label: "Country" },
        ],
        ...common,
      };
    }
    if (extension === "flowruntime:image") {
      const url = String(literalOf(params.get("imageUrl")) ?? "");
      return {
        kind: "display",
        html: url ? `<p><a href="${url.replace(/"/g, "&quot;")}" rel="noreferrer">${label || "Image"}</a></p>` : "",
        ...common,
      };
    }
  }

  return {
    kind: "unsupported",
    label: f.fieldText ?? f.name,
    componentType: f.extensionName ?? fieldType,
    note: capability.note ?? "Not supported in chat.",
    ...common,
  };
}

async function renderScreen(
  screen: MetaScreen,
  frame: FlowFrame,
  index: DefIndex,
  effects: FlowRuntimeEffects,
  errors?: Map<string, string>,
): Promise<FlowRenderScreen> {
  const fields: FlowRenderField[] = [];
  for (const f of screen.fields ?? []) {
    const rendered = await renderField(f, screen, frame, index, effects);
    if (rendered) {
      const error = errors?.get(rendered.name);
      fields.push(error ? { ...rendered, error } : rendered);
    }
  }
  return {
    name: screen.name,
    label: interpolate(screen.label ?? screen.name, frame, index),
    allowBack: screen.allowBack ?? false,
    allowFinish: screen.allowFinish ?? true,
    stepIndex: frame.screenCount + 1,
    fields,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type WriteElement =
  | { kind: "create"; meta: MetaRecordCreate }
  | { kind: "update"; meta: MetaRecordUpdate }
  | { kind: "delete"; meta: MetaRecordDelete };

function writeElementAt(cursor: string, index: DefIndex): WriteElement | null {
  const create = index.creates.get(cursor);
  if (create) return { kind: "create", meta: create };
  const update = index.updates.get(cursor);
  if (update) return { kind: "update", meta: update };
  const del = index.deletes.get(cursor);
  if (del) return { kind: "delete", meta: del };
  return null;
}

function resolveAssignments(
  assignments: MetaInputAssignment[] | null | undefined,
  frame: FlowFrame,
  index: DefIndex,
): { field: string; value: CrmFieldValue }[] {
  return (assignments ?? []).map((a) => ({
    field: a.field ?? "?",
    value:
      a.value?.elementReference != null
        ? scalarOf(resolveRef(a.value.elementReference, frame, index))
        : literalOf(a.value),
  }));
}

function targetsOf(
  meta: { inputReference?: string | null; filters?: MetaFilter[] | null; object?: string | null },
  frame: FlowFrame,
  index: DefIndex,
): { object: string; ids: string[] } {
  // Case A: a record/collection variable reference (commonly a lookup output).
  if (meta.inputReference != null) {
    const rows = frame.collections[meta.inputReference];
    if (rows) {
      const lookup = index.lookups.get(meta.inputReference);
      return { object: lookup?.object ?? meta.object ?? "Unknown", ids: rows.map((r) => r.id) };
    }
    const scalar = scalarOf(resolveRef(meta.inputReference, frame, index));
    if (typeof scalar === "string" && scalar) {
      return { object: meta.object ?? "Unknown", ids: [scalar] };
    }
    throw new FlowUnsupported(meta.inputReference, "record reference could not be resolved");
  }
  // Case B: filters — support the id-equality shape; anything broader degrades
  // (mass updates from chat need more guard rails than a spike should grant).
  const filters = meta.filters ?? [];
  const idFilter = filters.find((f) => (f.field ?? "") === "Id" && (f.operator ?? "EqualTo") === "EqualTo");
  if (idFilter && meta.object) {
    const id =
      idFilter.value?.elementReference != null
        ? scalarOf(resolveRef(idFilter.value.elementReference, frame, index))
        : literalOf(idFilter.value);
    if (typeof id === "string" && id) return { object: meta.object, ids: [id] };
  }
  throw new FlowUnsupported(meta.object ?? "write", "only id-targeted updates/deletes run from chat");
}

function pendingWriteFor(element: WriteElement, frame: FlowFrame, index: DefIndex): FlowPendingWrite {
  if (element.kind === "create") {
    const assignments = resolveAssignments(element.meta.inputAssignments, frame, index);
    return {
      kind: "create",
      object: element.meta.object ?? "Unknown",
      targetIds: [],
      assignments,
      description: `Create a ${element.meta.object ?? "record"}`,
    };
  }
  if (element.kind === "update") {
    const { object, ids } = targetsOf(element.meta, frame, index);
    return {
      kind: "update",
      object,
      targetIds: ids,
      assignments: resolveAssignments(element.meta.inputAssignments, frame, index),
      description: `Update ${ids.length} ${object} record${ids.length === 1 ? "" : "s"}`,
    };
  }
  const { object, ids } = targetsOf(element.meta, frame, index);
  return {
    kind: "delete",
    object,
    targetIds: ids,
    assignments: [],
    description: `Delete ${ids.length} ${object} record${ids.length === 1 ? "" : "s"}`,
  };
}

async function executeWrite(
  element: WriteElement,
  write: FlowPendingWrite,
  frame: FlowFrame,
  effects: FlowRuntimeEffects,
): Promise<void> {
  if (write.kind === "create") {
    const fields: Record<string, CrmFieldValue> = {};
    for (const a of write.assignments) fields[a.field] = a.value;
    const id = await effects.createRecord(write.object, fields);
    frame.createdIds[element.meta.name] = id;
    return;
  }
  if (write.kind === "update") {
    if (!effects.updateRecord) throw new FlowUnsupported(element.meta.name, "updates not wired");
    const fields: Record<string, CrmFieldValue> = {};
    for (const a of write.assignments) fields[a.field] = a.value;
    if (write.targetIds.length > 25) {
      throw new FlowUnsupported(element.meta.name, "bulk update larger than 25 records");
    }
    for (const id of write.targetIds) await effects.updateRecord(write.object, id, fields);
    return;
  }
  if (!effects.deleteRecord) throw new FlowUnsupported(element.meta.name, "deletes not wired");
  if (write.targetIds.length > 25) {
    throw new FlowUnsupported(element.meta.name, "bulk delete larger than 25 records");
  }
  for (const id of write.targetIds) await effects.deleteRecord(write.object, id);
}

// ---------------------------------------------------------------------------
// Collection processors, assignments, loops
// ---------------------------------------------------------------------------

function runProcessor(processor: MetaCollectionProcessor, frame: FlowFrame, index: DefIndex): void {
  const source = frame.collections[processor.collectionReference ?? ""];
  if (!source) throw new FlowUnsupported(processor.name, "source collection not materialized");
  const subtype = processor.elementSubtype ?? "";
  if (subtype === "SortCollectionProcessor") {
    const sorted = [...source];
    for (const opt of [...(processor.sortOptions ?? [])].reverse()) {
      const field = opt.sortField ?? "Id";
      const dir = opt.sortOrder === "Desc" ? -1 : 1;
      sorted.sort((a, b) => {
        const av = field === "Id" ? a.id : (a.cells[field] ?? null);
        const bv = field === "Id" ? b.id : (b.cells[field] ?? null);
        if (av === bv) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av < bv ? -1 : 1) * dir;
      });
    }
    frame.collections[processor.name] =
      processor.limitCount != null ? sorted.slice(0, processor.limitCount) : sorted;
    return;
  }
  if (subtype === "FilterCollectionProcessor") {
    frame.collections[processor.name] = source.filter((row) => {
      const results = (processor.conditions ?? []).map((c) => {
        const ref = c.leftValueReference ?? "";
        const fieldName = ref.includes(".") ? ref.split(".").pop()! : ref;
        const left = fieldName === "Id" ? row.id : (row.cells[fieldName] ?? null);
        const right =
          c.rightValue?.elementReference != null
            ? scalarOf(resolveRef(c.rightValue.elementReference, frame, index))
            : literalOf(c.rightValue);
        return typedCompare(left, c.operator ?? "EqualTo", right);
      });
      if (results.length === 0) return true;
      return (processor.conditionLogic ?? "and") === "or" ? results.some(Boolean) : results.every(Boolean);
    });
    return;
  }
  throw new FlowUnsupported(processor.name, `collection processor ${subtype || "unknown"} not supported`);
}

function runAssignment(assignment: MetaAssignment, frame: FlowFrame, index: DefIndex): void {
  for (const item of assignment.assignmentItems ?? []) {
    const target = item.assignToReference;
    if (target == null) continue;
    const value =
      item.value?.elementReference != null
        ? resolveRef(item.value.elementReference, frame, index)
        : literalOf(item.value);
    const operator = item.operator ?? "Assign";
    if (operator === "Assign") {
      frame.answers[target] = (value ?? null) as FlowAnswerValue;
    } else if (operator === "Add") {
      const current = frame.answers[target];
      if (Array.isArray(current)) {
        current.push(String(scalarOf((value ?? null) as FlowAnswerValue) ?? ""));
      } else if (typeof current === "number" && typeof value === "number") {
        frame.answers[target] = current + value;
      } else {
        frame.answers[target] = String(scalarOf(current) ?? "") + String(scalarOf((value ?? null) as FlowAnswerValue) ?? "");
      }
    } else if (operator === "Subtract") {
      frame.answers[target] = Number(scalarOf(frame.answers[target]) ?? 0) - Number(scalarOf((value ?? null) as FlowAnswerValue) ?? 0);
    } else {
      throw new FlowUnsupported(assignment.name, `assignment operator ${operator} not supported`);
    }
  }
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

interface WalkContext {
  resolver: FlowDefResolver;
  effects: FlowRuntimeEffects;
  defs: Map<string, DefIndex>;
}

async function indexFor(flowApiName: string, ctx: WalkContext): Promise<DefIndex> {
  const cached = ctx.defs.get(flowApiName);
  if (cached) return cached;
  const def = await ctx.resolver(flowApiName);
  if (!def) throw new FlowUnsupported(flowApiName, "flow definition unavailable");
  const index = new DefIndex(def);
  ctx.defs.set(flowApiName, index);
  return index;
}

async function walk(
  from: string | null,
  session: FlowInterviewSession,
  ctx: WalkContext,
  screenErrors?: Map<string, string>,
): Promise<FlowStepResult> {
  let cursor: string | null = from;
  for (let step = 0; step < MAX_STEPS; step++) {
    const frame = activeFrame(session);
    const index = await indexFor(frame.flow, ctx);

    if (!cursor) {
      // Frame finished. Pop subflow frames back into the parent.
      if (session.frames.length > 1) {
        const finished = session.frames.pop()!;
        const parent = activeFrame(session);
        const parentIndex = await indexFor(parent.flow, ctx);
        const subflowMeta = finished.subflowElement
          ? parentIndex.subflows.get(finished.subflowElement)
          : undefined;
        for (const out of subflowMeta?.outputAssignments ?? []) {
          if (out.name != null && out.assignToReference != null) {
            parent.answers[out.assignToReference] =
              finished.answers[out.name] ?? (null as FlowAnswerValue);
          }
        }
        if (subflowMeta?.storeOutputAutomatically && finished.subflowElement) {
          for (const [name, value] of Object.entries(finished.answers)) {
            parent.answers[`${finished.subflowElement}.${name}`] = value;
          }
        }
        cursor = finished.returnTo;
        continue;
      }
      return {
        type: "finished",
        session,
        summary: `Flow "${index.def.label ?? frame.flow}" finished.`,
      };
    }

    const unsupportedNote = index.unsupportedElements.get(cursor);
    if (unsupportedNote !== undefined) {
      return { type: "degrade", element: cursor, reason: unsupportedNote };
    }

    const screen = index.screens.get(cursor);
    if (screen) {
      frame.cursor = cursor;
      const rendered = await renderScreen(screen, frame, index, ctx.effects, screenErrors);
      return { type: "screen", screen: rendered, session };
    }

    const decision = index.decisions.get(cursor);
    if (decision) {
      let next: string | null = null;
      for (const rule of decision.rules ?? []) {
        if (conditionsHold(rule.conditionLogic, rule.conditions, frame, index)) {
          next = rule.connector?.targetReference ?? null;
          break;
        }
      }
      cursor = next ?? decision.defaultConnector?.targetReference ?? null;
      continue;
    }

    const lookup = index.lookups.get(cursor);
    if (lookup) {
      await runLookup(lookup, frame, index, ctx.effects);
      cursor = lookup.connector?.targetReference ?? null;
      continue;
    }

    const assignment = index.assignments.get(cursor);
    if (assignment) {
      runAssignment(assignment, frame, index);
      cursor = assignment.connector?.targetReference ?? null;
      continue;
    }

    const loop = index.loops.get(cursor);
    if (loop) {
      const rows = frame.collections[loop.collectionReference ?? ""];
      if (!rows) throw new FlowUnsupported(loop.name, "loop collection not materialized");
      const iteration = frame.loops[loop.name];
      const nextIndex = iteration === undefined ? 0 : iteration + 1;
      const ordered = loop.iterationOrder === "Desc" ? [...rows].reverse() : rows;
      if (nextIndex < ordered.length) {
        frame.loops[loop.name] = nextIndex;
        // resolveRef reads the CURRENT index from frame.loops via the original
        // collection ordering — store the ordered view for consistency.
        frame.collections[loop.collectionReference ?? ""] = ordered;
        cursor = loop.nextValueConnector?.targetReference ?? null;
      } else {
        delete frame.loops[loop.name];
        cursor = loop.noMoreValuesConnector?.targetReference ?? null;
      }
      continue;
    }

    const processor = index.processors.get(cursor);
    if (processor) {
      runProcessor(processor, frame, index);
      cursor = processor.connector?.targetReference ?? null;
      continue;
    }

    const subflow = index.subflows.get(cursor);
    if (subflow) {
      if (session.frames.length >= 3) {
        throw new FlowUnsupported(subflow.name, "subflow nesting deeper than 2 levels");
      }
      if (!subflow.flowName) throw new FlowUnsupported(subflow.name, "subflow has no flow name");
      const subIndex = await indexFor(subflow.flowName, ctx);
      const answers: Record<string, FlowAnswerValue> = {};
      for (const input of subflow.inputAssignments ?? []) {
        if (input.name != null) {
          answers[input.name] =
            input.value?.elementReference != null
              ? (resolveRef(input.value.elementReference, frame, index) ?? null)
              : literalOf(input.value);
        }
      }
      session.frames.push({
        flow: subflow.flowName,
        cursor: "",
        visitedScreens: [],
        answers,
        createdIds: {},
        collections: {},
        loops: {},
        pendingWrite: null,
        returnTo: subflow.connector?.targetReference ?? null,
        subflowElement: subflow.name,
        screenCount: frame.screenCount,
      });
      cursor = subIndex.def.start?.connector?.targetReference ?? null;
      continue;
    }

    const customError = index.customErrors.get(cursor);
    if (customError) {
      const message =
        customError.customErrorMessages?.[0]?.errorMessage ?? "The flow raised an error.";
      return {
        type: "finished",
        session,
        summary: interpolate(message, frame, index),
        failed: true,
      };
    }

    const write = writeElementAt(cursor, index);
    if (write) {
      frame.cursor = cursor;
      frame.pendingWrite = cursor;
      return { type: "confirm-write", write: pendingWriteFor(write, frame, index), session };
    }

    throw new FlowUnsupported(cursor, "unrecognized flow element");
  }
  throw new FlowUnsupported("flow", "traversal exceeded the step limit (cycle or oversized loop)");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateScreen(
  screen: MetaScreen,
  frame: FlowFrame,
  index: DefIndex,
): Map<string, string> {
  const errors = new Map<string, string>();
  for (const f of flattenFields(screen.fields)) {
    const rule = f.validationRule;
    if (!rule?.formulaExpression) continue;
    const result = evaluateFormula(rule.formulaExpression, (ref) =>
      scalarOf(resolveRef(ref, frame, index)),
    );
    // Unevaluable validation formulas don't block (Salesforce re-validates on
    // its side for handoff paths; analysis flags these for the admin).
    if (result.ok && result.value === false) {
      errors.set(f.name, rule.errorMessage ?? "Invalid value.");
    }
  }
  return errors;
}

function requiredMissing(rendered: FlowRenderScreen, frame: FlowFrame): boolean {
  const check = (fields: FlowRenderField[]): boolean =>
    fields.some((f) => {
      if (f.kind === "section") return check(f.fields);
      if (!("required" in f) || !f.required) return false;
      if (f.kind === "input" && f.dataType === "Boolean") return false;
      const v = frame.answers[f.name];
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });
  return check(rendered.fields);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startFlowInterview(
  flowApiName: string,
  resolver: FlowDefResolver,
  effects: FlowRuntimeEffects,
  initialAnswers: Record<string, FlowAnswerValue> = {},
): Promise<FlowStepResult> {
  const ctx: WalkContext = { resolver, effects, defs: new Map() };
  const index = await indexFor(flowApiName, ctx);
  const answers: Record<string, FlowAnswerValue> = {};
  // Input variables seed from their defaults, then from provided context.
  for (const variable of index.variables.values()) {
    const dflt = literalOf(variable.value);
    if (dflt !== null) answers[variable.name] = dflt;
  }
  for (const [key, value] of Object.entries(initialAnswers)) answers[key] = value;
  const session: FlowInterviewSession = {
    v: 2,
    frames: [
      {
        flow: flowApiName,
        cursor: "",
        visitedScreens: [],
        answers,
        createdIds: {},
        collections: {},
        loops: {},
        pendingWrite: null,
        returnTo: null,
        subflowElement: null,
        screenCount: 0,
      },
    ],
  };
  try {
    return await walk(index.def.start?.connector?.targetReference ?? null, session, ctx);
  } catch (error) {
    if (error instanceof FlowUnsupported) {
      return { type: "degrade", element: error.element, reason: error.reason };
    }
    throw error;
  }
}

export async function continueFlowInterview(
  resolver: FlowDefResolver,
  state: string,
  answers: Record<string, FlowAnswerValue>,
  opts: { confirmWrite?: boolean; back?: boolean },
  effects: FlowRuntimeEffects,
): Promise<FlowStepResult> {
  const session = decodeInterviewState(state);
  const ctx: WalkContext = { resolver, effects, defs: new Map() };
  const frame = activeFrame(session);
  const index = await indexFor(frame.flow, ctx);

  try {
    if (frame.pendingWrite) {
      const element = writeElementAt(frame.pendingWrite, index);
      if (!element) throw new FlowUnsupported(frame.pendingWrite, "pending write element not found");
      if (!opts.confirmWrite) {
        return {
          type: "finished",
          session,
          summary: `Flow "${index.def.label ?? frame.flow}" cancelled — nothing was written.`,
        };
      }
      const write = pendingWriteFor(element, frame, index);
      await executeWrite(element, write, frame, effects);
      frame.pendingWrite = null;
      return await walk(element.meta.connector?.targetReference ?? null, session, ctx);
    }

    const screen = index.screens.get(frame.cursor);
    if (!screen) throw new FlowUnsupported(frame.cursor, "interview cursor is not a screen");

    if (opts.back) {
      const previousName = frame.visitedScreens.pop();
      const previous = previousName ? index.screens.get(previousName) : undefined;
      if (!previous) throw new FlowUnsupported(screen.name, "no previous screen to go back to");
      frame.cursor = previous.name;
      frame.screenCount = Math.max(0, frame.screenCount - 1);
      const rendered = await renderScreen(previous, frame, index, effects);
      return { type: "screen", screen: rendered, session };
    }

    for (const [name, value] of Object.entries(answers)) frame.answers[name] = value;

    const validationErrors = validateScreen(screen, frame, index);
    const rendered = await renderScreen(screen, frame, index, effects, validationErrors);
    if (validationErrors.size > 0 || requiredMissing(rendered, frame)) {
      return { type: "screen", screen: rendered, session };
    }

    frame.visitedScreens.push(screen.name);
    frame.screenCount += 1;
    return await walk(screen.connector?.targetReference ?? null, session, ctx);
  } catch (error) {
    if (error instanceof FlowUnsupported) {
      return { type: "degrade", element: error.element, reason: error.reason };
    }
    throw error;
  }
}
