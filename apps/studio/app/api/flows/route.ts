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
    const modes = await store.getFlowRenderModes(tenantId);
    const { credentials, ...connectionSafe } = connection;
    return NextResponse.json({
      flows,
      modes,
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
    const body = (await req.json()) as { flowApiName?: string; mode?: string };
    const config = FlowRenderModeConfig.parse({
      version: 1,
      tenantId,
      flowApiName: body.flowApiName,
      mode: body.mode ?? "auto",
      fallback: "open-in-salesforce",
      updatedAt: new Date().toISOString(),
    });
    await (await getStore()).setFlowRenderMode(config);
    return NextResponse.json({ mode: config });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
