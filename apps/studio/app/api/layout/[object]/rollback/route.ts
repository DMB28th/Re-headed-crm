import { NextResponse } from "next/server";
import { getStore } from "../../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../../lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const { revision } = (await req.json()) as { revision: number };
    const published = await (await getStore()).rollback(tenantId, object, revision);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
