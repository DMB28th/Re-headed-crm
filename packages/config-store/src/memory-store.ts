import {
  CustomScreenConfig as CustomScreenSchema,
  FlowRenderModeConfig as FlowRenderModeSchema,
  ViewExposuresConfig as ViewExposuresSchema,
  type CrmKind,
  type CustomScreenConfig,
  type CustomScreenRecord,
  type CustomList,
  type FlowRenderModeConfig,
  type HomeCardConfig,
  type LayoutConfig,
  type ViewExposure,
  type ViewExposuresConfig,
} from "@cardstack/core";
import {
  customScreenKey,
  exposureKey,
  flowKey,
  layoutKey,
  userConnectionKey,
  type AdminConfigStore,
  type ConnectionState,
  type LayoutRecord,
  type PublishEvent,
  type UserConnectionState,
} from "./types.js";
import { defaultConnection, demoDealsLayout, demoHomeCard, demoViewExposures } from "./seed.js";

interface StoreState {
  layouts: Record<string, LayoutRecord>;
  viewExposures: Record<string, ViewExposuresConfig>;
  /** Keyed tenant::audience. Published-only in M4 core; drafts come with the 8a builder. */
  homeCards?: Record<string, HomeCardConfig>;
  /** Keyed tenant::flowApiName. */
  flowRenderModes?: Record<string, FlowRenderModeConfig>;
  /** Keyed tenant::customScreenId. */
  customScreens?: Record<string, CustomScreenRecord>;
  /** Keyed by tenant. Absent (pre-connections config files) = connected mock. */
  connections?: Record<string, ConnectionState>;
  /** Keyed tenant::userId::crm. Absent = user has not authorized that CRM. */
  userConnections?: Record<string, UserConnectionState>;
  /** Namespaced KV (MCP OAuth clients/codes/tokens). Keyed namespace::key. */
  kv?: Record<string, { value: Record<string, unknown>; expiresAt?: string }>;
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
    homeCards: {
      [`${demoHomeCard.tenantId}::${demoHomeCard.audience}`]: demoHomeCard,
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

  async getCustomLists(tenantId: string, object: string): Promise<CustomList[]> {
    const state = await this.load();
    // ?? handles config files written before customLists existed (v2 note).
    return state.viewExposures[exposureKey(tenantId, object)]?.customLists ?? [];
  }

  async getConnection(tenantId: string): Promise<ConnectionState> {
    const state = await this.load();
    return state.connections?.[tenantId] ?? defaultConnection(tenantId);
  }

  async setConnection(connection: ConnectionState): Promise<void> {
    const state = await this.load();
    state.connections = { ...(state.connections ?? {}), [connection.tenantId]: connection };
    await this.save(state);
  }

  async getUserConnection(
    tenantId: string,
    userId: string,
    crm: UserConnectionState["crm"],
  ): Promise<UserConnectionState | undefined> {
    const state = await this.load();
    return state.userConnections?.[userConnectionKey(tenantId, userId, crm)];
  }

  async setUserConnection(connection: UserConnectionState): Promise<void> {
    const state = await this.load();
    state.userConnections = {
      ...(state.userConnections ?? {}),
      [userConnectionKey(connection.tenantId, connection.userId, connection.crm)]: connection,
    };
    await this.save(state);
  }

  async deleteUserConnection(
    tenantId: string,
    userId: string,
    crm: UserConnectionState["crm"],
  ): Promise<void> {
    const state = await this.load();
    if (!state.userConnections) return;
    delete state.userConnections[userConnectionKey(tenantId, userId, crm)];
    await this.save(state);
  }

  async listUserConnections(tenantId: string): Promise<UserConnectionState[]> {
    const state = await this.load();
    return Object.values(state.userConnections ?? {})
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  }

  async kvGet(namespace: string, key: string): Promise<Record<string, unknown> | undefined> {
    const state = await this.load();
    const entry = state.kv?.[`${namespace}::${key}`];
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= new Date().toISOString()) {
      delete state.kv![`${namespace}::${key}`];
      await this.save(state);
      return undefined;
    }
    return entry.value;
  }

