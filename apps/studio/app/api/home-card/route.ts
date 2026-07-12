import { NextResponse } from "next/server";
import { HomeCardConfig, summarizeCustomFilters, type CustomList } from "@cardstack/core";
import { getAdapter, getStore, TENANT_ID } from "../../../lib/backend";

export interface ExposedViewInfo {
  viewId: string;
  object: string;
  name: string;
  filterSummary: string;
  /** Present when the entry is a Cardstack custom list (drill-in runs its filters). */
  custom?: CustomList;
}

export async function GET() {
  try {
  const store = await getStore();
  const adapter = await getAdapter();
  const homeCard = await store.getHomeCard(TENANT_ID);
  const connection = await store.getConnection(TENANT_ID);
  const connectedUser =
    connection.status === "connected"
      ? await adapter.getConnectedUser().catch(() => null)
      : null;

  // Exposed views across EVERY published object (the home card is not deals-only).
  const objects = await store.listConfiguredObjects(TENANT_ID);
  const exposedViews: ExposedViewInfo[] = [];
  for (const object of objects) {
    const exposures = await store.getViewExposures(TENANT_ID, object);
    // A CRM that can't list views (or is missing a scope) must not sink the
    // whole builder — custom lists still resolve without it.
    const savedViews = await adapter.listSavedViews(object).catch(() => []);
    const customs = new Map(
      (await store.getCustomLists(TENANT_ID, object)).map((c) => [c.id, c]),
    );
    for (const exposure of exposures) {
      const custom = customs.get(exposure.viewId);
      if (custom) {
        exposedViews.push({
          viewId: custom.id,
          object,
          name: custom.name,
          filterSummary: summarizeCustomFilters(custom),
          custom,
        });
        continue;
      }
      const view = savedViews.find((v) => v.id === exposure.viewId);
      if (view) {
        exposedViews.push({
          viewId: view.id,
          object,
          name: view.name,
          filterSummary: view.filterSummary,
        });
      }
    }
  }
  // Redact: credentials never leave the server (hard rule 3).
  const { credentials, ...connectionSafe } = connection;
  return NextResponse.json({
    homeCard,
    exposedViews,
    connection: { ...connectionSafe, live: !!credentials && Object.keys(credentials).length > 0 },
    connectedUser,
  });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const config = HomeCardConfig.parse(await req.json());
    if (config.tenantId !== TENANT_ID) {
      return NextResponse.json({ error: "tenant mismatch" }, { status: 400 });
    }
    const published = await (await getStore()).publishHomeCard(config);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
