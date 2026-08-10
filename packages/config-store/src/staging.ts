/**
 * Shared staging engine (docs/studio-staging-model.md).
 *
 * Both stores hold the same six governed surfaces, so "what is staged?" and
 * "publish these" are implemented ONCE here against a narrow record-listing
 * interface. Each store supplies the storage-specific `publishOne`; everything
 * about which surfaces exist, how they diff, and how a batch reports partial
 * failure lives here so the two stores cannot drift apart.
 */
import { randomUUID } from "node:crypto";
import type { CustomScreenRecord } from "@cardstack/core";
import {
  diffCustomScreens,
  diffFlowRenderModes,
  diffHomeCards,
  diffLayouts,
  diffViewExposures,
  isEmptyDiff,
  type DiffLabels,
  type LayoutDiff,
} from "./diff.js";
import type {
  FlowRenderModeRecord,
  HomeCardRecord,
  LayoutRecord,
  PublishResult,
  StagedChange,
  StagedKey,
  SurfaceHistory,
  ViewExposuresRecord,
} from "./types.js";

/** Everything `collectStagedChanges` needs — implemented by both stores. */
export interface StagedSource {
  listLayoutRecords(
    tenantId: string,
  ): Promise<(LayoutRecord & { object: string; audience: string })[]>;
  listViewExposuresRecords(
    tenantId: string,
  ): Promise<(ViewExposuresRecord & { object: string })[]>;
  listFlowRenderModeRecords(
    tenantId: string,
  ): Promise<(FlowRenderModeRecord & { flowApiName: string })[]>;
  listHomeCardRecords(tenantId: string): Promise<(HomeCardRecord & { audience: string })[]>;
  listCustomScreenRecords(tenantId: string): Promise<(CustomScreenRecord & { id: string })[]>;
}

export async function collectStagedChanges(
  source: StagedSource,
  tenantId: string,
  labels: DiffLabels = {},
): Promise<StagedChange[]> {
  const changes: StagedChange[] = [];
  const push = (
    key: StagedKey,
    label: string,
    publishedRevision: number | null,
    diff: LayoutDiff,
  ) => {
    // A draft whose content matches what is published is not a pending change —
    // it is a no-op the admin edited their way back to. Listing it would make
    // "3 pending changes" mean nothing.
    if (!isEmptyDiff(diff)) changes.push({ ...key, label, publishedRevision, diff });
  };

  for (const record of await source.listLayoutRecords(tenantId)) {
    if (!record.draft) continue;
    push(
      { surface: "layout", object: record.object, audience: record.audience },
      record.object,
      record.published?.revision ?? null,
      diffLayouts(record.published, record.draft),
    );
  }

  for (const record of await source.listViewExposuresRecords(tenantId)) {
    if (!record.draft) continue;
    push(
      { surface: "exposures", object: record.object },
      record.object,
      record.published?.revision ?? null,
      diffViewExposures(record.published, record.draft, labels),
    );
  }

  for (const record of await source.listFlowRenderModeRecords(tenantId)) {
    if (!record.draft) continue;
    push(
      { surface: "flows", object: record.flowApiName },
      labels[record.flowApiName] ?? record.flowApiName,
      record.published?.revision ?? null,
      diffFlowRenderModes(record.published, record.draft, labels),
    );
  }

  for (const record of await source.listHomeCardRecords(tenantId)) {
    if (!record.draft) continue;
    push(
      { surface: "homecard", object: record.audience, audience: record.audience },
      "Home card",
      record.published?.revision ?? null,
      diffHomeCards(record.published, record.draft),
    );
  }

  for (const record of await source.listCustomScreenRecords(tenantId)) {
    if (!record.draft) continue;
    push(
      { surface: "screen", object: record.id },
      record.draft.label,
      record.published?.revision ?? null,
      diffCustomScreens(record.published, record.draft),
    );
  }

  return changes;
}

/**
 * Run a batch publish. SEQUENTIAL and NOT atomic — neither store can transact
 * across six tables/keys, so a failure part-way leaves the earlier surfaces
 * published. Every key gets a result; the caller reports partial failure rather
 * than pretending the batch was all-or-nothing.
 */
