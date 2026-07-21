import { NextResponse } from "next/server";
import type { UserConnectionState } from "@cardstack/config-store";
import { getUserContextFromRequest } from "../../../../lib/auth";
import { getStore } from "../../../../lib/backend";

function redact(connection: UserConnectionState | undefined): Record<string, unknown> {
  if (!connection) return { status: "disconnected", crm: "salesforce", live: false };
  const { credentials, ...rest } = connection;
  return { ...rest, live: !!credentials && Object.keys(credentials).length > 0 };
}

export async function GET(req: Request) {
  const { tenantId, userId } = getUserContextFromRequest(req);
  const store = await getStore();
  const [workspace, userConnection] = await Promise.all([
    store.getConnection(tenantId),
    store.getUserConnection(tenantId, userId, "salesforce"),
  ]);
  return NextResponse.json({
    workspace: {
      crm: workspace.crm,
      status: workspace.status,
      label: workspace.label,
      requiresUserAuth:
        workspace.status === "connected" &&
        workspace.crm === "salesforce" &&
        (workspace.credentials?.authType === "oauth" || !!workspace.credentials?.refreshToken),
    },
    connection: redact(userConnection),
    connectedUser: userConnection?.connectedUser ?? null,
  });
}

export async function POST(req: Request) {
  const { tenantId, userId } = getUserContextFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as { action?: "disconnect" };
  if (body.action !== "disconnect") {
    return NextResponse.json({ error: "action must be disconnect" }, { status: 400 });
  }
  await (await getStore()).deleteUserConnection(tenantId, userId, "salesforce");
  return NextResponse.json({ connection: redact(undefined), connectedUser: null });
}
