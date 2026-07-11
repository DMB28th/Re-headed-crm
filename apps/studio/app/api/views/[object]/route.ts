import { NextResponse } from "next/server";
import { ViewExposuresConfig } from "@cardstack/core";
import { getAdapter, getStore, TENANT_ID } from "../../../../lib/backend";

type Params = { params: Promise<{ object: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { object } = await params;
  const savedViews = await getAdapter().listSavedViews(object);
  const exposures =
    (await (await getStore()).getViewExposuresConfig(TENANT_ID, object)) ??
    ViewExposuresConfig.parse({ version: 1, tenantId: TENANT_ID, object, views: [] });
  return NextResponse.json({ savedViews, exposures });
}

export async function PUT(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const exposures = ViewExposuresConfig.parse(await req.json());
    if (exposures.object !== object || exposures.tenantId !== TENANT_ID) {
      return NextResponse.json({ error: "tenant/object mismatch" }, { status: 400 });
    }
    await (await getStore()).setViewExposures(exposures);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
