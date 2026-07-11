import type {
  HomeCardConfig,
  LayoutConfig,
  ViewExposure,
  ViewExposuresConfig,
} from "@cardstack/core";

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
  /** Published home-card config for "open my CRM" (design 7a). */
  getHomeCard(tenantId: string, audience?: string): Promise<HomeCardConfig | undefined>;
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
}

export const layoutKey = (tenantId: string, object: string, audience = "default"): string =>
  `${tenantId}::${object}::${audience}`;

export const exposureKey = (tenantId: string, object: string): string =>
  `${tenantId}::${object}`;
