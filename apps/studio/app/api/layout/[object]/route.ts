import { NextResponse } from "next/server";
import { parseLayoutConfig } from "@cardstack/core";
import { diffLayouts } from "@cardstack/config-store";
import { getAdapter, getStore, TENANT_ID } from "../../../../lib/backend";

type Params = { params: Promise<{ object: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const store = await getStore();
    const adapter = await getAdapter();
    const record = await store.getLayoutRecord(TENANT_ID, object);
    const full = await adapter.describeObject(object);
    // Related-object describes keyed by relationship api — the related-list
    // picker (3b) needs the target's fields for column choices. Targets the
    // token can't describe (e.g. tickets without the tickets scope) are
    // OPTIONAL: drop the relationship instead of failing the whole builder.
    const relatedDescribes: Record<string, unknown> = {};
    const relationships = [];
    for (const rel of full.relationships) {
      try {
        relatedDescribes[rel.api] = await adapter.describeObject(rel.relatedObject);
        relationships.push(rel);
      } catch {
        // missing scope / undescribable target — this related list is simply not offered
      }
    }
    const describe = { ...full, relationships };
    const diff = record.draft ? diffLayouts(record.published, record.draft) : null;
    return NextResponse.json({ record, describe, relatedDescribes, diff });
  } catch (error) {
    // Surface CRM failures as JSON — an HTML 500 leaves the builder stuck on
    // "Loading…" forever (live-sandbox feedback 2026-07-11).
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const draft = parseLayoutConfig(await req.json());
    if (draft.object !== object || draft.tenantId !== TENANT_ID) {
      return NextResponse.json({ error: "tenant/object mismatch" }, { status: 400 });
    }
    await (await getStore()).saveDraft(draft);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { object } = await params;
  try {
    await (await getStore()).discardDraft(TENANT_ID, object);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
