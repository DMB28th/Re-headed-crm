import { NextResponse } from "next/server";
import { getAdapter, getStore } from "../../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../../lib/auth";
import { generateStarterLayout } from "../../../../../lib/starter-layout";

type Params = { params: Promise<{ object: string }> };

/**
 * Rebuild the DRAFT from the connected portal's live fields (design 2c's
 * auto-generation, re-runnable). The published revision is untouched — this
 * replaces the draft only; publish stays an explicit act.
 */
export async function POST(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const store = await getStore();
    const connection = await store.getConnection(tenantId);
    const describe = await (await getAdapter(tenantId)).describeObject(object);
    const starter = generateStarterLayout(tenantId, describe, connection.crm);
    // Governance survives regeneration: the denylist and write policy are the
    // admin's rules about the CRM, not part of the field arrangement.
    const existing = await store.getLayoutRecord(tenantId, object);
    const permissions = (existing.draft ?? existing.published)?.permissions;
    await store.saveDraft(permissions ? { ...starter, permissions } : starter);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
