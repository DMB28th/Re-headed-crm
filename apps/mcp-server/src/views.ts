/**
 * Saved-view ask resolution ("show me my deals" → the user's exposed views
 * first; free-form filters stay with crm_search). Pure logic, unit-testable.
 */
import type { SavedView, ViewExposure } from "@cardstack/core";
import { normalizeAsk } from "./config/preferences.js";

export interface ExposedView {
  exposure: ViewExposure;
  view: SavedView;
}

export type ViewResolution =
  | { kind: "hit"; match: ExposedView }
  | { kind: "ambiguous"; candidates: ExposedView[] }
  | { kind: "none" };

/** All names an exposed view answers to: its CRM name + admin aliases. */
export function askNames(entry: ExposedView): string[] {
  return [entry.view.name, ...entry.exposure.aliases].map(normalizeAsk);
}

export function resolveViewAsk(query: string, views: ExposedView[]): ViewResolution {
  const ask = normalizeAsk(query);
  if (!ask) return { kind: "none" };

  const scored = views
    .map((entry) => {
      let score = 0;
      for (const name of askNames(entry)) {
        if (name === ask) score = Math.max(score, 3);
        else if (name.includes(ask) || ask.includes(name)) score = Math.max(score, 2);
      }
      return { entry, score };
    })
    .filter((s) => s.score > 0);

  if (scored.length === 0) return { kind: "none" };
  const top = Math.max(...scored.map((s) => s.score));
  const best = scored.filter((s) => s.score === top).map((s) => s.entry);
  return best.length === 1
    ? { kind: "hit", match: best[0]! }
    : { kind: "ambiguous", candidates: best };
}

/**
 * The aliases must reach the model for routing to work (PLAN.md): this string
 * is appended to crm_list_view's tool description per tenant.
 */
export function describeExposedViews(views: ExposedView[]): string {
  if (views.length === 0) return "No saved views are exposed for this workspace.";
  return views
    .map((entry) => {
      const aliases = entry.exposure.aliases.length
        ? ` (ask with: ${entry.exposure.aliases.join(", ")})`
        : "";
      return `"${entry.view.name}"${aliases}${entry.exposure.isDefault ? " [default]" : ""}`;
    })
    .join(" · ");
}
