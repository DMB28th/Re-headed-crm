import { NextResponse } from "next/server";
import { getStore } from "../../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../../lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const published = await (await getStore()).publish(tenantId, object);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
