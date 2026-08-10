import { NextResponse } from "next/server";
import { ViewExposuresConfig } from "@cardstack/core";
import { mergeScopedViewExposures, scopeViewExposuresForUser } from "@cardstack/config-store";
import { getAdapter, getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

type Params = { params: Promise<{ object: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const user = await getUserContextFromRequest(_req);
    const { tenantId } = user;
    const adapter = await getAdapter(tenantId);
    const store = await getStore();
    const savedViews = await adapter.listSavedViews(object);
    // describe feeds the custom-list filter builder (field/op/value rows).
    const describe = await adapter.describeObject(object);
    // The editor works on the DRAFT (what this admin is staging); the published
    // record is what reps see until Review & publish.
    const record = await store.getViewExposuresRecord(tenantId, object);
    const fullExposures =
      record.draft ??
      record.published ??
      ViewExposuresConfig.parse({ version: 1, tenantId, object, views: [] });
    const exposures = scopeViewExposuresForUser(fullExposures, user);
    return NextResponse.json({
      savedViews,
      exposures,
      describe,
      currentUser: user,
      staged: record.draft !== null,
      publishedRevision: record.published?.revision ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const user = await getUserContextFromRequest(req);
    const { tenantId } = user;
    const incoming = ViewExposuresConfig.parse(await req.json());
    if (incoming.object !== object || incoming.tenantId !== tenantId) {
      return NextResponse.json({ error: "tenant/object mismatch" }, { status: 400 });
    }
    const store = await getStore();
    // Merge against the working copy (draft first) so two admins editing at
    // once don't clobber each other's staged rows.
    const record = await store.getViewExposuresRecord(tenantId, object);
    const existing = record.draft ?? record.published ?? undefined;
    const exposures = mergeScopedViewExposures(existing, incoming, user);
    await store.setViewExposures(exposures);
    // Staged, NOT live: exposing a list changes what every rep sees in chat.
    return NextResponse.json({ ok: true, staged: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
