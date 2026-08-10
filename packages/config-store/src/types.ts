import type {
  CustomScreenConfig,
  CustomScreenRecord,
  CustomList,
  FlowRenderModeConfig,
  HomeCardConfig,
  LayoutConfig,
  ViewExposure,
  ViewExposuresConfig,
} from "@cardstack/core";
import type { DiffLabels, LayoutDiff } from "./diff.js";

/**
 * Whether a CRM is wired up for the tenant. Disconnected = empty canvas:
 * Studio shows empty states and every MCP tool refuses with a "connect one in
 * Studio" message. Stores without a stored state default to CONNECTED (mock)
 * so pre-existing config files/databases keep working.
 *
 * Migration note (2026-07-11): added optional `credentials` — live-CRM
 * secrets (HubSpot private-app token / Salesforce OAuth credentials; legacy
 * Salesforce client credentials may still exist in older config files).
 * Additive; absent = the mock portal. SERVER-SIDE ONLY: Studio's API redacts
 * it and nothing ever reaches a widget payload (hard rule 3). At-rest
 * encryption (KMS) is the M7 hardening item.
 *
 * Migration note (2026-07-20): added optional `pendingAuth` — transient
 * OAuth-start state (state, PKCE verifier, pending client id/secret,
 * redirect_uri) staged during an admin re-authorization so an abandoned flow
 * never tears down a live `credentials`/`status`. Cleared on successful
 * callback. Additive; SERVER-SIDE ONLY, same redaction + encryption rules as
 * `credentials`.
 */
export interface ConnectionState {
  tenantId: string;
  status: "connected" | "disconnected";
  crm: "hubspot" | "salesforce";
  /** Human label for the portal: "mock portal" | "private app" | "admin OAuth" | legacy labels. */
  label: string;
  changedAt: string;
  credentials?: Record<string, string>;
  /** Transient OAuth-start state; present only between authorize and callback. */
  pendingAuth?: Record<string, string>;
}

/**
 * Per-user CRM auth. Workspace/admin auth is for setup and metadata; runtime
 * reads/writes can require the actual product user's own CRM token.
 */
export interface UserConnectionState {
  tenantId: string;
  userId: string;
  status: "connected" | "disconnected";
  crm: "salesforce";
  /** Human label for this user auth, e.g. "user OAuth". */
  label: string;
  changedAt: string;
  /** Display name Salesforce reports for the authorized user. */
  connectedUser?: string;
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
  /** Full exposure config for user-scoped reads; callers must filter before display. */
  getViewExposuresConfig(
    tenantId: string,
    object: string,
  ): Promise<ViewExposuresConfig | undefined>;
  /** Admin-defined custom lists (filters live in Cardstack, not the CRM). */
  getCustomLists(tenantId: string, object: string): Promise<CustomList[]>;
  /** Published home-card config for "open my CRM" (design 7a). */
  getHomeCard(tenantId: string, audience?: string): Promise<HomeCardConfig | undefined>;
  /** Flow render policies, keyed to CRM-native flow API names (design 10c/11d). */
  getFlowRenderModes(tenantId: string): Promise<FlowRenderModeConfig[]>;
  /** Published custom screens available to the flow runtime (design 11a). */
  getCustomScreens(tenantId: string): Promise<CustomScreenConfig[]>;
  getConnection(tenantId: string): Promise<ConnectionState>;
  getUserConnection(
    tenantId: string,
    userId: string,
    crm: UserConnectionState["crm"],
  ): Promise<UserConnectionState | undefined>;
}

/**
 * One staged config slot: what admins are editing, what reps see, and the
 * published revisions kept for rollback. Every governed surface uses this —
 * layouts, view exposures, flow render modes, the home card, custom screens —
 * so "is this live?" has exactly one answer shape across Studio
 * (docs/studio-staging-model.md).
 */
export interface StagedRecord<T> {
  draft: T | null;
  published: T | null;
  /** Previous published revisions, oldest first — "previous versions are kept". */
  history: T[];
}

