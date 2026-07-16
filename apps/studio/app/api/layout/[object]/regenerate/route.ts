import { NextResponse } from "next/server";
import { getAdapter, getStore, requireTenantId } from "../../../../../lib/backend";
import { generateStarterLayout } from "../../../../../lib/starter-layout";

type Params = { params: Promise<{ object: string }> };

/**
 * Rebuild the DRAFT from the connected portal's live fields (design 2c's
 * auto-generation, re-runnable). The published revision is untouched — this
 * replaces the draft only; publish stays an explicit act.
 */
export async function POST(_req: Request, { params }: Params) {
  const TENANT_ID = await requireTenantId();
  const { object } = await params;
  try {
    const store = await getStore();
    const connection = await store.getConnection(TENANT_ID);
    const describe = await (await getAdapter()).describeObject(object);
    const starter = generateStarterLayout(TENANT_ID, describe, connection.crm);
    // Governance survives regeneration: the denylist and write policy are the
    // admin's rules about the CRM, not part of the field arrangement.
    const existing = await store.getLayoutRecord(TENANT_ID, object);
    const permissions = (existing.draft ?? existing.published)?.permissions;
    await store.saveDraft(permissions ? { ...starter, permissions } : starter);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
