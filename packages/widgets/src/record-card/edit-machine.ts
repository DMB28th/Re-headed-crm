/**
 * The record-card state machine (design README "State Management"):
 *   loading → ready ↔ editing(dirty) → confirming(diff) → writing → receipt | partial-failure
 * Modeled explicitly — not ad-hoc booleans — per the design handoff decision.
 */
import type { CrmFieldValue, FieldDescribe, WriteReceiptPayload } from "@cardstack/core";

/** Changed fields only: api → attempted new value. */
export type Draft = Record<string, CrmFieldValue>;

export type CardMode =
  | { kind: "ready" }
  | { kind: "editing"; draft: Draft }
  | { kind: "confirming"; draft: Draft; writeError?: string }
  | { kind: "writing"; draft: Draft }
  | { kind: "receipt"; receipt: WriteReceiptPayload; opening?: boolean }
  | { kind: "partial"; receipt: WriteReceiptPayload };

/** Coerce an <input> string back to the CRM value type for the field. */
export function coerceInputValue(raw: string, meta: FieldDescribe | undefined): CrmFieldValue {
  if (raw === "") return null;
  switch (meta?.type) {
    case "currency":
    case "number":
    case "percent": {
      const num = Number(raw);
      return Number.isNaN(num) ? raw : num;
    }
    case "boolean":
      return raw === "true";
    default:
      return raw;
  }
}

/** Raw value → what the input element should display. */
export function inputDisplayValue(value: CrmFieldValue | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function draftEntries(draft: Draft): [string, CrmFieldValue][] {
  return Object.entries(draft);
}

export function dirtyCount(draft: Draft): number {
  return Object.keys(draft).length;
}
