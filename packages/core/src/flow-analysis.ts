/**
 * Static renderability analysis for the NATIVE flow rung (design 10a).
 *
 * Runs at CONFIG time (Studio, when an admin wires a flow action) and at
 * start time (payload labeling): walks the flow definition WITHOUT executing
 * anything and reports exactly which parts the in-chat interpreter can run.
 * Unsupported pieces are a governed downgrade the admin can see — never a
 * runtime surprise.
 */
import { evaluateFormula } from "./flow-expressions.js";
import { elementCapability, screenFieldCapability, FLOW_SETTINGS_KEYS } from "./flow-capabilities.js";
import type { FlowDefinitionJson } from "./flow-interview.js";

export interface FlowSupportBlocker {
  /** Element or screen-field name. */
  name: string;
  /** Where it lives: element array name or "screen:<name>". */
  location: string;
  reason: string;
}

export interface FlowSupportReport {
  /**
   * full     — every element and screen component interprets in chat.
   * partial  — renders in chat until a blocked element/screen; then hands off.
   * handoff  — nothing can render (no screens, or the definition is opaque).
   */
  level: "full" | "partial" | "handoff";
  screenCount: number;
  blockers: FlowSupportBlocker[];
}

interface NamedElement {
  name?: string;
  fieldType?: string | null;
  extensionName?: string | null;
  fields?: NamedElement[] | null;
}

function screenFieldBlockers(
  screenName: string,
  fields: NamedElement[] | null | undefined,
  out: FlowSupportBlocker[],
): void {
  for (const field of fields ?? []) {
    if (field.fields?.length) {
      screenFieldBlockers(screenName, field.fields, out);
    }
    const capability = screenFieldCapability(
      field.fieldType ?? undefined,
      field.extensionName ?? undefined,
    );
    if (capability.level === "degrade") {
      out.push({
        name: field.name ?? "?",
        location: `screen:${screenName}`,
        reason: capability.note ?? "Unsupported screen component.",
      });
    }
  }
}

/** Formula-parse failures that mean "we cannot run this" (vs value-dependent). */
const HARD_FORMULA_FAILURES = [/^unknown function/, /^unknown global/, /^unrecognized syntax$/, /^trailing tokens$/];

export function analyzeFlowSupport(def: FlowDefinitionJson): FlowSupportReport {
  const blockers: FlowSupportBlocker[] = [];

  for (const [key, value] of Object.entries(def)) {
    if (!Array.isArray(value) || value.length === 0 || FLOW_SETTINGS_KEYS.has(key)) continue;
    // Element arrays hold named objects; settings arrays (strings etc.) are not elements.
    const elements = (value as unknown[]).filter(
      (el): el is NamedElement => typeof el === "object" && el !== null && "name" in el,
    );
    if (elements.length === 0) continue;
    const capability = elementCapability(key);
    if (capability.level === "degrade") {
      for (const el of elements) {
        blockers.push({
          name: el.name ?? key,
          location: key,
          reason: capability.note ?? "Unsupported element type.",
        });
      }
    }
  }

  for (const screen of def.screens ?? []) {
    screenFieldBlockers(screen.name, screen.fields as NamedElement[] | undefined, blockers);
  }

  for (const formula of def.formulas ?? []) {
    if (formula.expression == null) continue;
    const result = evaluateFormula(formula.expression, () => null);
    if (!result.ok && HARD_FORMULA_FAILURES.some((p) => p.test(result.reason))) {
      blockers.push({
        name: formula.name,
        location: "formulas",
        reason: `Formula not evaluable in chat (${result.reason}).`,
      });
    }
  }

  const screenCount = def.screens?.length ?? 0;
  const level: FlowSupportReport["level"] =
    screenCount === 0 ? "handoff" : blockers.length === 0 ? "full" : "partial";
  return { level, screenCount, blockers };
}
