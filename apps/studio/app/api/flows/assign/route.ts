import { NextResponse } from "next/server";
import { parseLayoutConfig, type ActionInputMappings } from "@cardstack/core";
import { getAdapter, getStore } from "../../../../lib/backend";
import { getUserContextFromRequest } from "../../../../lib/auth";
import { planActionAssignment } from "../../../../lib/action-assignment";

/**
 * Expose (or withdraw) an org screen flow or quick action on an object's
 * record card.
 *
 * Enabling writes (or re-enables) an action onto the object's layout, with
 * input variables mapped AUTOMATICALLY by convention:
 *  - `recordId` is never mapped — the runtime always passes the record's id;
 *  - an input variable whose name matches a field API name on the object
 *    maps to that field (`source: "field"`);
 *  - everything else stays unmapped — the flow's own screens collect it.
 * The decision itself — merge-on-enable, preserve-on-disable — lives in the
 * shared `planActionAssignment` (`lib/action-assignment.ts`), the same module
 * the actions editor uses, so the two surfaces can't disagree about what "off"
 * means. Disabling sets `enabled: false` rather than removing the action, so
 * hand-mapped inputs and label survive and the action stays re-enableable.
 *
 * This saves to the DRAFT, not published — matching every other Studio
 * editor. It goes live at the next publish from the builder.
 */
export async function POST(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const body = (await req.json()) as {
      flowApiName?: string;
      object?: string;
      enabled?: boolean;
      /** "screen_flow" (default) or "quick_action". */
      kind?: string;
    };
    const flowApiName = body.flowApiName?.trim();
    const object = body.object?.trim();
    const kind = body.kind === "quick_action" ? "quick_action" : "screen_flow";
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

    // Disabling needs no CRM metadata — skip the adapter round-trip entirely
    // so disabling still works when the org is unreachable.
    let inputs: ActionInputMappings = {};
    let discoveredLabel = flowApiName;
    if (body.enabled && kind === "quick_action") {
      const adapter = await getAdapter(tenantId);
      const describe = adapter.describeQuickAction
        ? await adapter.describeQuickAction(flowApiName).catch(() => null)
        : null;
      discoveredLabel = describe?.label ?? flowApiName;
    } else if (body.enabled) {
      const adapter = await getAdapter(tenantId);
      const def = adapter.getFlowDefinition
        ? await adapter.getFlowDefinition(flowApiName).catch(() => null)
        : null;
      const describe = await adapter.describeObject(object).catch(() => null);
      const fieldByLower = new Map(
        (describe?.fields ?? []).map((f) => [f.api.toLowerCase(), f.api]),
      );
      for (const variable of def?.variables ?? []) {
        if (!variable.isInput || variable.isCollection) continue;
        const lower = variable.name.toLowerCase();
        if (lower === "recordid") continue; // context recordId flows automatically
        const fieldApi = fieldByLower.get(lower);
        if (fieldApi) inputs[variable.name] = { source: "field", field: fieldApi };
      }
      discoveredLabel = def?.label ?? flowApiName;
    }

    const { actions, mappedInputs } = planActionAssignment({
      actions: base.recordCard.actions,
      kind,
      apiName: flowApiName,
      enabled: body.enabled,
      autoMappedInputs: inputs,
      discoveredLabel,
    });

    const draft = parseLayoutConfig({
      ...base,
      recordCard: { ...base.recordCard, actions },
    });
    await store.saveDraft(draft);
    return NextResponse.json({
      ok: true,
      object,
      enabled: body.enabled,
      mappedInputs,
      saved: "draft",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
