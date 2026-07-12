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
export function inputDisplayValue(value: CrmFieldValue | undefined, control?: string): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // datetime-local inputs reject full ISO-Z strings and would render EMPTY.
  if (control === "datetime") return isoToDatetimeLocal(str);
  // date inputs tolerate ISO datetimes by slicing to the date part.
  if (control === "date" && str.includes("T")) return str.slice(0, 10);
  return str;
}

/** ISO datetime → the local "YYYY-MM-DDTHH:mm" a datetime-local input requires. */
export function isoToDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** datetime-local string (local time) → full ISO with timezone — CRMs reject timezone-less writes. */
export function datetimeLocalToIso(raw: string): CrmFieldValue {
  if (raw === "") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

export function draftEntries(draft: Draft): [string, CrmFieldValue][] {
  return Object.entries(draft);
}

export function dirtyCount(draft: Draft): number {
  return Object.keys(draft).length;
}
