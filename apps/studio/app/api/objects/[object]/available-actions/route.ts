import { NextResponse } from "next/server";
import {
  buildActionCatalog,
  type AvailableActionsResponse,
  type FlowCatalogInput,
} from "../../../../../lib/action-catalog";
import { getAdapter, getStore } from "../../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../../lib/auth";

export type { DiscoveredAction, ActionSource, AvailableActionsResponse } from "../../../../../lib/action-catalog";

type Params = { params: Promise<{ object: string }> };

const DEFINITION_FETCH_CAP = 40; // guardrail — orgs can hold hundreds of flows

/**
 * GET /api/objects/[object]/available-actions — what actions are AVAILABLE
 * to add to this object's action row (design 3a's actions editor): the two
 * builtin kinds plus whatever the connected CRM exposes (quick actions,
 * screen flows). Shaping lives in lib/action-catalog.ts; this route only
 * fetches and degrades.
 */
export async function GET(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const store = await getStore();

    const record = await store.getLayoutRecord(tenantId, object);
    // Draft wins over published so the picker reflects what the admin last
    // did, even pre-publish. A disabled action still counts as configured.
    const configured = (record.draft ?? record.published)?.recordCard.actions ?? [];

    const connection = await store.getConnection(tenantId);
    if (connection.status !== "connected") {
      const catalog = buildActionCatalog({
        configured,
        objects: [],
        quickActions: null,
        flows: null,
      });
      for (const source of catalog.sources) {
        if (source.kind !== "builtin") source.unavailable = "Not connected to a CRM.";
      }
      return NextResponse.json(catalog satisfies AvailableActionsResponse);
    }

    const adapter = await getAdapter(tenantId);
    const [objects, quickActions, flowSummaries] = await Promise.all([
      adapter.listObjects().catch(() => []),
      adapter.listQuickActions ? adapter.listQuickActions(object).catch(() => null) : Promise.resolve([]),
      adapter.listFlows().catch(() => null),
    ]);

    // null = the CRM call itself failed (unavailable); [] = the org genuinely
    // has no flows (a legitimate empty result) — kept distinct all the way
    // through so the picker can tell the two apart.
    const flows: FlowCatalogInput[] | null =
      flowSummaries === null
        ? null
        : await Promise.all(
            flowSummaries.slice(0, DEFINITION_FETCH_CAP).map(async (flow) => {
              const def = adapter.getFlowDefinition
                ? await adapter.getFlowDefinition(flow.api).catch(() => null)
                : null;
              return {
                api: flow.api,
                label: def?.label ?? flow.label,
                inputVariables: (def?.variables ?? [])
                  .filter((v) => v.isInput)
                  .map((v) => ({
                    name: v.name,
                    dataType: v.dataType ?? "String",
                    isCollection: !!v.isCollection,
                  })),
              };
            }),
          );

    const catalog = buildActionCatalog({
      configured,
      objects: objects.map((o) => o.api),
      quickActions,
      flows,
    });
    return NextResponse.json(catalog satisfies AvailableActionsResponse);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
