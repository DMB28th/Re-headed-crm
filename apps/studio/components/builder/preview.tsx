"use client";
/**
 * Live preview (2a right rail): renders the REAL RecordCard component against
 * SERVER-assembled payloads (/api/preview) — the exact codepath the MCP
 * server uses, against the tenant's actual connection. Mock portal: writes
 * are simulated server-side. Live CRM: the preview is read-only (writes are
 * disabled at the payload level; a builder must never mutate production).
 * Collapsible so the canvas can take the full width.
 */
import { useEffect, useMemo, useState } from "react";
import type { LayoutConfig, RecordCardPayload } from "@cardstack/core";
import { RecordCard, type WidgetHost, type WidgetHostResult } from "@cardstack/widgets/react";
import "@cardstack/widgets/styles/theme.css";
import "@cardstack/widgets/styles/record-card.css";

async function previewCall(body: Record<string, unknown>): Promise<{
  payload?: unknown;
  text?: string;
  error?: string;
  live?: boolean;
}> {
  const res = await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { payload?: unknown; text?: string; error?: string; live?: boolean };
}

export function Preview({ config }: { config: LayoutConfig }) {
  const [payload, setPayload] = useState<RecordCardPayload | null>(null);
  const [payloadKey, setPayloadKey] = useState(0);
  const [live, setLive] = useState(false);
  const [width, setWidth] = useState<680 | 380>(680);
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modelContext, setModelContext] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const configJson = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewCall({
        kind: "record",
        object: config.object,
        config: JSON.parse(configJson),
      });
      if (cancelled) return;
      if (result.error) {
        setBuildError(result.error);
        return;
      }
      setPayload(result.payload as RecordCardPayload);
      setLive(!!result.live);
      setPayloadKey((k) => k + 1);
      setBuildError(null);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configJson]);

  const host: WidgetHost = useMemo(
    () => ({
      updateModelContext: (text) => setModelContext(text),
      callTool: async (name, args): Promise<WidgetHostResult> => {
        if (name === "crm_get_related") {
          const result = await previewCall({
            kind: "related",
            object: config.object,
            config: JSON.parse(configJson),
            recordId: args.recordId,
            relationship: args.relationship,
            limit: args.limit,
          });
          if (result.error) return { isError: true, content: [{ type: "text", text: result.error }] };
          return { structuredContent: result.payload as Record<string, unknown> };
        }
        if (name === "crm_get_record") {
          const result = await previewCall({
            kind: "record",
            object: config.object,
            config: JSON.parse(configJson),
            recordId: args.id,
          });
          if (result.error) return { isError: true, content: [{ type: "text", text: result.error }] };
          return { structuredContent: result.payload as Record<string, unknown> };
        }
        if (name === "crm_update_record") {
          const result = await previewCall({
            kind: "write",
            object: config.object,
            config: JSON.parse(configJson),
            recordId: args.id,
            patch: args.patch,
          });
          if (result.error) return { isError: true, content: [{ type: "text", text: result.error }] };
          return {
            content: result.text ? [{ type: "text", text: result.text }] : [],
            structuredContent: result.payload as Record<string, unknown>,
          };
        }
        return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configJson],
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
        <span className="st-section-label">
          Live preview · real widget{live ? " · live data" : ""}
        </span>
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
          {live
            ? "Previewing against your LIVE portal (read-only — preview writes are disabled; test writes from chat)."
            : "Drafts preview here against sample data; reps keep seeing the published version until you publish. Preview writes are simulated."}
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
