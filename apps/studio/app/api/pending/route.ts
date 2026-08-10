/**
 * The pending-changes tray (docs/studio-staging-model.md).
 *
 * GET  — everything staged for this tenant across all six governed surfaces,
 *        with a diff per entry, plus every surface with restorable history.
 *        Rollback is about PUBLISHED history, so it is listed even when
 *        nothing is staged — that's exactly when you reach for it.
 * POST — publish the named surfaces. SEQUENTIAL, not atomic: the response
 *        reports each surface's outcome so a partial failure is stated, never
 *        smoothed over.
 */
import { NextResponse } from "next/server";
import type { DiffLabels, StagedKey } from "@cardstack/config-store";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

/**
 * The store is CRM-agnostic and holds ids only, so diffs would read
 * "list · 3814092" without this. Every lookup is best-effort: a CRM hiccup
 * degrades the labels to ids, it never fails the tray.
 */
async function resolveLabels(tenantId: string): Promise<DiffLabels> {
  const labels: DiffLabels = {};
  try {
    const store = await getStore();
    const adapter = await getAdapter(tenantId);
    for (const object of await store.listConfiguredObjects(tenantId)) {
      for (const view of await adapter.listSavedViews(object).catch(() => [])) {
        labels[view.id] = view.name;
      }
    }
    for (const flow of await adapter.listFlows().catch(() => [])) {
      labels[flow.api] = flow.label;
    }
  } catch {
    // Ids are a fine fallback — the tray still lists what is staged.
  }
  return labels;
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const store = await getStore();
    const labels = await resolveLabels(tenantId);
    const [changes, history] = await Promise.all([
      store.listStagedChanges(tenantId, labels),
      store.listSurfaceHistory(tenantId, labels),
    ]);
    return NextResponse.json({ changes, history });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const body = (await req.json()) as { keys?: StagedKey[] };
    const keys = body.keys ?? [];
    if (keys.length === 0) {
      return NextResponse.json({ error: "Nothing selected to publish." }, { status: 400 });
    }
    const results = await (await getStore()).publishStaged(tenantId, keys);
    // 207: some surfaces published, some didn't — the client must say which.
    const failed = results.filter((result) => !result.ok);
    return NextResponse.json({ results }, { status: failed.length > 0 ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
