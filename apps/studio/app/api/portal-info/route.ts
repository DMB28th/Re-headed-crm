import { NextResponse } from "next/server";
import type { PortalInfo } from "@cardstack/crm-adapters";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

const UNKNOWN: PortalInfo = {
  userCount: null,
  portalId: null,
  defaultCurrency: null,
  scopeGaps: [],
};

/**
 * Live-portal facts (user count, portal id, home currency, scope gaps).
 * Nothing here is secret — every null means "unknown", and surfaces must
 * drop the number rather than invent one.
 */
export async function GET(req: Request) {
  const { tenantId } = getUserContextFromRequest(req);
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  if (connection.status !== "connected") {
    return NextResponse.json(UNKNOWN);
  }
  const info = await (await getAdapter(tenantId)).getPortalInfo().catch(() => UNKNOWN);
  return NextResponse.json(info);
}
