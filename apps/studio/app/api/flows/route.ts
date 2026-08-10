import { NextResponse } from "next/server";
import {
  FlowRenderModeConfig,
  analyzeFlowSupport,
  quickActionSupport,
  type FlowSupportReport,
} from "@cardstack/core";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

/**
 * Flows admin (redesigned 2026-07-26 — deviation from the original 10c/11d
 * render-mode-only page, per product direction): list the org's EXISTING
 * screen flows, show what the in-chat interpreter can do with each
 * (full / partial / handoff renderability from static analysis), where each
 * is exposed (which object cards), and the discovered input variables with
 * their automatic record mappings. Exposure itself is written by
 * /api/flows/assign.
 */

const DEFINITION_FETCH_CAP = 40; // guardrail — orgs can hold hundreds of flows

export interface FlowAdminRow {
  api: string;
  label: string;
  screens: number;
  writesSummary: string;
  /** null = definition unreadable (installed/managed flow) → handoff-only. */
  support: FlowSupportReport | null;
  inputVariables: { name: string; dataType: string }[];
  assignedTo: { object: string; label: string }[];
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const store = await getStore();
    const connection = await store.getConnection(tenantId);
    if (connection.status !== "connected") {
      return NextResponse.json({
        flows: [],
        modes: [],
        objects: [],
        connection: { status: connection.status, crm: connection.crm, label: connection.label },
      });
    }

    const adapter = await getAdapter(tenantId);
    const [flows, records, objects, screenRecords] = await Promise.all([
      adapter.listFlows().catch(() => []),
      store.listFlowRenderModeRecords(tenantId),
      store.listConfiguredObjects(tenantId),
      store.listCustomScreenRecords(tenantId),
    ]);

    // The editor shows the DRAFT policy where one is staged; reps keep getting
    // the published one until Review & publish.
    const modes = records.flatMap((record) =>
      record.draft ? [record.draft] : record.published ? [record.published] : [],
    );
    const staged = records.filter((record) => record.draft).map((record) => record.flowApiName);
    // Custom screens live HERE now — a screen only means something as a screen
    // of a flow, so the flow is where you find and build one.
    const screens = screenRecords.map((record) => {
      const config = record.draft ?? record.published;
      return {
        id: record.id,
        label: config?.label ?? record.id,
        flowApiName: config?.flowApiName ?? null,
        replacesComponent: config?.replacesComponent ?? null,
        hasDraft: record.draft !== null,
        publishedRevision: record.published?.revision ?? null,
      };
    });

    // Where is each flow / quick action already exposed? Draft wins over
    // published so the page reflects what the admin last did, even pre-publish.
    const assignments = new Map<string, { object: string; label: string }[]>();
    const exposedQuickActions = new Map<string, Set<string>>(); // object → action apis
    for (const object of objects) {
      const record = await store.getLayoutRecord(tenantId, object).catch(() => null);
      const config = record?.draft ?? record?.published;
      for (const action of config?.recordCard.actions ?? []) {
        if (action.enabled === false) continue;
        if (action.type === "screen_flow") {
          const list = assignments.get(action.flowApiName) ?? [];
          list.push({ object, label: action.label });
          assignments.set(action.flowApiName, list);
        }
        if (action.type === "quick_action") {
          const set = exposedQuickActions.get(object) ?? new Set<string>();
          set.add(action.actionApiName);
          exposedQuickActions.set(object, set);
        }
      }
    }

    // Quick actions per configured object (Create/Update/LogACall render in chat).
    const quickActions = await Promise.all(
      objects.map(async (object) => {
        const actions = adapter.listQuickActions
          ? await adapter.listQuickActions(object).catch(() => [])
          : [];
        return {
          object,
          actions: actions.map((a) => ({
            ...a,
            support: quickActionSupport(a.type),
            exposed: exposedQuickActions.get(object)?.has(a.api) ?? false,
          })),
        };
      }),
    );

    const rows: FlowAdminRow[] = await Promise.all(
      flows.slice(0, DEFINITION_FETCH_CAP).map(async (flow) => {
        const def = adapter.getFlowDefinition
          ? await adapter.getFlowDefinition(flow.api).catch(() => null)
          : null;
        if (!def) {
          return {
            api: flow.api,
            label: flow.label,
            screens: flow.screens,
            writesSummary: flow.writesSummary,
            support: null,
            inputVariables: [],
            assignedTo: assignments.get(flow.api) ?? [],
          };
        }
        const report = analyzeFlowSupport(def);
        return {
          api: flow.api,
          label: def.label ?? flow.label,
          screens: report.screenCount,
          writesSummary: flow.writesSummary,
          support: report,
          inputVariables: (def.variables ?? [])
            .filter((v) => v.isInput && !v.isCollection)
            .map((v) => ({ name: v.name, dataType: v.dataType ?? "String" })),
          assignedTo: assignments.get(flow.api) ?? [],
        };
      }),
    );

    const { credentials, ...connectionSafe } = connection;
    return NextResponse.json({
      flows: rows,
      modes,
      objects,
      quickActions,
      staged,
      screens,
      connection: {
        ...connectionSafe,
        live: !!credentials && Object.keys(credentials).length > 0,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const body = (await req.json()) as {
      flowApiName?: string;
      mode?: string;
      active?: boolean;
    };
    const config = FlowRenderModeConfig.parse({
      version: 1,
      tenantId,
      flowApiName: body.flowApiName,
      // Off unless the caller says otherwise — a synced flow is a candidate,
      // not an offering, and crm_flow_start enforces the same rule.
      active: body.active ?? false,
      mode: body.mode ?? "auto",
      fallback: "open-in-salesforce",
    });
    await (await getStore()).setFlowRenderMode(config);
    // Staged, NOT live — a render-policy change goes through Review & publish.
    return NextResponse.json({ mode: config, staged: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
