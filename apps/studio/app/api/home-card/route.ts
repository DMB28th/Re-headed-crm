import { NextResponse } from "next/server";
import { HomeCardConfig, summarizeCustomFilters, type CustomList } from "@cardstack/core";
import { scopeViewExposuresForUser } from "@cardstack/config-store";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

export interface ExposedViewInfo {
  viewId: string;
  object: string;
  name: string;
  filterSummary: string;
  /** Present when the entry is a Cardstack custom list (drill-in runs its filters). */
  custom?: CustomList;
}

export async function GET(req: Request) {
  try {
    const user = getUserContextFromRequest(req);
    const { tenantId } = user;
    const store = await getStore();
    const adapter = await getAdapter(tenantId);
    const homeCard = await store.getHomeCard(tenantId);
    const connection = await store.getConnection(tenantId);
    const connectedUser =
      connection.status === "connected" ? await adapter.getConnectedUser().catch(() => null) : null;

    // Exposed views across EVERY published object (the home card is not deals-only).
    const objects = await store.listConfiguredObjects(tenantId);
    const exposedViews: ExposedViewInfo[] = [];
    for (const object of objects) {
      const config = await store.getViewExposuresConfig(tenantId, object);
      const scoped = config ? scopeViewExposuresForUser(config, user) : null;
      const exposures = scoped?.views.filter((v) => v.exposed) ?? [];
      // A CRM that can't list views (or is missing a scope) must not sink the
      // whole builder — custom lists still resolve without it.
      const savedViews = await adapter.listSavedViews(object).catch(() => []);
      const customs = new Map((scoped?.customLists ?? []).map((c) => [c.id, c]));
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
      currentUser: user,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const config = HomeCardConfig.parse(await req.json());
    if (config.tenantId !== tenantId) {
      return NextResponse.json({ error: "tenant mismatch" }, { status: 400 });
    }
    const published = await (await getStore()).publishHomeCard(config);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
