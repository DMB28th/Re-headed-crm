"use client";
/**
 * The layout builder (design 2a): palette | canvas | live preview.
 * Edits autosave as a DRAFT; reps keep seeing the published revision until
 * "Publish layout…" (2b). The preview renders the REAL widget component.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutConfig, ObjectDescribe } from "@cardstack/core";
import type { LayoutDiff, LayoutRecord } from "@cardstack/config-store";
import { Palette } from "./palette";
import { Canvas } from "./canvas";
import { Preview } from "./preview";
import { PublishModal } from "./publish-modal";
import { LoadFailed } from "../load-failed";

interface LayoutApiResponse {
  record: LayoutRecord;
  describe: ObjectDescribe;
  relatedDescribes: Record<string, ObjectDescribe>;
  diff: LayoutDiff | null;
}

export function Builder({ object }: { object: string }) {
  const [config, setConfig] = useState<LayoutConfig | null>(null);
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [relatedDescribes, setRelatedDescribes] = useState<Record<string, ObjectDescribe>>({});
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null);
  const [history, setHistory] = useState<{ revision: number; name?: string }[]>([]);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"clean" | "saving" | "saved">("clean");
  const [publishOpen, setPublishOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const skipNextSave = useRef(true);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/layout/${object}`);
      const data = (await res.json()) as LayoutApiResponse & { error?: string };
      if (!res.ok || data.error) {
        setLoadError(data.error ?? `Request failed (${res.status}).`);
        return;
      }
      skipNextSave.current = true;
      setConfig(data.record.draft ?? data.record.published);
      setDescribe(data.describe);
      setRelatedDescribes(data.relatedDescribes ?? {});
      setPublishedRevision(data.record.published?.revision ?? null);
      setHistory(
        data.record.history
          .map((c) => ({ revision: c.revision, ...(c.name ? { name: c.name } : {}) }))
          .reverse(),
      );
    } catch (error) {
      setLoadError(String(error));
    }
  }, [object]);

  const rollback = async (revision: number) => {
    setRollingBack(revision);
    try {
      await fetch(`/api/layout/${object}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      await load();
    } finally {
      setRollingBack(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Autosave the draft, debounced ("Saved just now").
  useEffect(() => {
    if (!config) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(async () => {
      await fetch(`/api/layout/${object}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaveState("saved");
    }, 600);
    return () => clearTimeout(timer);
  }, [config, object]);

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => void load()} />;
  }
  if (!config || !describe) {
    return <div className="text-[12.5px] text-ink-45">Loading builder…</div>;
  }

  const usedFields = new Set(
    config.recordCard.sections.flatMap((s) => s.fields.map((f) => f.api)),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[16px] font-semibold capitalize">{object}</h1>
          <span className="st-chip-mono bg-draft text-draft-ink">
            Draft{publishedRevision ? ` · v${publishedRevision + 1} from v${publishedRevision}` : ""}
          </span>
          <span className="text-[11.5px] text-ink-45">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved just now" : " "}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <details className="relative">
              <summary className="st-btn cursor-pointer list-none">
                Versions ({history.length})
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-[10px] border border-line bg-surface p-1.5 shadow-lg">
                <div className="px-2 py-1 text-[11px] text-ink-45">
                  Previous versions are kept — rolling back republishes under a new revision.
                </div>
                {history.map((entry) => (
                  <div
                    key={entry.revision}
                    className="flex items-center justify-between rounded-[8px] px-2 py-1.5 hover:bg-paper"
                  >
                    <span className="text-[12px]">
                      <span className="st-chip-mono bg-paper text-ink-55">v{entry.revision}</span>{" "}
                      {entry.name ?? ""}
                    </span>
                    <button
                      type="button"
                      className="cs-link-btn st-btn !py-0.5 text-[11px]"
                      disabled={rollingBack !== null}
                      onClick={() => rollback(entry.revision)}
                    >
                      {rollingBack === entry.revision ? "Rolling back…" : "Roll back"}
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
          <details className="relative">
            <summary className="st-btn cursor-pointer list-none font-mono text-[11px]">{"{ }"}</summary>
            <pre className="absolute right-0 z-20 mt-2 max-h-[420px] w-[440px] overflow-auto rounded-[10px] border border-line bg-surface p-3 text-[10.5px] leading-relaxed shadow-lg">
              {JSON.stringify(config, null, 2)}
            </pre>
          </details>
          <button type="button" className="st-btn st-btn--primary" onClick={() => setPublishOpen(true)}>
            Publish layout…
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <Palette
          describe={describe}
          usedFields={usedFields}
          onAdd={(api) => {
            setConfig((prev) => {
              if (!prev) return prev;
              const sections = prev.recordCard.sections.map((s, i) =>
                i === 0 ? { ...s, fields: [...s.fields, { api, editable: false }] } : s,
              );
              return { ...prev, recordCard: { ...prev.recordCard, sections } };
            });
          }}
        />
        <Canvas
          config={config}
          describe={describe}
          relatedDescribes={relatedDescribes}
          onChange={setConfig}
        />
        <Preview config={config} />
      </div>

      {publishOpen && (
        <PublishModal
          object={object}
          publishedRevision={publishedRevision}
          onClose={() => setPublishOpen(false)}
          onPublished={async () => {
            setPublishOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
