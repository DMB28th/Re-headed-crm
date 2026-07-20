import { NextResponse } from "next/server";
import { ViewExposuresConfig } from "@cardstack/core";
import { mergeScopedViewExposures, scopeViewExposuresForUser } from "@cardstack/config-store";
import { getAdapter, getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

type Params = { params: Promise<{ object: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const user = getUserContextFromRequest(_req);
    const { tenantId } = user;
    const adapter = await getAdapter(tenantId);
    const store = await getStore();
    const savedViews = await adapter.listSavedViews(object);
    // describe feeds the custom-list filter builder (field/op/value rows).
    const describe = await adapter.describeObject(object);
    const fullExposures =
      (await store.getViewExposuresConfig(tenantId, object)) ??
      ViewExposuresConfig.parse({ version: 1, tenantId, object, views: [] });
    const exposures = scopeViewExposuresForUser(fullExposures, user);
    return NextResponse.json({ savedViews, exposures, describe, currentUser: user });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const user = getUserContextFromRequest(req);
    const { tenantId } = user;
    const incoming = ViewExposuresConfig.parse(await req.json());
    if (incoming.object !== object || incoming.tenantId !== tenantId) {
      return NextResponse.json({ error: "tenant/object mismatch" }, { status: 400 });
    }
    const store = await getStore();
    const existing = await store.getViewExposuresConfig(tenantId, object);
    const exposures = mergeScopedViewExposures(existing, incoming, user);
    await store.setViewExposures(exposures);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
