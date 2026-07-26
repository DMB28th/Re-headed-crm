/**
 * Salesforce Quick Actions in chat (v1) — the single-screen sibling of the
 * flow NATIVE rung. A quick action is one mini-layout of fields plus an
 * execute endpoint that SALESFORCE runs (its validations, predefined values,
 * triggers) — so unlike flows there is nothing to interpret: map the describe
 * layout to the same FlowRenderScreen the flow-run widget already renders,
 * confirm before executing (rule 8), and hand the values to the CRM.
 *
 * State rides in the same opaque-token pattern as flow interviews; the token
 * shape ({ v: 1, kind: "quick-action" }) is how crm_flow_continue tells the
 * two apart.
 */
import type { CrmFieldValue } from "./crm-types.js";
import type { FlowPendingWrite, FlowRenderField, FlowRenderScreen } from "./flow-interview.js";

// ---------------------------------------------------------------------------
// Adapter-facing shapes
// ---------------------------------------------------------------------------

export interface QuickActionSummary {
  api: string;
  label: string;
  /** Salesforce action type: Create, Update, LogACall, SendEmail, Post, Flow, … */
  type: string;
  targetObject: string | null;
}

/** Loose subset of GET /quickActions/{name}/describe we consume. */
export interface QuickActionDescribeJson {
  name?: string;
  label?: string;
  type?: string;
  targetSobjectType?: string | null;
  contextSobjectType?: string | null;
  layout?: {
    layoutRows?: {
      layoutItems?: {
        label?: string | null;
        required?: boolean | null;
        editableForNew?: boolean | null;
        layoutComponents?: {
          value?: string | null;
          details?: {
            type?: string | null;
            label?: string | null;
            nillable?: boolean | null;
            defaultedOnCreate?: boolean | null;
            picklistValues?: { value?: string | null; label?: string | null; active?: boolean }[];
            referenceTo?: string[] | null;
          } | null;
        }[];
      }[];
    }[];
  } | null;
  [key: string]: unknown;
}

