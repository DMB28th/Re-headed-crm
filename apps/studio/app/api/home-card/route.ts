import { NextResponse } from "next/server";
import { HomeCardConfig } from "@cardstack/core";
import { getAdapter, getStore, TENANT_ID } from "../../../lib/backend";

export async function GET() {
  const store = getStore();
  const homeCard = await store.getHomeCard(TENANT_ID);
  const exposures = await store.getViewExposures(TENANT_ID, "deals");
  const savedViews = await getAdapter().listSavedViews("deals");
  const exposedViews = exposures.flatMap((exposure) => {
    const view = savedViews.find((v) => v.id === exposure.viewId);
    return view ? [{ viewId: view.id, name: view.name, filterSummary: view.filterSummary }] : [];
  });
  return NextResponse.json({ homeCard, exposedViews });
}

export async function POST(req: Request) {
  try {
    const config = HomeCardConfig.parse(await req.json());
    if (config.tenantId !== TENANT_ID) {
      return NextResponse.json({ error: "tenant mismatch" }, { status: 400 });
    }
    const published = await getStore().publishHomeCard(config);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
