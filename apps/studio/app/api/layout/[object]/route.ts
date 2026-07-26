import { NextResponse } from "next/server";
import { parseLayoutConfig } from "@cardstack/core";
import { diffLayouts } from "@cardstack/config-store";
import { CrmObjectNotFoundError } from "@cardstack/crm-adapters";
import { getAdapter, getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

type Params = { params: Promise<{ object: string }> };

export async function GET(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const store = await getStore();
    const adapter = await getAdapter(tenantId);
    let full;
    try {
      full = await adapter.describeObject(object);
    } catch (error) {
      if (!(error instanceof CrmObjectNotFoundError)) throw error;
      // A wrong slug is a 404, NOT a CRM incident — dressing it as "couldn't
      // reach the CRM" sends admins off to fix a healthy connection (UX
      // review 2026-07-26 P0-4). Recover mis-cased slugs; otherwise name the
      // real objects.
      const objects = await adapter.listObjects().catch(() => []);
      const match = objects.find((o) => o.api.toLowerCase() === object.toLowerCase());
      if (match && match.api !== object) {
        return NextResponse.json({ redirect: match.api });
      }
      return NextResponse.json(
        {
          notFound: true,
          error: String(error),
          objects: objects.map((o) => ({ api: o.api, labelPlural: o.labelPlural })),
        },
        { status: 404 },
      );
    }
    const record = await store.getLayoutRecord(tenantId, object);
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
    const { tenantId } = getUserContextFromRequest(req);
    const draft = parseLayoutConfig(await req.json());
    if (draft.object !== object || draft.tenantId !== tenantId) {
      return NextResponse.json({ error: "tenant/object mismatch" }, { status: 400 });
    }
    await (await getStore()).saveDraft(draft);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const { tenantId } = getUserContextFromRequest(req);
    await (await getStore()).discardDraft(tenantId, object);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
