"use client";
/**
 * Live preview (2a right rail): renders the REAL RecordCard component from
 * packages/widgets against the in-browser mock adapter — the exact assembly
 * codepath the MCP server uses (core/assemble.ts). Writes are simulated
 * against the mock portal, including real validation-rule behavior.
 * Collapsible so the canvas can take the full width.
 */
import { useEffect, useMemo, useState } from "react";
import {
  buildRecordCardPayload,
  parseLayoutConfig,
  type LayoutConfig,
  type RecordCardPayload,
} from "@cardstack/core";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { RecordCard, type WidgetHost } from "@cardstack/widgets/react";
import { createPreviewHost } from "../../lib/preview-host";
import "@cardstack/widgets/styles/theme.css";
import "@cardstack/widgets/styles/record-card.css";

const PREVIEW_RECORD_ID_BY_OBJECT: Record<string, string> = {
  deals: "d-001",
  contacts: "c-001",
  companies: "co-01",
};

export function Preview({ config }: { config: LayoutConfig }) {
  const adapter = useMemo(() => new MockCrmAdapter(), []);
  const [payload, setPayload] = useState<RecordCardPayload | null>(null);
  const [payloadKey, setPayloadKey] = useState(0);
  const [width, setWidth] = useState<680 | 380>(680);
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modelContext, setModelContext] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const configJson = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const parsed = parseLayoutConfig(JSON.parse(configJson));
        const previewId =
          PREVIEW_RECORD_ID_BY_OBJECT[parsed.object] ??
          (await adapter.search(parsed.object, { limit: 1 })).rows[0]?.id;
        if (!previewId) throw new Error(`No ${parsed.object} records in the mock portal.`);
        const record = await adapter.getRecord(parsed.object, previewId, []);
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
    () =>
      createPreviewHost({
        adapter,
        getConfigJson: () => configJson,
        getProvenance: () => payload?.provenance,
        onModelContext: (text) => setModelContext(text),
      }),
    [configJson, adapter, payload?.provenance],
  );

  if (collapsed) {
    return (
      <aside className="w-[36px] shrink-0">
        <button
          type="button"
          className="st-btn w-full !px-1 py-2"
          title="Expand the live preview"
          onClick={() => setCollapsed(false)}
        >
          ◂
        </button>
        <div className="mt-2 rotate-180 text-center text-[10.5px] tracking-[0.06em] text-ink-45 [writing-mode:vertical-rl]">
          PREVIEW
        </div>
      </aside>
    );
  }

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
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-[7px] border border-line px-2 py-0.5 text-[11px] text-ink-55"
            title="Collapse the preview"
          >
            ▸
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
