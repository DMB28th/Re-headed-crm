/**
 * In-browser WidgetHost over the mock adapter — the builder previews' host.
 * Writes are simulated against the mock portal (real per-field validation,
 * nothing leaves the page); reads run the same assembly codepath the MCP
 * server uses (core/assemble.ts).
 */
import {
  buildRecordCardPayload,
  parseLayoutConfig,
  type CrmFieldValue,
  type FieldWriteResult,
  type RecordCardPayload,
  type WriteReceiptPayload,
} from "@cardstack/core";
import { CrmValidationError, MockCrmAdapter } from "@cardstack/crm-adapters";
import type { WidgetHost } from "@cardstack/widgets/react";

export function createPreviewHost(opts: {
  adapter: MockCrmAdapter;
  getConfigJson: () => string;
  getProvenance: () => RecordCardPayload["provenance"] | undefined;
  onModelContext?: (text: string) => void;
  onFollowup?: (text: string) => void;
}): WidgetHost {
  const { adapter, getConfigJson, getProvenance, onModelContext, onFollowup } = opts;
  return {
    ...(onFollowup ? { sendFollowup: onFollowup } : {}),
    updateModelContext: (text) => onModelContext?.(text),
    callTool: async (name, args) => {
      const parsed = parseLayoutConfig(JSON.parse(getConfigJson()));
      if (name === "crm_get_related") {
        const rel = parsed.recordCard.relatedLists.find(
          (r) => r.relationship === (args.relationship as string),
        );
        if (!rel) return { isError: true, content: [{ type: "text", text: "not configured" }] };
        const page = await adapter.getRelated(args.recordId as string, {
          ...rel,
          limit: (args.limit as number) ?? rel.limit,
        });
        return { structuredContent: { page } };
      }
      if (name === "crm_get_record") {
        const record = await adapter.getRecord(parsed.object, args.id as string, []);
        const built = await buildRecordCardPayload({ source: adapter, config: parsed, record });
        return { structuredContent: built };
      }
      if (name === "crm_complete_task") {
        const task = await adapter.completeTask(args.id as string);
        return {
          content: [
            { type: "text", text: `Preview: completed "${task.subject}" (simulated — mock portal only).` },
          ],
          structuredContent: { task } as unknown as Record<string, unknown>,
        };
      }
      if (name === "crm_update_record") {
        const patch = args.patch as Record<string, CrmFieldValue>;
        const id = args.id as string;
        const before = await adapter.getRecord(parsed.object, id, Object.keys(patch));
        const describe = await adapter.describeObject(parsed.object);
        const results: FieldWriteResult[] = [];
        for (const [field, value] of Object.entries(patch)) {
          const label = describe.fields.find((f) => f.api === field)?.label ?? field;
          try {
            await adapter.updateRecord(parsed.object, id, { [field]: value });
            results.push({ field, label, before: before.fields[field] ?? null, after: value, ok: true });
          } catch (error) {
            results.push({
              field,
              label,
              before: before.fields[field] ?? null,
              after: before.fields[field] ?? null,
              ok: false,
              ...(error instanceof CrmValidationError ? { error: error.message } : { error: String(error) }),
            });
          }
        }
        const saved = results.filter((r) => r.ok);
        const fresh = await adapter.getRecord(parsed.object, id, []);
        const receipt: WriteReceiptPayload = {
          kind: "write-receipt",
          object: parsed.object,
          recordId: id,
          recordName: String(fresh.fields[parsed.recordCard.header.title] ?? id),
          results,
          savedCount: saved.length,
          failedCount: results.length - saved.length,
          writtenAs: `${await adapter.getConnectedUser()} (preview)`,
          timestamp: new Date().toISOString(),
          record: fresh,
          provenance: getProvenance() ?? {
            crm: parsed.crm,
            crmLabel: parsed.crm === "hubspot" ? "HubSpot" : "Salesforce",
            layoutRevision: parsed.revision,
          },
        };
        return {
          content: [
            {
              type: "text",
              text: `Preview write: ${saved.length}/${results.length} fields saved (simulated — mock portal only).`,
            },
          ],
          structuredContent: receipt,
        };
      }
      return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
    },
  };
}
