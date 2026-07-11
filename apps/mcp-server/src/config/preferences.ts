/**
 * Remembered choices — when an ambiguous ask is resolved via the view picker,
 * the pick sticks for that phrasing (design 5b: "choice is remembered").
 * In-memory for M2.5; keyed (tenant, normalized query) so it survives across
 * stateless requests via the shared instance in main.ts.
 */
export interface PreferenceStore {
  rememberViewChoice(tenantId: string, query: string, viewId: string): Promise<void>;
  recallViewChoice(tenantId: string, query: string): Promise<string | undefined>;
}

export function normalizeAsk(query: string): string {
  return query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export class InMemoryPreferenceStore implements PreferenceStore {
  private choices = new Map<string, string>();

  async rememberViewChoice(tenantId: string, query: string, viewId: string): Promise<void> {
    this.choices.set(`${tenantId}::${normalizeAsk(query)}`, viewId);
  }

  async recallViewChoice(tenantId: string, query: string): Promise<string | undefined> {
    return this.choices.get(`${tenantId}::${normalizeAsk(query)}`);
  }
}
