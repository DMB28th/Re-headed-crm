import { NextResponse } from "next/server";
import { CustomScreenConfig } from "@cardstack/core";
import { getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ screen: string }> },
) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const { screen } = await params;
    const body = (await req.json()) as unknown;
    const draft = CustomScreenConfig.parse({
      ...(body as Record<string, unknown>),
      tenantId,
      id: screen,
      status: "draft",
      updatedAt: new Date().toISOString(),
    });
    await (await getStore()).saveCustomScreenDraft(draft);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ screen: string }> },
) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const { screen } = await params;
    const published = await (await getStore()).publishCustomScreen(tenantId, screen);
    return NextResponse.json({ published });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
