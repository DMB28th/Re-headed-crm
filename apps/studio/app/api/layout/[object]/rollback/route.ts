import { NextResponse } from "next/server";
import { getStore, TENANT_ID } from "../../../../../lib/backend";

export async function POST(req: Request, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  try {
    const { revision } = (await req.json()) as { revision: number };
    const published = await getStore().rollback(TENANT_ID, object, revision);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
