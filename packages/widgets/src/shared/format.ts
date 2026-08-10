import type { CrmFieldValue, FieldDescribe } from "@cardstack/core";

/** Formatted display value, or null when the raw value is null/empty (render "—"). */
export function formatValue(
  value: CrmFieldValue | undefined,
  meta: FieldDescribe | undefined,
  locale: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  // Internal id → human label (pipeline stages, owners) before any formatting.
  const label = meta?.valueLabels?.[String(value)];
  if (label) return label;
  switch (meta?.type) {
    case "currency": {
      const num = Number(value);
      if (Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: meta.currencyCode ?? "USD",
        maximumFractionDigits: Number.isInteger(num) ? 0 : 2,
      }).format(num);
    }
    case "number": {
      const num = Number(value);
      return Number.isNaN(num) ? String(value) : new Intl.NumberFormat(locale).format(num);
    }
    case "percent":
      return `${value}%`;
    case "date":
      return formatDate(String(value), locale);
    case "datetime":
      return formatDate(String(value), locale, true);
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

/** Locale date ("Jul 15, 2026") from an ISO date/datetime string. */
export function formatDate(raw: string, locale: string, withTime = false): string {
  const date = new Date(withTime || raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

/** "as of 2:32 PM" (same-day) / "as of Jul 15, 2:32 PM" — the staleness line. */
export function formatAsOf(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "2d ago" style timestamps for the activity timeline. */
export function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const deltaSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" });
  const abs = Math.abs(deltaSec);
  if (abs < 3600) return rtf.format(Math.trunc(deltaSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.trunc(deltaSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.trunc(deltaSec / 86400), "day");
  return formatDate(iso, locale);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Stage → status tint. Color never carries meaning alone (label is always shown). */
export function stageTone(stage: string): "ok" | "warn" | "danger" | "neutral" {
  const lower = stage.toLowerCase();
  if (lower.includes("closed lost")) return "danger";
  if (lower.includes("closed won") || lower.includes("contract")) return "ok";
  if (lower.includes("negotiation") || lower.includes("proposal")) return "warn";
  return "neutral";
}
