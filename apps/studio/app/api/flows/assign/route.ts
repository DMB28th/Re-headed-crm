import { NextResponse } from "next/server";
import { parseLayoutConfig, type ActionInputMappings, type CardAction } from "@cardstack/core";
import { getAdapter, getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";

/**
 * Expose (or withdraw) an org screen flow on an object's record card.
 *
 * Enabling writes a `screen_flow` action onto the object's layout and
 * publishes it, with input variables mapped AUTOMATICALLY by convention:
 *  - `recordId` is never mapped — the runtime always passes the record's id;
 *  - an input variable whose name matches a field API name on the object
 *    maps to that field (`source: "field"`);
 *  - everything else stays unmapped — the flow's own screens collect it.
 * Disabling removes the action and publishes.
 *
 * The publish is immediate (no separate diff step) because exposing a flow IS
 * the admin's intent and the layout history keeps every revision rollbackable.
 */
export async function POST(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const body = (await req.json()) as {
      flowApiName?: string;
      object?: string;
      enabled?: boolean;
    };
    const flowApiName = body.flowApiName?.trim();
    const object = body.object?.trim();
    if (!flowApiName || !object || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "flowApiName, object, and enabled are required." },
        { status: 400 },
      );
    }

    const store = await getStore();
    const record = await store.getLayoutRecord(tenantId, object);
    const base = record.draft ?? record.published;
    if (!base) {
      return NextResponse.json(
        { error: `No card is configured for ${object} — build its layout first.` },
        { status: 404 },
      );
    }

    let actions: CardAction[] = base.recordCard.actions.filter(
      (a) => !(a.type === "screen_flow" && a.flowApiName === flowApiName),
    );
    let mappedInputs: string[] = [];

    if (body.enabled) {
      const adapter = await getAdapter(tenantId);
      const def = adapter.getFlowDefinition
        ? await adapter.getFlowDefinition(flowApiName).catch(() => null)
        : null;
      const describe = await adapter.describeObject(object).catch(() => null);
      const fieldByLower = new Map(
        (describe?.fields ?? []).map((f) => [f.api.toLowerCase(), f.api]),
      );
      const inputs: ActionInputMappings = {};
      for (const variable of def?.variables ?? []) {
        if (!variable.isInput || variable.isCollection) continue;
        const lower = variable.name.toLowerCase();
        if (lower === "recordid") continue; // context recordId flows automatically
        const fieldApi = fieldByLower.get(lower);
        if (fieldApi) inputs[variable.name] = { source: "field", field: fieldApi };
      }
      mappedInputs = Object.keys(inputs);
      actions = [
        ...actions,
        {
          type: "screen_flow",
          flowApiName,
          label: def?.label ?? flowApiName,
          embed: "auto",
          inputs,
        },
      ];
    }

    const draft = parseLayoutConfig({
      ...base,
      recordCard: { ...base.recordCard, actions },
    });
    await store.saveDraft(draft);
    const published = await store.publish(tenantId, object);
    return NextResponse.json({
      ok: true,
      object,
      enabled: body.enabled,
      revision: published.revision,
      mappedInputs,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
