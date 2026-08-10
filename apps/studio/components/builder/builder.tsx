"use client";
/**
 * The layout builder (design 2a): palette | canvas | live preview.
 * Edits autosave as a DRAFT; reps keep seeing the published revision until
 * "Publish layout…" (2b). The preview renders the REAL widget component.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutConfig, ObjectDescribe } from "@cardstack/core";
import type { LayoutDiff, LayoutRecord } from "@cardstack/config-store";
import { Palette } from "./palette";
import { Canvas } from "./canvas";
import { Preview } from "./preview";
import { PublishModal } from "./publish-modal";
import { LoadFailed } from "../load-failed";
import { ConfirmButton, ConfirmPopover, Popover } from "../ui/confirm";
import { StatusChip } from "../ui/status-chip";

interface LayoutApiResponse {
  record: LayoutRecord;
  describe: ObjectDescribe;
  relatedDescribes: Record<string, ObjectDescribe>;
  diff: LayoutDiff | null;
}

export function Builder({ object }: { object: string }) {
  const router = useRouter();
  const [config, setConfig] = useState<LayoutConfig | null>(null);
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [configuredObjects, setConfiguredObjects] = useState<
    { api: string; labelPlural: string }[]
  >([]);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [relatedDescribes, setRelatedDescribes] = useState<Record<string, ObjectDescribe>>({});
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null);
  const [history, setHistory] = useState<{ revision: number; name?: string }[]>([]);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<number | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [saveState, setSaveState] = useState<"clean" | "saving" | "saved" | "error">("clean");
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
      setRollbackConfirm(null);
      setVersionsOpen(false);
    }
  };

  const [discarding, setDiscarding] = useState(false);
  const discardDraft = async () => {
    setDiscarding(true);
    try {
      const res = await fetch(`/api/layout/${object}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        setSaveState("clean");
      }
    } finally {
      setDiscarding(false);
    }
  };

  const [regenerating, setRegenerating] = useState(false);
  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/layout/${object}/regenerate`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Configured objects feed the header's object switcher (2a top bar).
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/objects");
        if (!res.ok) return;
        const data = (await res.json()) as {
          objects?: { api: string; labelPlural: string }[];
        };
        setConfiguredObjects(data.objects ?? []);
      } catch {
        // switcher degrades to a plain title
      }
    })();
  }, []);

  // Save the current draft; shared by the debounced autosave and the retry chip.
  // A failed PUT must never read "Saved just now" — that's silent data loss.
  const saveDraft = useCallback(
    async (draft: LayoutConfig) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/layout/${object}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    },
    [object],
  );

  // Autosave the draft, debounced ("Saved just now").
  useEffect(() => {
    if (!config) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => void saveDraft(config), 600);
    return () => clearTimeout(timer);
  }, [config, saveDraft]);

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
    // Viewport-bounded so palette / canvas / preview scroll INDEPENDENTLY —
    // on real portals the palette has hundreds of fields and must not scroll
    // the whole page (feedback round 2).
    <div className="flex h-[calc(100vh-48px)] min-h-0 flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {configuredObjects.length > 1 ? (
            <select
              aria-label="Switch object"
              className="st-input py-1 text-[14px] font-semibold"
              value={object}
              onChange={(e) => router.push(`/objects/${e.target.value}/layouts`)}
            >
              {(configuredObjects.some((o) => o.api === object)
                ? configuredObjects
                : [{ api: object, labelPlural: describe.labelPlural }, ...configuredObjects]
              ).map((o) => (
                <option key={o.api} value={o.api}>
                  {o.labelPlural}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="text-[16px] font-semibold">{describe.labelPlural}</h1>
          )}
          <span className="st-chip-mono bg-draft text-draft-ink">
            Draft{publishedRevision ? ` · v${publishedRevision + 1} from v${publishedRevision}` : ""}
          </span>
          <StatusChip
            status={
              saveState === "error"
                ? "failed"
                : saveState === "saving"
                  ? "saving"
                  : saveState === "saved"
                    ? "saved"
                    : "clean"
            }
            onRetry={() => config && void saveDraft(config)}
          />
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <div className="relative">
              <button
                type="button"
                className="st-btn"
                aria-haspopup="dialog"
                aria-expanded={versionsOpen}
                onClick={() => setVersionsOpen((open) => !open)}
              >
                Versions ({history.length})
              </button>
              <Popover
                open={versionsOpen}
                onClose={() => {
                  setVersionsOpen(false);
                  setRollbackConfirm(null);
                }}
              >
                <div className="px-2 py-1 text-[11px] text-ink-45">
                  Previous versions are kept — rolling back republishes under a new revision.
                </div>
                {history.map((entry) => (
                  <div
                    key={entry.revision}
                    className="relative flex items-center justify-between gap-1.5 rounded-[8px] px-2 py-1.5 hover:bg-paper"
                  >
                    <span className="text-[12px]">
                      <span className="st-chip-mono bg-paper text-ink-55">v{entry.revision}</span>{" "}
                      {entry.name ?? ""}
                    </span>
                    <button
                      type="button"
                      className="st-btn !py-0.5 text-[11px]"
                      disabled={rollingBack !== null}
                      onClick={() => setRollbackConfirm(entry.revision)}
                    >
                      Roll back
                    </button>
                    <ConfirmPopover
                      open={rollbackConfirm === entry.revision}
                      title={`Roll back to v${entry.revision}?`}
                      detail="Reps see it immediately. The current version is kept in history, republished under a new revision number."
                      confirmLabel="Roll back"
                      busyLabel="Rolling back…"
                      busy={rollingBack === entry.revision}
                      onConfirm={() => void rollback(entry.revision)}
                      onCancel={() => setRollbackConfirm(null)}
                    />
                  </div>
                ))}
              </Popover>
            </div>
          )}
          {publishedRevision !== null && (
            <ConfirmButton
              label="Discard draft"
              title="Discard this draft?"
              detail={`Throws away every unpublished edit and puts the builder back to v${publishedRevision}, the version reps already see. This can't be undone.`}
              confirmLabel="Discard"
              busyLabel="Discarding…"
              busy={discarding}
              tone="danger"
              onConfirm={discardDraft}
            />
          )}
          <ConfirmButton
            label="↻ Regenerate"
            className="st-btn whitespace-nowrap"
            title="Regenerate this draft?"
            detail="Replaces the draft with a fresh high-signal layout built from the CRM's current fields. The published version reps see is untouched."
            confirmLabel="Regenerate"
            busyLabel="Regenerating…"
            busy={regenerating}
            onConfirm={regenerate}
          />
          <div className="relative">
            <button
              type="button"
              className="st-btn font-mono text-[11px]"
              aria-label="Show layout JSON"
              aria-expanded={jsonOpen}
              onClick={() => setJsonOpen((open) => !open)}
            >
              {"{ }"}
            </button>
            <Popover open={jsonOpen} onClose={() => setJsonOpen(false)} width={440}>
              <div className="flex items-center justify-end gap-2 border-b border-line-soft p-2">
                <button
                  type="button"
                  className="st-btn !py-1 text-[11px]"
                  onClick={() => {
                    void navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                    setJsonCopied(true);
                    setTimeout(() => setJsonCopied(false), 1500);
                  }}
                >
                  {jsonCopied ? "Copied" : "Copy JSON"}
                </button>
                <button
                  type="button"
                  className="st-btn !py-1 text-[11px]"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(config, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${object}-layout.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download .json
                </button>
              </div>
              <pre className="max-h-[380px] overflow-auto p-3 text-[10.5px] leading-relaxed">
                {JSON.stringify(config, null, 2)}
              </pre>
            </Popover>
          </div>
          <button type="button" className="st-btn st-btn--primary" onClick={() => setPublishOpen(true)}>
            Publish layout…
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
        <Palette
          describe={describe}
          crm={config.crm}
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
          objectLabel={describe.labelPlural}
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
