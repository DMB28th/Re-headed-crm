import { NextResponse } from "next/server";
import { parseLayoutConfig } from "@cardstack/core";
import { diffLayouts } from "@cardstack/config-store";
import { getAdapter, getStore, TENANT_ID } from "../../../../lib/backend";

type Params = { params: Promise<{ object: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { object } = await params;
  const store = await getStore();
  const adapter = getAdapter();
  const record = await store.getLayoutRecord(TENANT_ID, object);
  const describe = await adapter.describeObject(object);
  // Related-object describes keyed by relationship api — the related-list
  // picker (3b) needs the target's fields for column choices.
  const relatedDescribes: Record<string, unknown> = {};
  for (const rel of describe.relationships) {
    relatedDescribes[rel.api] = await adapter.describeObject(rel.relatedObject);
  }
  const diff = record.draft ? diffLayouts(record.published, record.draft) : null;
  return NextResponse.json({ record, describe, relatedDescribes, diff });
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
