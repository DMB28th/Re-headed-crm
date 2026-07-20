import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

type Params = { params: Promise<{ object: string }> };

/**
 * DELETE /api/objects/[object] — remove an object's Cardstack config (layout,
 * lists, publish history). The object and its records in the CRM are untouched;
 * it returns to "available to add".
 */
export async function DELETE(req: Request, { params }: Params) {
  const { object } = await params;
  try {
    const { tenantId } = getUserContextFromRequest(req);
    await (await getStore()).removeObject(tenantId, object);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