export interface QuickActionExecuteResult {
  success: boolean;
  createdId: string | null;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Support classification (mirrors the flow capability registry's honesty)
// ---------------------------------------------------------------------------

/** Action types the chat form can render and execute. */
const RENDERABLE_TYPES = new Set(["Create", "Update", "LogACall"]);

export function quickActionSupport(type: string): {
  level: "full" | "handoff";
  note?: string;
} {
  if (RENDERABLE_TYPES.has(type)) return { level: "full" };
  if (type === "SendEmail") {
    return { level: "handoff", note: "Email composition stays in the CRM." };
  }
  if (type === "Post") return { level: "handoff", note: "Feed posts stay in the CRM." };
  if (type === "Flow") {
    return { level: "handoff", note: "Flow-typed actions run via the flow rung instead." };
  }
  return { level: "handoff", note: `Action type ${type} isn't renderable in chat.` };
}

// ---------------------------------------------------------------------------
// State token — distinguishable from flow interview tokens by shape.
// ---------------------------------------------------------------------------

export interface QuickActionState {
  v: 1;
  kind: "quick-action";
  action: string;
  object: string;
  recordId: string;
  answers: Record<string, CrmFieldValue>;
  /** Set once the rep hit Next and the confirm card is showing. */
  confirming: boolean;
}

export function encodeQuickActionState(state: QuickActionState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

/** Returns null when the token isn't a quick-action token (i.e. a flow one). */
export function decodeQuickActionState(token: string): QuickActionState | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as QuickActionState;
    if (parsed.v === 1 && parsed.kind === "quick-action" && typeof parsed.action === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Describe → screen mapping
// ---------------------------------------------------------------------------

interface LayoutFieldInfo {
  api: string;
  label: string;
  type: string;
  required: boolean;
  editable: boolean;
  defaultedOnCreate: boolean;
  picklistValues: { value: string; label: string }[];
  referenceTo: string[];
}

export function quickActionLayoutFields(describe: QuickActionDescribeJson): LayoutFieldInfo[] {
  const fields: LayoutFieldInfo[] = [];
  for (const row of describe.layout?.layoutRows ?? []) {
    for (const item of row.layoutItems ?? []) {
      for (const component of item.layoutComponents ?? []) {
        const details = component.details ?? {};
        if (!component.value) continue;
        fields.push({
          api: component.value,
          label: details.label ?? item.label ?? component.value,
          type: details.type ?? "string",
          required: (item.required ?? false) && !(details.defaultedOnCreate ?? false),
          editable: item.editableForNew ?? true,
          defaultedOnCreate: details.defaultedOnCreate ?? false,
          picklistValues: (details.picklistValues ?? [])
            .filter((p) => p.active !== false && p.value != null)
            .map((p) => ({ value: p.value!, label: p.label ?? p.value! })),
          referenceTo: details.referenceTo ?? [],
        });
      }
    }
  }
  return fields;
}

function fieldControl(
  info: LayoutFieldInfo,
  value: CrmFieldValue,
): FlowRenderField | null {
  if (!info.editable) return null;
  // Reference fields that Salesforce defaults on create (OwnerId → running
  // user) are omitted — the CRM fills them at execute time. Other references
  // render as plain id inputs until the lookup-search editor lands.
  if (info.type === "reference" && info.defaultedOnCreate && value === null) return null;

  if (info.type === "picklist" && info.picklistValues.length > 0) {
    return {
      kind: "choice",
      name: info.api,
      label: info.label,
      style: "dropdown",
      required: info.required,
      options: info.picklistValues,
      defaultValue: value === null ? null : String(value),
    };
  }
  if (info.type === "textarea") {
    return {
      kind: "textarea",
      name: info.api,
      label: info.label,
      required: info.required,
      defaultValue: value === null ? null : String(value),
    };
  }
  const dataType =
    info.type === "currency"
      ? "Currency"
      : info.type === "double" || info.type === "int" || info.type === "percent"
        ? "Number"
        : info.type === "date"
          ? "Date"
          : info.type === "datetime"
            ? "DateTime"
            : info.type === "boolean"
              ? "Boolean"
              : "String";
  const style =
    info.type === "email"
      ? ("email" as const)
      : info.type === "phone"
        ? ("phone" as const)
        : info.type === "url"
          ? ("url" as const)
          : undefined;
  return {
    kind: "input",
    name: info.api,
    label:
      info.type === "reference" && info.referenceTo.length > 0
        ? `${info.label} (${info.referenceTo.slice(0, 2).join("/")} id)`
        : info.label,
    dataType,
    ...(style ? { inputStyle: style } : {}),
    required: info.required,
    defaultValue: value,
  };
}

/**
 * Render the quick action's mini-layout as a single flow screen. `defaults`
 * come from the defaultValues endpoint (record context + admin predefined
 * values); `answers` are the rep's prior entries (back navigation).
 */
export function quickActionScreen(
  describe: QuickActionDescribeJson,
  defaults: Record<string, CrmFieldValue>,
  answers: Record<string, CrmFieldValue>,
): FlowRenderScreen {
  const fields: FlowRenderField[] = [];
  for (const info of quickActionLayoutFields(describe)) {
    const value = answers[info.api] ?? defaults[info.api] ?? null;
    const control = fieldControl(info, value);
    if (control) fields.push(control);
  }
  return {
    name: describe.name ?? "quick_action",
    label: describe.label ?? describe.name ?? "Quick action",
    allowBack: false,
    allowFinish: true,
    stepIndex: 1,
    fields,
  };
}

/** The confirm-card diff for the pending execute (rule 8). */
export function quickActionPendingWrite(
  describe: QuickActionDescribeJson,
  answers: Record<string, CrmFieldValue>,
): FlowPendingWrite {
  const kind = describe.type === "Update" ? "update" : "create";
  const object = describe.targetSobjectType ?? "record";
  const assignments = Object.entries(answers)
    .filter(([, v]) => v !== null && v !== "")
    .map(([field, value]) => ({ field, value }));
  return {
    kind,
    object,
    targetIds: [],
    assignments,
    description:
      kind === "update" ? `Update the ${object} via ${describe.label}` : `${describe.label ?? "Create"} — new ${object}`,
  };
}

/** Required-field check for the screen (server-side; the widget also gates). */
export function quickActionMissingRequired(
  describe: QuickActionDescribeJson,
  answers: Record<string, CrmFieldValue>,
  defaults: Record<string, CrmFieldValue>,
): string[] {
  return quickActionLayoutFields(describe)
    .filter((info) => info.editable && info.required)
    .filter((info) => {
      const v = answers[info.api] ?? defaults[info.api] ?? null;
      return v === null || v === "";
    })
    .map((info) => info.api);
}