  async kvSet(
    namespace: string,
    key: string,
    value: Record<string, unknown>,
    expiresAt?: string,
  ): Promise<void> {
    const state = await this.load();
    state.kv = {
      ...(state.kv ?? {}),
      [`${namespace}::${key}`]: { value, ...(expiresAt ? { expiresAt } : {}) },
    };
    await this.save(state);
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    const state = await this.load();
    if (!state.kv) return;
    delete state.kv[`${namespace}::${key}`];
    await this.save(state);
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

  async removeObject(tenantId: string, object: string): Promise<void> {
    const state = await this.load();
    // Layouts are keyed `${tenant}::${object}::${audience}` — drop every audience.
    const layoutPrefix = `${tenantId}::${object}::`;
    for (const key of Object.keys(state.layouts)) {
      if (key.startsWith(layoutPrefix)) delete state.layouts[key];
    }
    delete state.viewExposures[exposureKey(tenantId, object)];
    // Publish history for this object no longer has a card to point at.
    state.publishes = state.publishes.filter(
      (p) => !(p.tenantId === tenantId && p.object === object),
    );
    await this.save(state);
  }

  async tenantConfigCrm(tenantId: string): Promise<CrmKind | undefined> {
    const state = await this.load();
    for (const [key, record] of Object.entries(state.layouts)) {
      if (key.split("::")[0] !== tenantId) continue;
      const cfg = record.published ?? record.draft;
      if (cfg?.crm) return cfg.crm;
    }
    return undefined;
  }

  async clearTenantConfig(tenantId: string): Promise<void> {
    const state = await this.load();
    const prefix = `${tenantId}::`;
    const purge = (map: Record<string, unknown> | undefined): void => {
      if (!map) return;
      for (const key of Object.keys(map)) {
        if (key.startsWith(prefix)) delete map[key];
      }
    };
    purge(state.layouts);
    purge(state.viewExposures);
    purge(state.homeCards);
    purge(state.flowRenderModes);
    purge(state.customScreens);
    state.publishes = state.publishes.filter((p) => p.tenantId !== tenantId);
    await this.save(state);
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
    const raw = state.viewExposures[exposureKey(tenantId, object)];
    // Normalize through the schema: rows written before customLists existed
    // (v2 note) otherwise reach clients without the field and crash them.
    return raw ? ViewExposuresSchema.parse(raw) : undefined;
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

  async getHomeCard(tenantId: string, audience = "default"): Promise<HomeCardConfig | undefined> {
    const state = await this.load();
    // ?? handles config files written before homeCards existed.
    return (state.homeCards ?? {})[`${tenantId}::${audience}`];
  }

  async getFlowRenderModes(tenantId: string): Promise<FlowRenderModeConfig[]> {
    const state = await this.load();
    return Object.values(state.flowRenderModes ?? {})
      .filter((config) => config.tenantId === tenantId)
      .map((config) => FlowRenderModeSchema.parse(config));
  }

  async setFlowRenderMode(config: FlowRenderModeConfig): Promise<void> {
    const state = await this.load();
    const parsed = FlowRenderModeSchema.parse(config);
    state.flowRenderModes = {
      ...(state.flowRenderModes ?? {}),
      [flowKey(parsed.tenantId, parsed.flowApiName)]: parsed,
    };
    await this.save(state);
  }

  async getCustomScreens(tenantId: string): Promise<CustomScreenConfig[]> {
    const records = await this.listCustomScreenRecords(tenantId);
    return records.flatMap((record) => (record.published ? [record.published] : []));
  }

  async listCustomScreenRecords(
    tenantId: string,
  ): Promise<(CustomScreenRecord & { id: string })[]> {
    const state = await this.load();
    const prefix = `${tenantId}::`;
    return Object.entries(state.customScreens ?? {})
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, record]) => ({
        id: key.slice(prefix.length),
        draft: record.draft ? CustomScreenSchema.parse(record.draft) : null,
        published: record.published ? CustomScreenSchema.parse(record.published) : null,
        history: record.history.map((screen) => CustomScreenSchema.parse(screen)),
      }))
      .sort((a, b) => {
        const aLabel = a.draft?.label ?? a.published?.label ?? a.id;
        const bLabel = b.draft?.label ?? b.published?.label ?? b.id;
        return aLabel.localeCompare(bLabel);
      });
  }

  async getCustomScreenRecord(tenantId: string, id: string): Promise<CustomScreenRecord> {
    const state = await this.load();
    return (
      state.customScreens?.[customScreenKey(tenantId, id)] ?? {
        draft: null,
        published: null,
        history: [],
      }
    );
  }

  async saveCustomScreenDraft(config: CustomScreenConfig): Promise<void> {
    const state = await this.load();
    const parsed = CustomScreenSchema.parse({
      ...config,
      status: "draft",
      updatedAt: config.updatedAt ?? new Date().toISOString(),
    });
    const key = customScreenKey(parsed.tenantId, parsed.id);
    const record = state.customScreens?.[key] ?? { draft: null, published: null, history: [] };
    state.customScreens = {
      ...(state.customScreens ?? {}),
      [key]: { ...record, draft: parsed },
    };
    await this.save(state);
  }

  async publishCustomScreen(tenantId: string, id: string): Promise<CustomScreenConfig> {
    const state = await this.load();
    const key = customScreenKey(tenantId, id);
    const record = state.customScreens?.[key];
    if (!record?.draft) throw new Error(`No draft to publish for custom screen ${id}.`);
    const published = CustomScreenSchema.parse({
      ...record.draft,
      status: "published",
      revision: (record.published?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
    state.customScreens = {
      ...(state.customScreens ?? {}),
      [key]: {
        draft: null,
        published,
        history: record.published ? [...record.history, record.published] : record.history,
      },
    };
    await this.save(state);
    return published;
  }

  async setHomeCard(config: HomeCardConfig): Promise<void> {
    const state = await this.load();
    state.homeCards = {
      ...(state.homeCards ?? {}),
      [`${config.tenantId}::${config.audience}`]: config,
    };
    await this.save(state);
  }

  /** Publish ceremony for home cards: revision bumps from current, event logged. */
  async publishHomeCard(config: HomeCardConfig): Promise<HomeCardConfig> {
    const current = await this.getHomeCard(config.tenantId, config.audience);
    const published: HomeCardConfig = {
      ...config,
      revision: (current?.revision ?? 0) + 1,
    };
    await this.setHomeCard(published);
    const state = await this.load();
    state.publishes.push({
      tenantId: config.tenantId,
      object: "home card",
      audience: config.audience,
      revision: published.revision,
      kind: "publish",
      timestamp: new Date().toISOString(),
    });
    await this.save(state);
    return published;
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
