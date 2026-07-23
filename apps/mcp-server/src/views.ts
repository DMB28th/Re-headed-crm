/**
 * Saved-view ask resolution ("show me my deals" → the user's exposed views
 * first; free-form filters stay with crm_search). Pure logic, unit-testable.
 */
import type { CustomList, SavedView, ViewExposure } from "@cardstack/core";
import { normalizeAsk } from "./config/preferences.js";

export interface ExposedView {
  exposure: ViewExposure;
  view: SavedView;
  /** Set when the view is a Cardstack custom list (filters run via search). */
  custom?: CustomList;
}

export type ViewResolution =
  | { kind: "hit"; match: ExposedView }
  | { kind: "ambiguous"; candidates: ExposedView[] }
  | { kind: "none" };

/** Chat-language synonym groups shared by object + view resolution: "my deals"
 *  should find "All Opportunities" in a Salesforce workspace and vice versa. */
export const OBJECT_SYNONYMS: string[][] = [
  ["deal", "deals", "opportunity", "opportunities"],
  ["company", "companies", "account", "accounts"],
  ["contact", "contacts", "person", "people"],
  ["lead", "leads"],
  ["case", "cases", "ticket", "tickets"],
];

// Words that carry no routing signal in a broad ask ("show me my open deals").
const FILLER_WORDS = new Set([
  "my", "our", "your", "the", "a", "an", "all", "show", "me", "list",
  "lists", "of", "open", "current", "view", "please",
]);

const synonymVariants = (word: string): string[] =>
  OBJECT_SYNONYMS.find((g) => g.includes(word)) ?? [word];

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

  if (scored.length === 0) return broadAskFallback(ask, views);
  const top = Math.max(...scored.map((s) => s.score));
  const best = scored.filter((s) => s.score === top).map((s) => s.entry);
  return best.length === 1
    ? { kind: "hit", match: best[0]! }
    : { kind: "ambiguous", candidates: best };
}

/**
 * Broad-ask fallback ("my opportunities", "show me all deals"): strip filler,
 * expand what's left through chat synonyms, and match views whose name/alias
 * contains a variant of every remaining word. Ties prefer the default
 * exposure — "my opportunities" should open All Opportunities, not a picker
 * over every opportunity view.
 */
function broadAskFallback(ask: string, views: ExposedView[]): ViewResolution {
  const words = ask.split(/\s+/).filter((w) => w && !FILLER_WORDS.has(w));
  const pickPreferringDefault = (candidates: ExposedView[]): ViewResolution => {
    if (candidates.length === 0) return { kind: "none" };
    if (candidates.length === 1) return { kind: "hit", match: candidates[0]! };
    const def = candidates.filter((c) => c.exposure.isDefault);
    return def.length === 1
      ? { kind: "hit", match: def[0]! }
      : { kind: "ambiguous", candidates };
  };
  // All filler ("my list") → the default view if one is marked, else a picker.
  if (words.length === 0) return pickPreferringDefault(views);
  const matches = views.filter((entry) =>
    words.every((w) =>
      askNames(entry).some((name) => synonymVariants(w).some((v) => name.includes(v))),
    ),
  );
  return pickPreferringDefault(matches);
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