/** One (tenant, object, audience) slot: draft vs published + rollback history. */
export type LayoutRecord = StagedRecord<LayoutConfig>;
export type ViewExposuresRecord = StagedRecord<ViewExposuresConfig>;
export type FlowRenderModeRecord = StagedRecord<FlowRenderModeConfig>;
export type HomeCardRecord = StagedRecord<HomeCardConfig>;

/**
 * Which governed surface a publish event / staged change belongs to. Studio's
 * pending-changes tray groups by this; the home page's "Recent publishes" uses
 * it to label rows that aren't object layouts.
 */
export type PublishSurface = "layout" | "exposures" | "flows" | "homecard" | "screen";

export interface PublishEvent {
  tenantId: string;
  object: string;
  audience: string;
  revision: number;
  kind: "publish" | "rollback";
  timestamp: string;
  /**
   * Which surface published. Optional: events written before the staging model
   * (docs/studio-staging-model.md) have no surface and render as layouts, which
   * is what they were.
   */
  surface?: PublishSurface;
  /**
   * Groups the events of one "Review & publish" run. Publishing is sequential,
   * not atomic (the file store cannot transact across keys), so a batch is a
   * display grouping and a partial-failure boundary — never a rollback unit.
   */
  batchId?: string;
}

/**
 * Identifies one staged surface for the pending-changes tray and for
 * `publishStaged`. `object` is the object api for layouts/exposures, the flow
 * api name for flows, the screen id for screens, and the audience for the home
 * card — i.e. whatever the surface's publish verb keys on.
 */
export interface StagedKey {
  surface: PublishSurface;
  object: string;
  audience?: string;
}

/** One row in the pending-changes tray: what is staged, and what would change. */
export interface StagedChange extends StagedKey {
  /** Human label for the row ("Deals", "Renewal approval", "Home card"). */
  label: string;
  /** Revision reps see today; null when this surface has never published. */
  publishedRevision: number | null;
  diff: LayoutDiff;
}

/**
 * A surface's published revision plus what can be restored. Drives the
 * rollback list in Review & publish — rollback is about published history, so
 * a surface appears here whether or not anything is staged.
 */
export interface SurfaceHistory extends StagedKey {
  label: string;
  publishedRevision: number | null;
  /** Restorable revisions, newest first. */
  revisions: { revision: number; name?: string }[];
}

/** Outcome of one surface inside a `publishStaged` batch. */
export interface PublishResult extends StagedKey {
  ok: boolean;
  revision?: number;
  error?: string;
}

/** Write side — what Studio needs on top of the read side. */
export interface AdminConfigStore extends ConfigStore {
  getLayoutRecord(tenantId: string, object: string, audience?: string): Promise<LayoutRecord>;
  /** Every layout slot for the tenant, INCLUDING drafts never published. */
  listLayoutRecords(
    tenantId: string,
  ): Promise<(LayoutRecord & { object: string; audience: string })[]>;
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
  /**
   * Full exposure config including unexposed views (Studio's 5a table), as a
   * staged record. `.published` is what chat resolves; `.draft` is Studio-only.
   */
  getViewExposuresRecord(tenantId: string, object: string): Promise<ViewExposuresRecord>;
  listViewExposuresRecords(
    tenantId: string,
  ): Promise<(ViewExposuresRecord & { object: string })[]>;
  /**
   * Stage exposure changes. NOT live to reps — exposing a list changes what
   * every rep can see in chat, so it goes through Review & publish like a
   * layout (docs/studio-staging-model.md).
   */
  setViewExposures(config: ViewExposuresConfig): Promise<void>;
  discardViewExposuresDraft(tenantId: string, object: string): Promise<void>;
  publishViewExposures(tenantId: string, object: string): Promise<ViewExposuresConfig>;
  rollbackViewExposures(
    tenantId: string,
    object: string,
    toRevision: number,
  ): Promise<ViewExposuresConfig>;

