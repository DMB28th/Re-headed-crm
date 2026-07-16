import type {
  CustomList,
  HomeCardConfig,
  LayoutConfig,
  ViewExposure,
  ViewExposuresConfig,
} from "@cardstack/core";

/**
 * Whether a CRM is wired up for the tenant. Disconnected = empty canvas:
 * Studio shows empty states and every MCP tool refuses with a "connect one in
 * Studio" message. Stores without a stored state default to CONNECTED (mock)
 * so pre-existing config files/databases keep working.
 *
 * Migration note (2026-07-11): added optional `credentials` — live-CRM
 * secrets (HubSpot private-app token / Salesforce client credentials).
 * Additive; absent = the mock portal. SERVER-SIDE ONLY: Studio's API redacts
 * it and nothing ever reaches a widget payload (hard rule 3). At-rest
 * encryption (KMS) is the M7 hardening item.
 */
export interface ConnectionState {
  tenantId: string;
  status: "connected" | "disconnected";
  crm: "hubspot" | "salesforce";
  /** Human label for the portal: "mock portal" | "private app" | "client credentials". */
  label: string;
  changedAt: string;
  credentials?: Record<string, string>;
}

/**
 * Read side — what the MCP server needs at render time. Reps only ever see
 * published configs; drafts are Studio-side until published.
 */
export interface ConfigStore {
  getLayout(
    tenantId: string,
    object: string,
    audience?: string,
  ): Promise<LayoutConfig | undefined>;
  listConfiguredObjects(tenantId: string): Promise<string[]>;
  /** Exposed saved-view config only (unexposed views stay invisible to chat). */
  getViewExposures(tenantId: string, object: string): Promise<ViewExposure[]>;
  /** Admin-defined custom lists (filters live in Cardstack, not the CRM). */
  getCustomLists(tenantId: string, object: string): Promise<CustomList[]>;
  /** Published home-card config for "open my CRM" (design 7a). */
  getHomeCard(tenantId: string, audience?: string): Promise<HomeCardConfig | undefined>;
  getConnection(tenantId: string): Promise<ConnectionState>;
}

/** One (tenant, object, audience) slot: draft vs published + rollback history. */
export interface LayoutRecord {
  draft: LayoutConfig | null;
  published: LayoutConfig | null;
  /** Previous published revisions, oldest first — "previous versions are kept". */
  history: LayoutConfig[];
}

export interface PublishEvent {
  tenantId: string;
  object: string;
  audience: string;
  revision: number;
  kind: "publish" | "rollback";
  timestamp: string;
}

/** Write side — what Studio needs on top of the read side. */
export interface AdminConfigStore extends ConfigStore {
  getLayoutRecord(tenantId: string, object: string, audience?: string): Promise<LayoutRecord>;
  saveDraft(config: LayoutConfig): Promise<void>;
  discardDraft(tenantId: string, object: string, audience?: string): Promise<void>;
  /** Draft → published; revision bumps from the published one; history keeps the old. */
  publish(tenantId: string, object: string, audience?: string): Promise<LayoutConfig>;
  rollback(
    tenantId: string,
    object: string,
    toRevision: number,
    audience?: string,
  ): Promise<LayoutConfig>;
  /** Full exposure config including unexposed views (Studio's 5a table). */
  getViewExposuresConfig(
    tenantId: string,
    object: string,
  ): Promise<ViewExposuresConfig | undefined>;
  setViewExposures(config: ViewExposuresConfig): Promise<void>;
  setHomeCard(config: HomeCardConfig): Promise<void>;
  publishHomeCard(config: HomeCardConfig): Promise<HomeCardConfig>;
  listPublishes(tenantId: string): Promise<PublishEvent[]>;
  setConnection(state: ConnectionState): Promise<void>;
  /**
   * Remove an object's Cardstack config entirely — every audience's layout
   * (draft + published + history), its view exposures / custom lists, and its
   * publish events. The object and its records in the CRM are NOT touched; it
   * simply returns to "available to add". Idempotent.
   */
  removeObject(tenantId: string, object: string): Promise<void>;
}

export const layoutKey = (tenantId: string, object: string, audience = "default"): string =>
  `${tenantId}::${object}::${audience}`;

export const exposureKey = (tenantId: string, object: string): string =>
  `${tenantId}::${object}`;
