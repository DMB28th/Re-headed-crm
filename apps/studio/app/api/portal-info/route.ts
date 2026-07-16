import { NextResponse } from "next/server";
import type { PortalInfo } from "@cardstack/crm-adapters";
import { getAdapter, getStore, requireTenantId } from "../../../lib/backend";

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
export async function GET() {
  const TENANT_ID = await requireTenantId();
  const store = await getStore();
  const connection = await store.getConnection(TENANT_ID);
  if (connection.status !== "connected") {
    return NextResponse.json(UNKNOWN);
  }
  const info = await (await getAdapter()).getPortalInfo().catch(() => UNKNOWN);
  return NextResponse.json(info);
}
