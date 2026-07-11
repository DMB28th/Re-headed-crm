import type { LayoutConfig, ViewExposure, ViewExposuresConfig } from "@cardstack/core";
import {
  exposureKey,
  layoutKey,
  type AdminConfigStore,
  type LayoutRecord,
  type PublishEvent,
} from "./types.js";
import { demoDealsLayout, demoViewExposures } from "./seed.js";

interface StoreState {
  layouts: Record<string, LayoutRecord>;
  viewExposures: Record<string, ViewExposuresConfig>;
  publishes: PublishEvent[];
}

export function seededState(): StoreState {
  return {
    layouts: {
      [layoutKey(demoDealsLayout.tenantId, demoDealsLayout.object)]: {
        draft: null,
        published: demoDealsLayout,
        history: [],
      },
    },
    viewExposures: {
      [exposureKey(demoViewExposures.tenantId, demoViewExposures.object)]: demoViewExposures,
    },
    publishes: [],
  };
}

/**
 * Base implementation over a load/save state pair. InMemory keeps state in the
 * instance; FileConfigStore loads/saves a JSON file on every call so the MCP
 * server sees Studio publishes at render time with no restart (GP3).
 */
export abstract class BaseConfigStore implements AdminConfigStore {
  protected abstract load(): Promise<StoreState>;
  protected abstract save(state: StoreState): Promise<void>;

  async getLayout(
    tenantId: string,
    object: string,
    audience = "default",
  ): Promise<LayoutConfig | undefined> {
    const state = await this.load();
    return (
      state.layouts[layoutKey(tenantId, object, audience)]?.published ??
      state.layouts[layoutKey(tenantId, object, "default")]?.published ??
      undefined
    );
  }

  async listConfiguredObjects(tenantId: string): Promise<string[]> {
    const state = await this.load();
    const objects = new Set<string>();
    for (const [key, record] of Object.entries(state.layouts)) {
      const [tenant, object] = key.split("::");
      if (tenant === tenantId && record.published && object) objects.add(object);
    }
    return [...objects];
  }

  async getViewExposures(tenantId: string, object: string): Promise<ViewExposure[]> {
    const state = await this.load();
    const config = state.viewExposures[exposureKey(tenantId, object)];
    return (config?.views ?? []).filter((v) => v.exposed);
  }

  async getLayoutRecord(
    tenantId: string,
    object: string,
    audience = "default",
  ): Promise<LayoutRecord> {
    const state = await this.load();
    return (
      state.layouts[layoutKey(tenantId, object, audience)] ?? {
        draft: null,
        published: null,
        history: [],
      }
    );
  }

  async saveDraft(config: LayoutConfig): Promise<void> {
    const state = await this.load();
    const key = layoutKey(config.tenantId, config.object, config.audience);
    const record = state.layouts[key] ?? { draft: null, published: null, history: [] };
    state.layouts[key] = { ...record, draft: config };
    await this.save(state);
  }

  async discardDraft(tenantId: string, object: string, audience = "default"): Promise<void> {
    const state = await this.load();
    const key = layoutKey(tenantId, object, audience);
    const record = state.layouts[key];
    if (record) {
      state.layouts[key] = { ...record, draft: null };
      await this.save(state);
    }
  }

  async publish(tenantId: string, object: string, audience = "default"): Promise<LayoutConfig> {
    const state = await this.load();
    const key = layoutKey(tenantId, object, audience);
    const record = state.layouts[key];
    if (!record?.draft) throw new Error(`No draft to publish for ${object}.`);
    const published: LayoutConfig = {
      ...record.draft,
      revision: (record.published?.revision ?? 0) + 1,
    };
    state.layouts[key] = {
      draft: null,
      published,
      history: record.published ? [...record.history, record.published] : record.history,
    };
    state.publishes.push({
      tenantId,
      object,
      audience,
      revision: published.revision,
      kind: "publish",
      timestamp: new Date().toISOString(),
    });
    await this.save(state);
    return published;
  }

  async rollback(
    tenantId: string,
    object: string,
    toRevision: number,
    audience = "default",
  ): Promise<LayoutConfig> {
    const state = await this.load();
    const key = layoutKey(tenantId, object, audience);
    const record = state.layouts[key];
    const target = record?.history.find((c) => c.revision === toRevision);
    if (!record || !target) throw new Error(`No revision v${toRevision} in history for ${object}.`);
    // Rolling back is itself a publish: the restored layout gets a NEW revision
    // so the version chain stays linear ("previous versions are kept").
    const published: LayoutConfig = { ...target, revision: (record.published?.revision ?? 0) + 1 };
    state.layouts[key] = {
      draft: record.draft,
      published,
      history: record.published ? [...record.history, record.published] : record.history,
    };
    state.publishes.push({
      tenantId,
      object,
      audience,
      revision: published.revision,
      kind: "rollback",
      timestamp: new Date().toISOString(),
    });
    await this.save(state);
    return published;
  }

  async getViewExposuresConfig(
    tenantId: string,
    object: string,
  ): Promise<ViewExposuresConfig | undefined> {
    const state = await this.load();
    return state.viewExposures[exposureKey(tenantId, object)];
  }

  async setViewExposures(config: ViewExposuresConfig): Promise<void> {
    const state = await this.load();
    state.viewExposures[exposureKey(config.tenantId, config.object)] = config;
    await this.save(state);
  }

  async listPublishes(tenantId: string): Promise<PublishEvent[]> {
    const state = await this.load();
    return state.publishes.filter((p) => p.tenantId === tenantId).reverse();
  }
}

export class InMemoryConfigStore extends BaseConfigStore {
  private state: StoreState;

  constructor(state: StoreState = seededState()) {
    super();
    this.state = state;
  }

  protected async load(): Promise<StoreState> {
    return this.state;
  }

  protected async save(state: StoreState): Promise<void> {
    this.state = state;
  }
}

export type { StoreState };
