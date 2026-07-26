"use client";
/**
 * The layout builder (design 2a): palette | canvas | live preview.
 * Edits autosave as a DRAFT; reps keep seeing the published revision until
 * "Publish layout…" (2b). The preview renders the REAL widget component.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const [saveState, setSaveState] = useState<"clean" | "saving" | "saved" | "error">("clean");
  const [publishOpen, setPublishOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Unknown slug — a 404 with the real objects to link to, NOT a CRM outage.
  const [notFound, setNotFound] = useState<{ api: string; labelPlural: string }[] | null>(null);
  const skipNextSave = useRef(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setNotFound(null);
    try {
      const res = await fetch(`/api/layout/${object}`);
      const data = (await res.json()) as LayoutApiResponse & {
        error?: string;
        redirect?: string;
        notFound?: boolean;
        objects?: { api: string; labelPlural: string }[];
      };
      // Mis-cased slug ("accounts" for "Account") — hop to the real one.
      if (data.redirect) {
        router.replace(`/objects/${data.redirect}/layouts`);
        return;
      }
      if (data.notFound) {
        setNotFound(data.objects ?? []);
        return;
      }
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
  }, [object, router]);

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
    }
  };

  const [discarding, setDiscarding] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const discardDraft = async () => {
    setDiscarding(true);
    try {
      const res = await fetch(`/api/layout/${object}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        setSaveState("clean");
      }
      setDiscardConfirm(false);
    } finally {
      setDiscarding(false);
    }
  };

  const [regenerating, setRegenerating] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);
  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/layout/${object}/regenerate`, { method: "POST" });
      if (res.ok) await load();
      setRegenConfirm(false);
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

  if (notFound) {
    return (
      <div className="mx-auto mt-12 max-w-[560px] rounded-[13px] border border-line p-6">
        <h2 className="text-[14px] font-semibold">No object called “{object}”</h2>
        <p className="mt-2 text-[12px] text-ink-55">
          The CRM connection is fine — this URL just doesn&apos;t match any object in the
          connected portal.{notFound.length > 0 ? " Did you mean:" : ""}
        </p>
        {notFound.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {notFound.map((o) => (
              <Link
                key={o.api}
                href={`/objects/${o.api}/layouts`}
                className="rounded-[8px] border border-line px-2.5 py-1 text-[12px] text-ink-55 hover:border-accent hover:text-ink"
              >
                {o.labelPlural}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
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
          {saveState === "error" ? (
            <button
              type="button"
              className="st-chip-mono bg-drift text-drift-ink"
              title="The last autosave failed — this draft is not stored. Click to retry."
              onClick={() => config && void saveDraft(config)}
            >
              Couldn't save — retry
            </button>
          ) : (
            <span className="text-[11.5px] text-ink-45">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved just now" : " "}
            </span>
          )}
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
                    className="flex flex-wrap items-center justify-between gap-1.5 rounded-[8px] px-2 py-1.5 hover:bg-paper"
                  >
                    <span className="text-[12px]">
                      <span className="st-chip-mono bg-paper text-ink-55">v{entry.revision}</span>{" "}
                      {entry.name ?? ""}
                    </span>
                    {rollbackConfirm === entry.revision ? (
                      <span className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] text-ink-55">
                        Republishes v{entry.revision} to reps immediately — confirm?
                        <button
                          type="button"
                          className="st-btn !py-0.5 text-[11px]"
                          onClick={() => setRollbackConfirm(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="st-btn st-btn--primary !py-0.5 text-[11px]"
                          disabled={rollingBack !== null}
                          onClick={() => rollback(entry.revision)}
                        >
                          {rollingBack === entry.revision ? "Rolling back…" : "Confirm"}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="cs-link-btn st-btn !py-0.5 text-[11px]"
                        disabled={rollingBack !== null}
                        onClick={() => setRollbackConfirm(entry.revision)}
                      >
                        Roll back to v{entry.revision}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
          {regenConfirm ? (
            <span className="flex items-center gap-2 text-[11.5px] text-ink-55">
              Replaces this draft with a fresh high-signal layout from the CRM's fields
              (published version untouched).
              <button type="button" className="st-btn" onClick={() => setRegenConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="st-btn st-btn--primary" disabled={regenerating} onClick={regenerate}>
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="st-btn whitespace-nowrap"
              title="Rebuild this draft from the connected portal's fields (published version untouched)"
              onClick={() => setRegenConfirm(true)}
            >
              ↻ Regenerate
            </button>
          )}
          <details className="relative">
            <summary className="st-btn cursor-pointer list-none font-mono text-[11px]">{"{ }"}</summary>
            <div className="absolute right-0 z-20 mt-2 w-[440px] rounded-[10px] border border-line bg-surface shadow-lg">
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
            </div>
          </details>
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
