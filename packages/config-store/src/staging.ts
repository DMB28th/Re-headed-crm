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
