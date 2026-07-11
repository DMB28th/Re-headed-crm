"use client";
/**
 * Live preview (2a right rail): renders the REAL RecordCard component from
 * packages/widgets against the in-browser mock adapter — the exact assembly
 * codepath the MCP server uses (core/assemble.ts). Writes are simulated
 * against the mock portal, including real validation-rule behavior.
 */
import { useEffect, useMemo, useState } from "react";
import {
  buildRecordCardPayload,
  parseLayoutConfig,
  type CrmFieldValue,
  type FieldWriteResult,
  type LayoutConfig,
  type RecordCardPayload,
  type WriteReceiptPayload,
} from "@cardstack/core";
import { CrmValidationError, MockCrmAdapter } from "@cardstack/crm-adapters";
import { RecordCard, type WidgetHost } from "@cardstack/widgets/react";
import "@cardstack/widgets/styles/theme.css";
import "@cardstack/widgets/styles/record-card.css";

const PREVIEW_RECORD_ID = "d-001";

export function Preview({ config }: { config: LayoutConfig }) {
  const adapter = useMemo(() => new MockCrmAdapter(), []);
  const [payload, setPayload] = useState<RecordCardPayload | null>(null);
  const [payloadKey, setPayloadKey] = useState(0);
  const [width, setWidth] = useState<680 | 380>(680);
  const [dark, setDark] = useState(false);
  const [modelContext, setModelContext] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const configJson = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const parsed = parseLayoutConfig(JSON.parse(configJson));
        const record = await adapter.getRecord(parsed.object, PREVIEW_RECORD_ID, []);
        const built = await buildRecordCardPayload({ source: adapter, config: parsed, record });
        if (!cancelled) {
          setPayload(built);
          setPayloadKey((k) => k + 1);
          setBuildError(null);
        }
      } catch (error) {
        if (!cancelled) setBuildError(String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configJson, adapter]);

  const host: WidgetHost = useMemo(
    () => ({
      callTool: async (name, args) => {
        const parsed = parseLayoutConfig(JSON.parse(configJson));
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
        if (name === "crm_update_record") {
          // Simulated write against the in-browser mock portal — real per-field
          // validation, nothing leaves the page.
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
            writtenAs: "Dan K. (preview)",
            timestamp: new Date().toISOString(),
            record: fresh,
            provenance: payload?.provenance ?? {
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
      updateModelContext: (text) => setModelContext(text),
    }),
    [configJson, adapter, payload?.provenance],
  );

  return (
    <aside className="w-[396px] shrink-0 overflow-y-auto">
      <div className="mb-2 flex items-center justify-between">
        <span className="st-section-label">Live preview · real widget</span>
        <span className="flex gap-1">
          {([680, 380] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={`rounded-[7px] border px-2 py-0.5 text-[11px] ${
                width === w ? "border-accent bg-accent text-white" : "border-line text-ink-55"
              }`}
            >
              {w}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className={`rounded-[7px] border px-2 py-0.5 text-[11px] ${
              dark ? "border-accent bg-accent text-white" : "border-line text-ink-55"
            }`}
          >
            {dark ? "Dark" : "Light"}
          </button>
        </span>
      </div>

      <div
        className={dark ? "dark" : ""}
        style={{
          background: dark ? "#262624" : "#f4f3f1",
          borderRadius: 12,
          padding: 14,
          overflow: "auto",
        }}
      >
        <div style={{ width, maxWidth: "100%", margin: "0 auto" }}>
          {buildError && (
            <div className="rounded-[10px] bg-drift p-3 text-[11.5px] text-drift-ink">{buildError}</div>
          )}
          {payload && !buildError && (
            <RecordCard
              key={payloadKey}
              payload={payload}
              setPayload={setPayload}
              locale="en-US"
              host={host}
            />
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-ink-45">
        <div>
          Drafts preview here against sample data; reps keep seeing the published version until
          you publish. Preview writes are simulated.
        </div>
        {modelContext && (
          <div className="rounded-[8px] bg-crmmeta p-2 text-crmmeta-ink">
            <strong>updateModelContext →</strong> {modelContext}
          </div>
        )}
      </div>
    </aside>
  );
}
