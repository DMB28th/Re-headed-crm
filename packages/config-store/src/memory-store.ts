import {
  CustomScreenConfig as CustomScreenSchema,
  FlowRenderModeConfig as FlowRenderModeSchema,
  ViewExposuresConfig as ViewExposuresSchema,
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
  type FlowRenderModeRecord,
  type HomeCardRecord,
  type LayoutRecord,
  type PublishEvent,
  type PublishResult,
  type PublishSurface,
  type StagedChange,
  type StagedKey,
  type StagedRecord,
  type SurfaceHistory,
  type UserConnectionState,
  type ViewExposuresRecord,
} from "./types.js";
import type { DiffLabels } from "./diff.js";
import {
  collectStagedChanges,
  collectSurfaceHistory,
  runStagedPublish,
  runStagedRollback,
} from "./staging.js";
import { defaultConnection, demoDealsLayout, demoHomeCard, demoViewExposures } from "./seed.js";

/**
 * Lazy storage migration (docs/studio-staging-model.md): view exposures, home
 * cards and flow render modes used to be stored as BARE configs. Anything in
 * that old shape reads back as PUBLISHED with no draft — the safe direction,
 * since nothing a rep can see today disappears. Writes always use the envelope.
 */
function asStaged<T>(stored: T | StagedRecord<T> | undefined): StagedRecord<T> {
  if (!stored) return { draft: null, published: null, history: [] };
  if (typeof stored === "object" && "published" in stored && "history" in stored) {
    return stored as StagedRecord<T>;
  }
  return { draft: null, published: stored as T, history: [] };
}

/** Draft → published: revision bumps from the published one, history keeps the old. */
function promote<T extends { revision: number }>(
  record: StagedRecord<T>,
  what: string,
): { published: T; next: StagedRecord<T> } {
  if (!record.draft) throw new Error(`No draft to publish for ${what}.`);
  const published = { ...record.draft, revision: (record.published?.revision ?? 0) + 1 };
  return {
    published,
    next: {
      draft: null,
      published,
      history: record.published ? [...record.history, record.published] : record.history,
    },
  };
}

/**
 * Rolling back is itself a publish: the restored config gets a NEW revision so
 * the version chain stays linear. Any in-flight draft is preserved.
 */
function restore<T extends { revision: number }>(
  record: StagedRecord<T>,
  toRevision: number,
  what: string,
): { published: T; next: StagedRecord<T> } {
  const target = record.history.find((c) => c.revision === toRevision);
  if (!target) throw new Error(`No revision v${toRevision} in history for ${what}.`);
  const published = { ...target, revision: (record.published?.revision ?? 0) + 1 };
  return {
    published,
    next: {
      draft: record.draft,
      published,
      history: record.published ? [...record.history, record.published] : record.history,
    },
  };
}

function publishEvent(
  tenantId: string,
  object: string,
  audience: string,
  revision: number,
  kind: PublishEvent["kind"],
  surface: PublishSurface,
  batchId?: string,
): PublishEvent {
  return {
    tenantId,
    object,
    audience,
    revision,
    kind,
    surface,
    timestamp: new Date().toISOString(),
    ...(batchId ? { batchId } : {}),
  };
}

