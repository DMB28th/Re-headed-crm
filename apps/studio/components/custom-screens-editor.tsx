"use client";
/**
 * Custom screens (design 11a): durable draft/published SDK sources.
 * Guardrail execution and live preview attach to this editor in the next slice.
 */
import { useEffect, useMemo, useState } from "react";
import type { CustomScreenConfig, CustomScreenRecord, FlowSummary } from "@cardstack/core";
import { LoadFailed } from "./load-failed";
import { RuntimePendingBanner } from "./runtime-pending-banner";

type ScreenRecord = CustomScreenRecord & { id: string };

interface ScreensResponse {
  records: ScreenRecord[];
  flows: FlowSummary[];
  error?: string;
}

const CHECKS = [
  "No network, storage, or DOM escape",
  "Writes only through flow.output",
  "Host tokens and dark mode supported",
];

export function CustomScreensEditor() {
  const [records, setRecords] = useState<ScreenRecord[]>([]);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomScreenConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoadError(null);
      try {
        const res = await fetch("/api/custom-screens");
        const json = (await res.json()) as ScreensResponse;
        if (!res.ok || json.error) {
          setLoadError(json.error ?? `Request failed (${res.status}).`);
          return;
        }
        setRecords(json.records);
        setFlows(json.flows);
        setSelectedId((current) => current ?? json.records[0]?.id ?? null);
      } catch (error) {
        setLoadError(String(error));
      }
    })();
  }, [reloadKey]);

  const activeRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );
  const activeConfig = activeRecord?.draft ?? activeRecord?.published ?? null;

  useEffect(() => {
    setDraft(activeConfig ? { ...activeConfig, status: "draft" } : null);
  }, [activeConfig]);

  const updateDraft = (patch: Partial<CustomScreenConfig>) =>
    setDraft((current) => (current ? { ...current, ...patch, status: "draft" } : current));

  const createScreen = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/custom-screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "New custom screen",
          ...(flows[0] ? { flowApiName: flows[0].api } : {}),
        }),
      });
      const json = (await res.json()) as { id?: string; record?: CustomScreenRecord; error?: string };
      if (!res.ok || !json.id || !json.record) {
        setLoadError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      const next = { id: json.id, ...json.record };
      setRecords((current) => [...current, next]);
      setSelectedId(json.id);
    } finally {
      setCreating(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const res = await fetch(`/api/custom-screens/${draft.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = (await res.json()) as { draft?: CustomScreenConfig; error?: string };
    if (!res.ok || !json.draft) {
      setLoadError(json.error ?? `Request failed (${res.status}).`);
      return;
    }
    setRecords((current) =>
      current.map((record) =>
        record.id === draft.id ? { ...record, draft: json.draft! } : record,
      ),
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const publish = async () => {
    if (!draft) return;
    setPublishing(true);
    try {
      // Persist the current editor state first so Publish never ships a stale
      // draft — the source textarea lives in local state until saved.
      const saveRes = await fetch(`/api/custom-screens/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const saveJson = (await saveRes.json()) as { draft?: CustomScreenConfig; error?: string };
      if (!saveRes.ok || !saveJson.draft) {
        setLoadError(saveJson.error ?? `Request failed (${saveRes.status}).`);
        return;
      }
      const res = await fetch(`/api/custom-screens/${draft.id}`, { method: "POST" });
      const json = (await res.json()) as { published?: CustomScreenConfig; error?: string };
      if (!res.ok || !json.published) {
        setLoadError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      setRecords((current) =>
        current.map((record) =>
          record.id === draft.id
            ? {
                ...record,
                draft: null,
                published: json.published!,
                history: record.published ? [...record.history, record.published] : record.history,
              }
            : record,
        ),
      );
    } finally {
      setPublishing(false);
    }
  };

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((key) => key + 1)} />;
  }

  return (
    <div className="flex h-[calc(100vh-48px)] min-h-0 flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold">Custom screens</h1>
          <p className="mt-1 text-[12.5px] text-ink-55">
            Build chat-safe replacements for unsupported flow screens and LWC inputs. Published
            screens are available to the flow render ladder.
          </p>
        </div>
        <button type="button" className="st-btn st-btn--primary" disabled={creating} onClick={createScreen}>
          {creating ? "Creating..." : "+ New custom screen"}
        </button>
      </header>

      <div className="mb-4">
        <RuntimePendingBanner feature="Custom screens" milestone="the M6 screen runtime" />
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="w-[280px] shrink-0 overflow-y-auto">
          <div className="st-card overflow-hidden">
            {records.length === 0 && (
              <div className="px-4 py-5 text-[12.5px] text-ink-55">
                No custom screens yet. Start one when a synced flow has an unsupported screen.
              </div>
            )}
            {records.map((record) => {
              const config = record.draft ?? record.published;
              const active = record.id === selectedId;
              return (
                <button
                  key={record.id}
                  type="button"
                  className={`block w-full border-b border-line-soft px-4 py-3 text-left last:border-b-0 ${
                    active ? "bg-paper" : "hover:bg-paper"
                  }`}
                  onClick={() => setSelectedId(record.id)}
                >
                  <span className="block font-medium">{config?.label ?? record.id}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {record.draft && <span className="st-chip-mono bg-draft text-draft-ink">draft</span>}
                    {record.published && (
                      <span className="st-chip-mono bg-published text-published-ink">
                        v{record.published.revision}
                      </span>
                    )}
                    {config?.flowApiName && (
                      <span className="st-chip-mono bg-paper text-ink-45">{config.flowApiName}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto">
          {!draft ? (
            <div className="rounded-[13px] border border-dashed border-line p-6 text-center">
              <div className="text-[13px] font-medium">No custom screen selected.</div>
              <p className="mx-auto mt-1 max-w-[420px] text-[12px] text-ink-55">
                Create a screen to map unsupported flow UI into host-native chat controls.
              </p>
            </div>
          ) : (
            <div className="grid min-h-0 grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.2fr)] gap-4">
              <div className="space-y-3">
                <div className="st-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="st-section-label">Screen details</span>
                    <span className="text-[11.5px] text-ink-45">{saved ? "Saved" : " "}</span>
                  </div>
                  <label className="mt-3 block text-[11.5px] text-ink-55">
                    Label
                    <input
                      className="st-input mt-1 w-full"
                      value={draft.label}
                      onChange={(e) => updateDraft({ label: e.target.value })}
                    />
                  </label>
                  <label className="mt-3 block text-[11.5px] text-ink-55">
                    Flow
                    <select
                      className="st-input mt-1 w-full"
                      value={draft.flowApiName ?? ""}
                      onChange={(e) =>
                        updateDraft({ flowApiName: e.target.value || undefined })
                      }
                    >
                      <option value="">Unassigned</option>
                      {flows.map((flow) => (
                        <option key={flow.api} value={flow.api}>
                          {flow.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 block text-[11.5px] text-ink-55">
                    Replaces component
                    <input
                      className="st-input mt-1 w-full font-mono text-[11.5px]"
                      placeholder="c:cpqPricingSummary"
                      value={draft.replacesComponent ?? ""}
                      onChange={(e) =>
                        updateDraft({ replacesComponent: e.target.value || undefined })
                      }
                    />
                  </label>
                </div>

                <div className="st-card p-4">
                  <span className="st-section-label">Publish checks</span>
                  <div className="mt-3 space-y-2">
                    {CHECKS.map((check) => (
                      <div key={check} className="flex items-center gap-2 text-[12px] text-ink-55">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn-dot" />
                        {check}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11.5px] text-ink-45">
                    Guardrail execution and live preview are the next runtime slice. This editor
                    stores the versioned source they will check.
                  </p>
                </div>
              </div>

              <div className="flex min-h-[560px] flex-col overflow-hidden rounded-[13px] border border-line-soft bg-[#22242c]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                  <span className="font-mono text-[11px] text-white/60">screen source</span>
                  <span className="font-mono text-[11px] text-white/40">
                    {draft.id} · draft
                  </span>
                </div>
                <textarea
                  className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[12px] leading-7 text-[#dfe3ee] outline-none"
                  spellCheck={false}
                  value={draft.source}
                  onChange={(e) => updateDraft({ source: e.target.value })}
                />
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
                  <span className="text-[11.5px] text-white/45">
                    No direct writes. Values return to the flow and land through the signing diff.
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="st-btn" onClick={saveDraft}>
                      Save draft
                    </button>
                    <button
                      type="button"
                      className="st-btn st-btn--primary"
                      disabled={!draft || publishing}
                      onClick={publish}
                    >
                      {publishing ? "Publishing..." : "Publish"}
                    </button>
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
