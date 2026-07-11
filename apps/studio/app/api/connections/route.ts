import { NextResponse } from "next/server";
import type { ConnectionState } from "@cardstack/config-store";
import { getAdapter, getStore, TENANT_ID } from "../../../lib/backend";

export async function GET() {
  const store = await getStore();
  const connection = await store.getConnection(TENANT_ID);
  const connectedUser =
    connection.status === "connected" ? await getAdapter().getConnectedUser() : null;
  return NextResponse.json({ connection, connectedUser });
}

export async function POST(req: Request) {
  const { action } = (await req.json()) as { action?: string };
  if (action !== "connect" && action !== "disconnect") {
    return NextResponse.json({ error: "action must be connect|disconnect" }, { status: 400 });
  }
  const state: ConnectionState = {
    tenantId: TENANT_ID,
    status: action === "connect" ? "connected" : "disconnected",
    crm: "hubspot",
    label: "mock portal",
    changedAt: new Date().toISOString(),
  };
  await (await getStore()).setConnection(state);
  const connectedUser =
    state.status === "connected" ? await getAdapter().getConnectedUser() : null;
  return NextResponse.json({ connection: state, connectedUser });
}
