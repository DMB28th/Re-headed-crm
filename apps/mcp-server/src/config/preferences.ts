/**
 * Remembered choices — when an ambiguous ask is resolved via the view picker,
 * the pick sticks for that phrasing (design 5b: "choice is remembered").
 * In-memory for M2.5; keyed (tenant, normalized query) so it survives across
 * stateless requests via the shared instance in main.ts.
 */
export interface PreferenceStore {
  rememberViewChoice(
    tenantId: string,
    query: string,
    viewId: string,
    userId?: string,
  ): Promise<void>;
  recallViewChoice(
    tenantId: string,
    query: string,
    userId?: string,
  ): Promise<string | undefined>;
}

export function normalizeAsk(query: string): string {
  return query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export class InMemoryPreferenceStore implements PreferenceStore {
  private choices = new Map<string, string>();

  async rememberViewChoice(
    tenantId: string,
    query: string,
    viewId: string,
    userId = "workspace",
  ): Promise<void> {
    this.choices.set(`${tenantId}::${userId}::${normalizeAsk(query)}`, viewId);
  }

  async recallViewChoice(
    tenantId: string,
    query: string,
    userId = "workspace",
  ): Promise<string | undefined> {
    return this.choices.get(`${tenantId}::${userId}::${normalizeAsk(query)}`);
  }
}
