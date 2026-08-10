/** Publishes the staged home card — the only step reps ever see (design 8a). */
import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

export async function POST(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const published = await (await getStore()).publishHomeCard(tenantId);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
