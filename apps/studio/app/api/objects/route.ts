import { NextResponse } from "next/server";
import { HubSpotAdapter } from "@cardstack/crm-adapters";
import { getAdapter, getStore, requireTenantId } from "../../../lib/backend";
import { generateStarterLayout } from "../../../lib/starter-layout";

/** Objects panel data: what's configured (draft or published) vs addable. */
export async function GET() {
  const TENANT_ID = await requireTenantId();
  const store = await getStore();
  const adapter = await getAdapter();
  const connection = await store.getConnection(TENANT_ID);
  // Redact: credentials never leave the server (hard rule 3).
  const { credentials, ...connectionSafe } = connection;
  const redacted = { ...connectionSafe, live: !!credentials && Object.keys(credentials).length > 0 };
  if (connection.status !== "connected") {
    return NextResponse.json({
      connection: redacted,
      objects: [],
      available: [],
      customObjectsBlocked: null,
    });
  }
  const crmObjects = await adapter.listObjects();
  // Set by listObjects when the schemas read 403'd — the UI must say so
  // instead of claiming every object is configured.
  const customObjectsBlocked =
    adapter instanceof HubSpotAdapter ? adapter.customObjectsBlocked : null;
  const objects: { api: string; labelPlural: string; draft: boolean; publishedRevision: number | null }[] = [];
  const available: { api: string; labelPlural: string }[] = [];
  for (const summary of crmObjects) {
    const record = await store.getLayoutRecord(TENANT_ID, summary.api);
    if (record.draft || record.published) {
      objects.push({
        api: summary.api,
        labelPlural: summary.labelPlural,
        draft: !!record.draft,
        publishedRevision: record.published?.revision ?? null,
      });
    } else {
      available.push({ api: summary.api, labelPlural: summary.labelPlural });
    }
  }
  return NextResponse.json({ connection: redacted, objects, available, customObjectsBlocked });
}

/** Add an object: generate a starter DRAFT layout from describe (3c). */
export async function POST(req: Request) {
  const TENANT_ID = await requireTenantId();
  try {
    const { object } = (await req.json()) as { object?: string };
    if (!object) return NextResponse.json({ error: "object required" }, { status: 400 });
    const store = await getStore();
    const record = await store.getLayoutRecord(TENANT_ID, object);
    if (record.draft || record.published) {
      return NextResponse.json({ error: `${object} is already configured` }, { status: 409 });
    }
    const connection = await store.getConnection(TENANT_ID);
    const describe = await (await getAdapter()).describeObject(object);
    await store.saveDraft(generateStarterLayout(TENANT_ID, describe, connection.crm));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