  getHomeCardRecord(tenantId: string, audience?: string): Promise<HomeCardRecord>;
  listHomeCardRecords(tenantId: string): Promise<(HomeCardRecord & { audience: string })[]>;
  /** Stage home-card changes (durable — closing the tab no longer loses them). */
  setHomeCard(config: HomeCardConfig): Promise<void>;
  discardHomeCardDraft(tenantId: string, audience?: string): Promise<void>;
  publishHomeCard(tenantId: string, audience?: string): Promise<HomeCardConfig>;
  rollbackHomeCard(
    tenantId: string,
    toRevision: number,
    audience?: string,
  ): Promise<HomeCardConfig>;

  listFlowRenderModeRecords(
    tenantId: string,
  ): Promise<(FlowRenderModeRecord & { flowApiName: string })[]>;
  getFlowRenderModeRecord(tenantId: string, flowApiName: string): Promise<FlowRenderModeRecord>;
  /** Stage a flow's render policy. Live only after publish. */
  setFlowRenderMode(config: FlowRenderModeConfig): Promise<void>;
  discardFlowRenderModeDraft(tenantId: string, flowApiName: string): Promise<void>;
  publishFlowRenderMode(tenantId: string, flowApiName: string): Promise<FlowRenderModeConfig>;
  rollbackFlowRenderMode(
    tenantId: string,
    flowApiName: string,
    toRevision: number,
  ): Promise<FlowRenderModeConfig>;

  /**
   * Everything staged for this tenant, across all six surfaces, with diffs.
   * `labels` resolves CRM view / flow ids to the names an admin recognizes —
   * the store holds ids only (adapters never leak above the adapter), so Studio
   * passes them in. Every lookup falls back to the raw id.
   */
  listStagedChanges(tenantId: string, labels?: DiffLabels): Promise<StagedChange[]>;
  /**
   * Publish the named surfaces in one run. Sequential, NOT atomic: each entry
   * gets its own PublishEvent tagged with a shared batchId, and a failure on
   * one surface does not roll back the ones already published — the caller is
   * handed per-surface results and must report partial failure honestly.
   */
  publishStaged(tenantId: string, keys: StagedKey[]): Promise<PublishResult[]>;
  /** Every surface with publish history, and which revisions can be restored. */
  listSurfaceHistory(tenantId: string, labels?: DiffLabels): Promise<SurfaceHistory[]>;
  /**
   * Restore a previous revision of any surface. Rolling back is itself a
   * publish: the restored config gets a NEW revision so the chain stays linear.
   */
  rollbackStaged(
    tenantId: string,
    key: StagedKey,
    toRevision: number,
  ): Promise<{ revision: number }>;
  listCustomScreenRecords(tenantId: string): Promise<(CustomScreenRecord & { id: string })[]>;
  getCustomScreenRecord(tenantId: string, id: string): Promise<CustomScreenRecord>;
  saveCustomScreenDraft(config: CustomScreenConfig): Promise<void>;
  discardCustomScreenDraft(tenantId: string, id: string): Promise<void>;
  publishCustomScreen(tenantId: string, id: string): Promise<CustomScreenConfig>;
  rollbackCustomScreen(
    tenantId: string,
    id: string,
    toRevision: number,
  ): Promise<CustomScreenConfig>;
  listPublishes(tenantId: string): Promise<PublishEvent[]>;
  setConnection(state: ConnectionState): Promise<void>;
  setUserConnection(state: UserConnectionState): Promise<void>;
  deleteUserConnection(
    tenantId: string,
    userId: string,
    crm: UserConnectionState["crm"],
  ): Promise<void>;
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

export const flowKey = (tenantId: string, flowApiName: string): string =>
  `${tenantId}::${flowApiName}`;

export const customScreenKey = (tenantId: string, id: string): string =>
  `${tenantId}::${id}`;

export const userConnectionKey = (
  tenantId: string,
  userId: string,
  crm: UserConnectionState["crm"],
): string => `${tenantId}::${userId}::${crm}`;
