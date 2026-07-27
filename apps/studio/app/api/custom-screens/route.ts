import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CustomScreenConfig, DEFAULT_CUSTOM_SCREEN_SOURCE } from "@cardstack/core";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

function makeId(): string {
  // Random suffix so two creates in the same millisecond can't collide on the
  // (tenant, screen_id) draft upsert key. UUID prefix is lowercase hex → matches
  // the cs-[a-z0-9-]+ id schema.
  return `cs-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const store = await getStore();
    const records = await store.listCustomScreenRecords(tenantId);
    const connection = await store.getConnection(tenantId);
    const flows =
      connection.status === "connected" ? await (await getAdapter(tenantId)).listFlows().catch(() => []) : [];
    return NextResponse.json({ records, flows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const body = (await req.json()) as {
      label?: string;
      flowApiName?: string;
      replacesComponent?: string;
      source?: string;
    };
    const now = new Date().toISOString();
    const draft = CustomScreenConfig.parse({
      version: 1,
      tenantId,
      id: makeId(),
      label: body.label?.trim() || "New custom screen",
      ...(body.flowApiName?.trim() ? { flowApiName: body.flowApiName.trim() } : {}),
      ...(body.replacesComponent?.trim()
        ? { replacesComponent: body.replacesComponent.trim() }
        : {}),
      source: body.source?.trim() || DEFAULT_CUSTOM_SCREEN_SOURCE,
      status: "draft",
      revision: 1,
      updatedAt: now,
    });
    const store = await getStore();
    await store.saveCustomScreenDraft(draft);
    const record = await store.getCustomScreenRecord(tenantId, draft.id);
    return NextResponse.json({ id: draft.id, record });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