export async function runStagedPublish(
  keys: StagedKey[],
  publishOne: (key: StagedKey, batchId: string) => Promise<{ revision: number }>,
): Promise<PublishResult[]> {
  const batchId = randomUUID();
  const results: PublishResult[] = [];
  for (const key of keys) {
    try {
      const published = await publishOne(key, batchId);
      results.push({ ...key, ok: true, revision: published.revision });
    } catch (error) {
      results.push({ ...key, ok: false, error: (error as Error).message });
    }
  }
  return results;
}


/**
 * Every surface that has something to roll back to, newest revision first.
 *
 * Unlike `collectStagedChanges` this is about PUBLISHED history, so a surface
 * shows up whether or not it has a draft: rolling back is exactly what you
 * reach for when nothing is staged and the last publish was wrong.
 */
export async function collectSurfaceHistory(
  source: StagedSource,
  tenantId: string,
  labels: DiffLabels = {},
): Promise<SurfaceHistory[]> {
  const out: SurfaceHistory[] = [];
  const push = (
    key: StagedKey,
    label: string,
    published: { revision: number } | null,
    history: { revision: number; name?: string }[],
  ) => {
    if (history.length === 0) return; // nothing to restore
    out.push({
      ...key,
      label,
      publishedRevision: published?.revision ?? null,
      revisions: [...history].sort((a, b) => b.revision - a.revision),
    });
  };

  for (const record of await source.listLayoutRecords(tenantId)) {
    push(
      { surface: "layout", object: record.object, audience: record.audience },
      record.object,
      record.published,
      record.history.map((c) => ({ revision: c.revision, ...(c.name ? { name: c.name } : {}) })),
    );
  }
  for (const record of await source.listViewExposuresRecords(tenantId)) {
    push(
      { surface: "exposures", object: record.object },
      record.object,
      record.published,
      record.history.map((c) => ({ revision: c.revision })),
    );
  }
  for (const record of await source.listFlowRenderModeRecords(tenantId)) {
    push(
      { surface: "flows", object: record.flowApiName },
      labels[record.flowApiName] ?? record.flowApiName,
      record.published,
      record.history.map((c) => ({ revision: c.revision, name: c.mode })),
    );
  }
  for (const record of await source.listHomeCardRecords(tenantId)) {
    push(
      { surface: "homecard", object: record.audience, audience: record.audience },
      "Home card",
      record.published,
      record.history.map((c) => ({ revision: c.revision })),
    );
  }
  for (const record of await source.listCustomScreenRecords(tenantId)) {
    push(
      { surface: "screen", object: record.id },
      record.published?.label ?? record.draft?.label ?? record.id,
      record.published,
      record.history.map((c) => ({ revision: c.revision, name: c.label })),
    );
  }
  return out;
}

/** The per-surface rollback verbs a store must expose for the dispatcher. */
export interface RollbackTarget {
  rollback(
    tenantId: string,
    object: string,
    toRevision: number,
    audience?: string,
  ): Promise<{ revision: number }>;
  rollbackViewExposures(
    tenantId: string,
    object: string,
    toRevision: number,
  ): Promise<{ revision: number }>;
  rollbackFlowRenderMode(
    tenantId: string,
    flowApiName: string,
    toRevision: number,
  ): Promise<{ revision: number }>;
  rollbackHomeCard(
    tenantId: string,
    toRevision: number,
    audience?: string,
  ): Promise<{ revision: number }>;
  rollbackCustomScreen(
    tenantId: string,
    id: string,
    toRevision: number,
  ): Promise<{ revision: number }>;
}

/**
 * One entry point for restoring any surface, so the API doesn't have to know
 * five method shapes and the two stores can't disagree about the dispatch.
 */
export function runStagedRollback(
  store: RollbackTarget,
  tenantId: string,
  key: StagedKey,
  toRevision: number,
): Promise<{ revision: number }> {
  switch (key.surface) {
    case "layout":
      return store.rollback(tenantId, key.object, toRevision, key.audience ?? "default");
    case "exposures":
      return store.rollbackViewExposures(tenantId, key.object, toRevision);
    case "flows":
      return store.rollbackFlowRenderMode(tenantId, key.object, toRevision);
    case "homecard":
      return store.rollbackHomeCard(tenantId, toRevision, key.audience ?? "default");
    case "screen":
      return store.rollbackCustomScreen(tenantId, key.object, toRevision);
  }
}
