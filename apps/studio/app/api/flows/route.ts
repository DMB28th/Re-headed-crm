import { NextResponse } from "next/server";
import { FlowRenderModeConfig } from "@cardstack/core";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

export async function GET(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const store = await getStore();
    const connection = await store.getConnection(tenantId);
    if (connection.status !== "connected") {
      return NextResponse.json({
        flows: [],
        modes: [],
        connection: { status: connection.status, crm: connection.crm, label: connection.label },
      });
    }

    const adapter = await getAdapter(tenantId);
    const flows = await adapter.listFlows().catch(() => []);
    // The editor shows the DRAFT policy where one is staged; reps keep getting
    // the published one until Review & publish.
    const records = await store.listFlowRenderModeRecords(tenantId);
    const modes = records.flatMap((record) =>
      record.draft ? [record.draft] : record.published ? [record.published] : [],
    );
    const staged = records.filter((record) => record.draft).map((record) => record.flowApiName);
    // Custom screens live HERE now — a screen only means something as a screen
    // of a flow, so the flow is where you find and build one.
    const screenRecords = await store.listCustomScreenRecords(tenantId);
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
    const { credentials, ...connectionSafe } = connection;
    return NextResponse.json({
      flows,
      modes,
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
    const { tenantId } = getUserContextFromRequest(req);
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
      updatedAt: new Date().toISOString(),
    });
    await (await getStore()).setFlowRenderMode(config);
    // Staged, NOT live — a render-policy change goes through Review & publish.
    return NextResponse.json({ mode: config, staged: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
