import { NextResponse } from "next/server";
import { getStore, requireTenantId } from "../../../../../lib/backend";

export async function POST(req: Request, { params }: { params: Promise<{ object: string }> }) {
  const TENANT_ID = await requireTenantId();
  const { object } = await params;
  try {
    const { revision } = (await req.json()) as { revision: number };
    const published = await (await getStore()).rollback(TENANT_ID, object, revision);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