interface StoreState {
  layouts: Record<string, LayoutRecord>;
  /** Keyed tenant::object. Bare configs from before the staging model still parse. */
  viewExposures: Record<string, ViewExposuresRecord | ViewExposuresConfig>;
  /** Keyed tenant::audience. Bare configs from before the staging model still parse. */
  homeCards?: Record<string, HomeCardRecord | HomeCardConfig>;
  /** Keyed tenant::flowApiName. Bare configs from before the staging model still parse. */
  flowRenderModes?: Record<string, FlowRenderModeRecord | FlowRenderModeConfig>;
  /** Keyed tenant::customScreenId. */
  customScreens?: Record<string, CustomScreenRecord>;
  /** Keyed by tenant. Absent (pre-connections config files) = connected mock. */
  connections?: Record<string, ConnectionState>;
  /** Keyed tenant::userId::crm. Absent = user has not authorized that CRM. */
  userConnections?: Record<string, UserConnectionState>;
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
      [exposureKey(demoViewExposures.tenantId, demoViewExposures.object)]: {
        draft: null,
        published: demoViewExposures,
        history: [],
      },
    },
    homeCards: {
      [`${demoHomeCard.tenantId}::${demoHomeCard.audience}`]: {
        draft: null,
        published: demoHomeCard,
        history: [],
      },
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
    // PUBLISHED only — a staged exposure is invisible to chat until published.
    const config = await this.getViewExposuresConfig(tenantId, object);
    return (config?.views ?? []).filter((v) => v.exposed);
  }

  async getCustomLists(tenantId: string, object: string): Promise<CustomList[]> {
    // ?? handles config files written before customLists existed (v2 note).
    return (await this.getViewExposuresConfig(tenantId, object))?.customLists ?? [];
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

  async publish(tenantId: string, object: string, audience = "default"): Promise<LayoutConfig> {
    return this.publishOne(tenantId, { surface: "layout", object, audience });
  }

  /**
   * The one place a draft becomes what reps see, for every governed surface.
   * Every publish verb routes through here so the revision bump, the history
   * append and the PublishEvent can't drift apart per surface.
   */
  async rollback(
    tenantId: string,
    object: string,
    toRevision: number,
    audience = "default",
  ): Promise<LayoutConfig> {
    const state = await this.load();
    const key = layoutKey(tenantId, object, audience);
    const record = state.layouts[key] ?? { draft: null, published: null, history: [] };
    const { published, next } = restore(record, toRevision, object);
    state.layouts[key] = next;
    state.publishes.push(
      publishEvent(tenantId, object, audience, published.revision, "rollback", "layout"),
    );
    await this.save(state);
    return published;
  }

  protected async publishOne<T>(
    tenantId: string,
    key: StagedKey,
    batchId?: string,
  ): Promise<T> {
    const state = await this.load();
    const audience = key.audience ?? "default";
    const event = (object: string, revision: number) =>
      state.publishes.push(
        publishEvent(tenantId, object, audience, revision, "publish", key.surface, batchId),
      );

    let result: unknown;
    switch (key.surface) {
      case "layout": {
        const storeKey = layoutKey(tenantId, key.object, audience);
        const { published, next } = promote(
          state.layouts[storeKey] ?? { draft: null, published: null, history: [] },
          key.object,
        );
        state.layouts[storeKey] = next;
        event(key.object, published.revision);
        result = published;
        break;
      }
      case "exposures": {
        const storeKey = exposureKey(tenantId, key.object);
        const { published, next } = promote(
          await this.getViewExposuresRecord(tenantId, key.object),
          `${key.object} lists`,
        );
        state.viewExposures[storeKey] = next;
        event(key.object, published.revision);
        result = published;
        break;
      }
      case "flows": {
        const storeKey = flowKey(tenantId, key.object);
        const { published, next } = promote(
          await this.getFlowRenderModeRecord(tenantId, key.object),
          `flow ${key.object}`,
        );
        state.flowRenderModes = { ...(state.flowRenderModes ?? {}), [storeKey]: next };
        event(key.object, published.revision);
        result = published;
        break;
      }
      case "homecard": {
        const storeKey = `${tenantId}::${audience}`;
        const { published, next } = promote(
          await this.getHomeCardRecord(tenantId, audience),
          "home card",
        );
        state.homeCards = { ...(state.homeCards ?? {}), [storeKey]: next };
        // Labelled "home card" (not the audience) so the home page reads right.
        event("home card", published.revision);
        result = published;
        break;
      }
      case "screen": {
        const storeKey = customScreenKey(tenantId, key.object);
        const record = state.customScreens?.[storeKey];
        if (!record?.draft) throw new Error(`No draft to publish for custom screen ${key.object}.`);
        if (!record.draft.flowApiName) {
          throw new Error(
            "Attach this screen to a flow before publishing — the flow render ladder is the only thing that runs a custom screen.",
          );
        }
        const published = CustomScreenSchema.parse({
          ...record.draft,
          status: "published",
          revision: (record.published?.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        });
        state.customScreens = {
          ...(state.customScreens ?? {}),
          [storeKey]: {
            draft: null,
            published,
            history: record.published ? [...record.history, record.published] : record.history,
          },
        };
        event(published.label, published.revision);
        result = published;
        break;
      }
    }
    await this.save(state);
    return result as T;
  }

  async listStagedChanges(tenantId: string, labels: DiffLabels = {}): Promise<StagedChange[]> {
    return collectStagedChanges(this, tenantId, labels);
  }

  async publishStaged(tenantId: string, keys: StagedKey[]): Promise<PublishResult[]> {
    return runStagedPublish(keys, (key, batchId) =>
      this.publishOne<{ revision: number }>(tenantId, key, batchId),
    );
  }

  async listSurfaceHistory(tenantId: string, labels: DiffLabels = {}): Promise<SurfaceHistory[]> {
    return collectSurfaceHistory(this, tenantId, labels);
  }

  async rollbackStaged(
    tenantId: string,
    key: StagedKey,
    toRevision: number,
  ): Promise<{ revision: number }> {
    return runStagedRollback(this, tenantId, key, toRevision);
  }

  async listLayoutRecords(
    tenantId: string,
  ): Promise<(LayoutRecord & { object: string; audience: string })[]> {
    const state = await this.load();
    return Object.entries(state.layouts).flatMap(([key, record]) => {
      const [tenant, object, audience] = key.split("::");
      if (tenant !== tenantId || !object) return [];
      return [{ ...record, object, audience: audience ?? "default" }];
    });
  }

  async listViewExposuresRecords(
    tenantId: string,
  ): Promise<(ViewExposuresRecord & { object: string })[]> {
    const state = await this.load();
    const objects = Object.keys(state.viewExposures).flatMap((key) => {
      const [tenant, object] = key.split("::");
      return tenant === tenantId && object ? [object] : [];
    });
    return Promise.all(
      objects.map(async (object) => ({
        object,
        ...(await this.getViewExposuresRecord(tenantId, object)),
      })),
    );
  }

  async listHomeCardRecords(
    tenantId: string,
  ): Promise<(HomeCardRecord & { audience: string })[]> {
    const state = await this.load();
    const audiences = Object.keys(state.homeCards ?? {}).flatMap((key) => {
      const [tenant, audience] = key.split("::");
      return tenant === tenantId && audience ? [audience] : [];
    });
    return Promise.all(
      audiences.map(async (audience) => ({
        audience,
        ...(await this.getHomeCardRecord(tenantId, audience)),
      })),
    );
  }

  async getViewExposuresConfig(
    tenantId: string,
    object: string,
  ): Promise<ViewExposuresConfig | undefined> {
    // PUBLISHED only — this is the read side the MCP server renders from.
    return (await this.getViewExposuresRecord(tenantId, object)).published ?? undefined;
  }

  async getViewExposuresRecord(tenantId: string, object: string): Promise<ViewExposuresRecord> {
    const state = await this.load();
    const record = asStaged<ViewExposuresConfig>(state.viewExposures[exposureKey(tenantId, object)]);
    // Normalize through the schema: rows written before customLists existed
    // (v2 note) otherwise reach clients without the field and crash them.
    const parse = (c: ViewExposuresConfig | null) => (c ? ViewExposuresSchema.parse(c) : null);
    return {
      draft: parse(record.draft),
      published: parse(record.published),
      history: record.history.map((c) => ViewExposuresSchema.parse(c)),
    };
  }

  /** Stages exposure changes as a DRAFT — publish makes them visible to reps. */
  async setViewExposures(config: ViewExposuresConfig): Promise<void> {
    const state = await this.load();
    const key = exposureKey(config.tenantId, config.object);
    const record = asStaged<ViewExposuresConfig>(state.viewExposures[key]);
    state.viewExposures[key] = { ...record, draft: ViewExposuresSchema.parse(config) };
    await this.save(state);
  }

  async discardViewExposuresDraft(tenantId: string, object: string): Promise<void> {
    const state = await this.load();
    const key = exposureKey(tenantId, object);
    const record = asStaged<ViewExposuresConfig>(state.viewExposures[key]);
    if (!record.draft) return;
    state.viewExposures[key] = { ...record, draft: null };
    await this.save(state);
  }

  async publishViewExposures(tenantId: string, object: string): Promise<ViewExposuresConfig> {
    return this.publishOne(tenantId, { surface: "exposures", object });
  }

  async rollbackViewExposures(
    tenantId: string,
    object: string,
    toRevision: number,
  ): Promise<ViewExposuresConfig> {
    const state = await this.load();
    const key = exposureKey(tenantId, object);
    const record = await this.getViewExposuresRecord(tenantId, object);
    const { published, next } = restore(record, toRevision, `${object} lists`);
    state.viewExposures[key] = next;
    state.publishes.push(
      publishEvent(tenantId, object, "default", published.revision, "rollback", "exposures"),
    );
    await this.save(state);
    return published;
  }

  async listPublishes(tenantId: string): Promise<PublishEvent[]> {
    const state = await this.load();
    return state.publishes.filter((p) => p.tenantId === tenantId).reverse();
  }

  async getHomeCard(tenantId: string, audience = "default"): Promise<HomeCardConfig | undefined> {
    // PUBLISHED only — a staged home card is invisible to chat until published.
    return (await this.getHomeCardRecord(tenantId, audience)).published ?? undefined;
  }

  async getHomeCardRecord(tenantId: string, audience = "default"): Promise<HomeCardRecord> {
    const state = await this.load();
    // ?? handles config files written before homeCards existed.
    return asStaged<HomeCardConfig>((state.homeCards ?? {})[`${tenantId}::${audience}`]);
  }

  async getFlowRenderModes(tenantId: string): Promise<FlowRenderModeConfig[]> {
    // PUBLISHED only — a staged render policy does not change chat behavior.
    const records = await this.listFlowRenderModeRecords(tenantId);
    return records.flatMap((record) => (record.published ? [record.published] : []));
  }

  async listFlowRenderModeRecords(
    tenantId: string,
  ): Promise<(FlowRenderModeRecord & { flowApiName: string })[]> {
    const state = await this.load();
    const prefix = `${tenantId}::`;
    return Object.entries(state.flowRenderModes ?? {})
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, stored]) => {
        const record = asStaged<FlowRenderModeConfig>(stored);
        const parse = (c: FlowRenderModeConfig | null) =>
          c ? FlowRenderModeSchema.parse(c) : null;
        return {
          flowApiName: key.slice(prefix.length),
          draft: parse(record.draft),
          published: parse(record.published),
          history: record.history.map((c) => FlowRenderModeSchema.parse(c)),
        };
      });
  }

  async getFlowRenderModeRecord(
    tenantId: string,
    flowApiName: string,
  ): Promise<FlowRenderModeRecord> {
    const records = await this.listFlowRenderModeRecords(tenantId);
    return (
      records.find((record) => record.flowApiName === flowApiName) ?? {
        draft: null,
        published: null,
        history: [],
      }
    );
  }

  /** Stages a flow's render policy as a DRAFT — live only after publish. */
  async setFlowRenderMode(config: FlowRenderModeConfig): Promise<void> {
    const state = await this.load();
    const parsed = FlowRenderModeSchema.parse(config);
    const key = flowKey(parsed.tenantId, parsed.flowApiName);
    const record = asStaged<FlowRenderModeConfig>((state.flowRenderModes ?? {})[key]);
    state.flowRenderModes = {
      ...(state.flowRenderModes ?? {}),
      [key]: { ...record, draft: parsed },
    };
    await this.save(state);
  }

  async discardFlowRenderModeDraft(tenantId: string, flowApiName: string): Promise<void> {
    const state = await this.load();
    const key = flowKey(tenantId, flowApiName);
    const record = asStaged<FlowRenderModeConfig>((state.flowRenderModes ?? {})[key]);
    if (!record.draft) return;
    state.flowRenderModes = { ...(state.flowRenderModes ?? {}), [key]: { ...record, draft: null } };
    await this.save(state);
  }

  async publishFlowRenderMode(
    tenantId: string,
    flowApiName: string,
  ): Promise<FlowRenderModeConfig> {
    return this.publishOne(tenantId, { surface: "flows", object: flowApiName });
  }

  async rollbackFlowRenderMode(
    tenantId: string,
    flowApiName: string,
    toRevision: number,
  ): Promise<FlowRenderModeConfig> {
    const state = await this.load();
    const key = flowKey(tenantId, flowApiName);
    const record = await this.getFlowRenderModeRecord(tenantId, flowApiName);
    const { published, next } = restore(record, toRevision, `flow ${flowApiName}`);
    state.flowRenderModes = { ...(state.flowRenderModes ?? {}), [key]: next };
    state.publishes.push(
      publishEvent(tenantId, flowApiName, "default", published.revision, "rollback", "flows"),
    );
    await this.save(state);
    return published;
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

  async discardCustomScreenDraft(tenantId: string, id: string): Promise<void> {
    const state = await this.load();
    const key = customScreenKey(tenantId, id);
    const record = state.customScreens?.[key];
    if (!record?.draft) return;
    state.customScreens = { ...(state.customScreens ?? {}), [key]: { ...record, draft: null } };
    await this.save(state);
  }

  async publishCustomScreen(tenantId: string, id: string): Promise<CustomScreenConfig> {
    return this.publishOne(tenantId, { surface: "screen", object: id });
  }

  async rollbackCustomScreen(
    tenantId: string,
    id: string,
    toRevision: number,
  ): Promise<CustomScreenConfig> {
    const state = await this.load();
    const key = customScreenKey(tenantId, id);
    const record = state.customScreens?.[key] ?? { draft: null, published: null, history: [] };
    const { published, next } = restore(record, toRevision, `custom screen ${id}`);
    state.customScreens = { ...(state.customScreens ?? {}), [key]: next };
    state.publishes.push(
      publishEvent(tenantId, published.label, "default", published.revision, "rollback", "screen"),
    );
    await this.save(state);
    return published;
  }


  /**
   * Stages home-card changes as a DRAFT. Before the staging model these edits
   * lived in React state only and were lost on tab close — they are durable now.
   */
  async setHomeCard(config: HomeCardConfig): Promise<void> {
    const state = await this.load();
    const key = `${config.tenantId}::${config.audience}`;
    const record = asStaged<HomeCardConfig>((state.homeCards ?? {})[key]);
    state.homeCards = { ...(state.homeCards ?? {}), [key]: { ...record, draft: config } };
    await this.save(state);
  }

  async discardHomeCardDraft(tenantId: string, audience = "default"): Promise<void> {
    const state = await this.load();
    const key = `${tenantId}::${audience}`;
    const record = asStaged<HomeCardConfig>((state.homeCards ?? {})[key]);
    if (!record.draft) return;
    state.homeCards = { ...(state.homeCards ?? {}), [key]: { ...record, draft: null } };
    await this.save(state);
  }

  /** Publish ceremony for home cards: revision bumps from current, event logged. */
  async publishHomeCard(tenantId: string, audience = "default"): Promise<HomeCardConfig> {
    return this.publishOne(tenantId, { surface: "homecard", object: audience, audience });
  }

  async rollbackHomeCard(
    tenantId: string,
    toRevision: number,
    audience = "default",
  ): Promise<HomeCardConfig> {
    const state = await this.load();
    const key = `${tenantId}::${audience}`;
    const record = await this.getHomeCardRecord(tenantId, audience);
    const { published, next } = restore(record, toRevision, "home card");
    state.homeCards = { ...(state.homeCards ?? {}), [key]: next };
    state.publishes.push(
      publishEvent(tenantId, "home card", audience, published.revision, "rollback", "homecard"),
    );
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
