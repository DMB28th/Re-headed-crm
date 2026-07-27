import { NextResponse } from "next/server";
import { getUserContextFromRequest } from "../../../lib/auth";
import { getStore } from "../../../lib/backend";

/**
 * Every user authenticated to this workspace (admin visibility): the per-user
 * CRM connections written by Studio's connect flow AND by the MCP server's
 * chat sign-in (per-user OAuth). Credentials are redacted — only a `live`
 * flag leaves the server.
 */
export async function GET(req: Request) {
  const { tenantId } = await getUserContextFromRequest(req);
  const store = await getStore();
  const users = await store.listUserConnections(tenantId);
  return NextResponse.json({
    users: users.map(({ credentials, ...rest }) => ({
      ...rest,
      live: !!credentials && Object.keys(credentials).length > 0,
    })),
  });
}
