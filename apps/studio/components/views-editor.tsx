"use client";
/**
 * List views (design 5a): synced CRM views, exposure toggles, "Ask Claude
 * with" aliases, default view. Filters are read-only from the CRM — there is
 * deliberately no view builder here.
 */
import { useEffect, useState } from "react";
import type { SavedView, ViewExposure, ViewExposuresConfig } from "@cardstack/core";

export function ViewsEditor({ object }: { object: string }) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [exposures, setExposures] = useState<ViewExposuresConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/views/${object}`);
      const data = (await res.json()) as {
        savedViews: SavedView[];
        exposures: ViewExposuresConfig;
      };
      setSavedViews(data.savedViews);
      setExposures(data.exposures);
    })();
  }, [object]);

  const save = async (next: ViewExposuresConfig) => {
    setExposures(next);
    await fetch(`/api/views/${object}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  if (!exposures) return <div className="text-[12.5px] text-ink-45">Loading…</div>;

  const exposureFor = (viewId: string): ViewExposure =>
    exposures.views.find((v) => v.viewId === viewId) ?? {
      viewId,
      exposed: false,
      aliases: [],
      isDefault: false,
    };

  const updateView = (viewId: string, patch: Partial<ViewExposure>) => {
    const others = exposures.views.filter((v) => v.viewId !== viewId);
    let views = [...others, { ...exposureFor(viewId), ...patch }];
    if (patch.isDefault) {
      views = views.map((v) => (v.viewId === viewId ? v : { ...v, isDefault: false }));
    }
    void save({ ...exposures, views });
  };

  return (
    <div className="max-w-[780px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold capitalize">{object} · Lists</h1>
        <span className="text-[11.5px] text-ink-45">{saved ? "Saved" : " "}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Saved views sync from the CRM. Filters are managed there — Cardstack only decides what
        chat can see and what phrases reach it. Changes apply on the next ask (no publish step).
      </p>

      <div className="st-card mt-5 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] gap-3 border-b border-line-soft px-4 py-2">
          {["View", "Filters (from CRM)", "Ask Claude with", "Exposed"].map((h) => (
            <span key={h} className="st-section-label">
              {h}
            </span>
          ))}
        </div>
        {savedViews.map((view) => {
          const exposure = exposureFor(view.id);
          return (
            <div
              key={view.id}
              className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
            >
              <span className="text-[12.5px]">
                <span className="font-medium">{view.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  {view.visibility === "private" && (
                    <span className="st-chip-mono bg-paper text-ink-45">private</span>
                  )}
                  {exposure.isDefault ? (
                    <span className="st-chip-mono bg-published text-published-ink">default</span>
                  ) : (
                    exposure.exposed && (
                      <button
                        type="button"
                        className="text-[10.5px] text-ink-45 underline"
                        onClick={() => updateView(view.id, { isDefault: true })}
                      >
                        make default
                      </button>
                    )
                  )}
                </span>
              </span>
              <span className="text-[11.5px] text-ink-55">{view.filterSummary}</span>
              <input
                className="st-input text-[11.5px]"
                placeholder="my deals, open deals…"
                defaultValue={exposure.aliases.join(", ")}
                onBlur={(e) =>
                  updateView(view.id, {
                    aliases: e.target.value
                      .split(",")
                      .map((a) => a.trim())
                      .filter(Boolean),
                  })
                }
              />
              <button
                type="button"
                role="switch"
                aria-checked={exposure.exposed}
                onClick={() => updateView(view.id, { exposed: !exposure.exposed })}
                className={`h-5 w-9 rounded-full transition-colors ${exposure.exposed ? "bg-accent" : "bg-line"}`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white transition-transform ${exposure.exposed ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
