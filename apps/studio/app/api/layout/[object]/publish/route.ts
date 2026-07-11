import { NextResponse } from "next/server";
import { getStore, TENANT_ID } from "../../../../../lib/backend";

export async function POST(_req: Request, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  try {
    const published = await (await getStore()).publish(TENANT_ID, object);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
