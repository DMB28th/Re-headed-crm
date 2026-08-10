/**
 * POST /api/rollback — restore a previous revision of any governed surface.
 *
 * One route for all five surfaces: the store's `rollbackStaged` dispatcher owns
 * the per-surface shapes, so Studio doesn't have to know five method
 * signatures. Rolling back is itself a publish — the restored config gets a NEW
 * revision and a rollback event, so the version chain stays linear.
 */
import { NextResponse } from "next/server";
import type { StagedKey } from "@cardstack/config-store";
import { getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

export async function POST(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const body = (await req.json()) as { key?: StagedKey; toRevision?: number };
    if (!body.key?.surface || !body.key.object || typeof body.toRevision !== "number") {
      return NextResponse.json({ error: "Missing surface, object or revision." }, { status: 400 });
    }
    const published = await (await getStore()).rollbackStaged(tenantId, body.key, body.toRevision);
    return NextResponse.json({ revision: published.revision });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
