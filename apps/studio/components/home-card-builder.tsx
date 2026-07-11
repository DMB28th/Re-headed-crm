"use client";
/**
 * Home-card builder (design 8a): blocks instead of fields — Header is fixed,
 * Lists / Picked-up-recently / Follow-ups toggle and configure. No dashboard
 * blocks on purpose. Preview renders the REAL HomeCard widget component
 * "as the rep": admin shapes the frame, rep data fills at render.
 */
import { useEffect, useMemo, useState } from "react";
import type { HomeCardBlock, HomeCardConfig, HomeCardPayload } from "@cardstack/core";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { HomeCard } from "@cardstack/widgets/react";
import "@cardstack/widgets/styles/theme.css";
import "@cardstack/widgets/styles/home-card.css";

interface ExposedViewInfo {
  viewId: string;
  name: string;
  filterSummary: string;
}

export function HomeCardBuilder() {
  const [config, setConfig] = useState<HomeCardConfig | null>(null);
  const [exposedViews, setExposedViews] = useState<ExposedViewInfo[]>([]);
  const [publishedRevision, setPublishedRevision] = useState<number>(1);
  const [publishing, setPublishing] = useState(false);
  const [publishedNote, setPublishedNote] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/home-card");
      const data = (await res.json()) as {
        homeCard: HomeCardConfig | null;
        exposedViews: ExposedViewInfo[];
      };
      if (data.homeCard) {
        setConfig(data.homeCard);
        setPublishedRevision(data.homeCard.revision);
      }
      setExposedViews(data.exposedViews);
    })();
  }, []);

  const publish = async () => {
    if (!config) return;
    setPublishing(true);
    const res = await fetch("/api/home-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      const { published } = (await res.json()) as { published: HomeCardConfig };
      setConfig(published);
      setPublishedRevision(published.revision);
      setPublishedNote(true);
      setTimeout(() => setPublishedNote(false), 2000);
    }
    setPublishing(false);
  };

  if (!config) return <div className="text-[12.5px] text-ink-45">Loading home card…</div>;

  const blockOf = <T extends HomeCardBlock["type"]>(type: T) =>
    config.blocks.find((b) => b.type === type) as Extract<HomeCardBlock, { type: T }> | undefined;

  const toggleBlock = (type: HomeCardBlock["type"]) => {
    const exists = blockOf(type);
    const defaults: Record<HomeCardBlock["type"], HomeCardBlock> = {
      lists: { type: "lists", source: "all", maxTiles: 4, viewIds: [] },
      recent: { type: "recent", limit: 3 },
      followups: { type: "followups", limit: 5 },
    };
    setConfig({
      ...config,
      blocks: exists
        ? config.blocks.filter((b) => b.type !== type)
        : [...config.blocks, defaults[type]],
    });
  };

  const updateBlock = (type: HomeCardBlock["type"], patch: Partial<HomeCardBlock>) =>
    setConfig({
      ...config,
      blocks: config.blocks.map((b) => (b.type === type ? ({ ...b, ...patch } as HomeCardBlock) : b)),
    });

  const listsBlock = blockOf("lists");
  const dirty = config.revision === publishedRevision; // revision bumps only on publish

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[16px] font-semibold">Home card</h1>
          <span className="st-chip-mono bg-published text-published-ink">v{publishedRevision}</span>
          <span className="text-[11.5px] text-ink-45">
            {publishedNote ? "Published" : "The launcher reps get for “open my CRM”"}
          </span>
        </div>
        <button
          type="button"
          className="st-btn st-btn--primary"
          onClick={publish}
          disabled={publishing || !dirty}
        >
          {publishing ? "Publishing…" : "Publish home card"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <section className="min-w-0 flex-1 space-y-3 overflow-y-auto">
          <div className="st-card p-3">
            <span className="st-section-label">Header · always first</span>
            <p className="mt-1 text-[11.5px] text-ink-55">
              Greeting, CRM + connected user. Not configurable — identity is not a block.
            </p>
          </div>

          <div className="st-card p-3">
            <div className="flex items-center justify-between">
              <span className="st-section-label">Your lists</span>
              <BlockToggle on={!!listsBlock} onToggle={() => toggleBlock("lists")} />
            </div>
            {listsBlock && (
              <div className="mt-2 space-y-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-ink-55">Source</span>
                  {(["all", "curated"] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      className={`rounded-[7px] border px-2 py-0.5 text-[11px] ${
                        listsBlock.source === source
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink-55"
                      }`}
                      onClick={() => updateBlock("lists", { source })}
                    >
                      {source === "all" ? "All exposed" : "Curated"}
                    </button>
                  ))}
                  <span className="ml-3 text-ink-55">Max tiles</span>
                  {([2, 4, 6] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`rounded-[7px] border px-2 py-0.5 text-[11px] ${
                        listsBlock.maxTiles === n
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink-55"
                      }`}
                      onClick={() => updateBlock("lists", { maxTiles: n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {listsBlock.source === "curated" && (
                  <div className="flex flex-wrap gap-1.5">
                    {exposedViews.map((view) => {
                      const picked = listsBlock.viewIds.includes(view.viewId);
                      return (
                        <button
                          key={view.viewId}
                          type="button"
                          className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${
                            picked ? "border-accent bg-accent text-white" : "border-line text-ink-55"
                          }`}
                          onClick={() =>
                            updateBlock("lists", {
                              viewIds: picked
                                ? listsBlock.viewIds.filter((id) => id !== view.viewId)
                                : [...listsBlock.viewIds, view.viewId],
                            })
                          }
                        >
                          {view.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="st-card p-3">
            <div className="flex items-center justify-between">
              <span className="st-section-label">Picked up recently</span>
              <BlockToggle on={!!blockOf("recent")} onToggle={() => toggleBlock("recent")} />
            </div>
          </div>

          <div className="st-card p-3">
            <div className="flex items-center justify-between">
              <span className="st-section-label">Follow-ups</span>
              <BlockToggle on={!!blockOf("followups")} onToggle={() => toggleBlock("followups")} />
            </div>
            <p className="mt-1 text-[11.5px] text-ink-55">
              CRM tasks; checking one off is a confirmed write.
            </p>
          </div>

          <div className="rounded-[10px] border border-dashed border-line p-3 text-[11.5px] text-ink-45">
            No dashboard blocks on purpose — the home card is a launcher, not analytics.
            Pinned records &amp; Actions blocks come later.
          </div>
        </section>

        <HomeCardPreview config={config} />
      </div>
    </div>
  );
}

function BlockToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`h-5 w-9 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function HomeCardPreview({ config }: { config: HomeCardConfig }) {
  const adapter = useMemo(() => new MockCrmAdapter(), []);
  const [payload, setPayload] = useState<HomeCardPayload | null>(null);
  const configJson = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parsed = JSON.parse(configJson) as HomeCardConfig;
      const savedViews = await adapter.listSavedViews("deals");
      const listsBlock = parsed.blocks.find((b) => b.type === "lists");
      const lists = [];
      if (listsBlock) {
        const wanted =
          listsBlock.source === "curated"
            ? savedViews.filter((v) => listsBlock.viewIds.includes(v.id))
            : savedViews.filter((v) => v.visibility === "shared");
        for (const view of wanted.slice(0, listsBlock.maxTiles)) {
          const page = await adapter.getViewRows(view.id);
          lists.push({
            viewId: view.id,
            name: view.name,
            filterSummary: view.filterSummary,
            count: page.total ?? page.rows.length,
          });
        }
      }
      const recentBlock = parsed.blocks.find((b) => b.type === "recent");
      const followupsBlock = parsed.blocks.find((b) => b.type === "followups");
      const built: HomeCardPayload = {
        kind: "home-card",
        blocks: parsed.blocks,
        lists,
        recent: recentBlock ? await adapter.listRecentRecords("me", recentBlock.limit) : [],
        tasks: followupsBlock ? (await adapter.listTasks("me")).rows : [],
        capabilities: { writeEnabled: true },
        provenance: {
          crm: "hubspot",
          crmLabel: "HubSpot",
          layoutRevision: parsed.revision,
          connectedUser: "Dan K.",
        },
      };
      if (!cancelled) setPayload(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [configJson, adapter]);

  return (
    <aside className="w-[396px] shrink-0 overflow-y-auto">
      <div className="mb-2 flex items-center justify-between">
        <span className="st-section-label">Preview · as Dan K.</span>
        <span className="text-[10.5px] text-ink-45">rep data fills at render</span>
      </div>
      <div style={{ background: "#f4f3f1", borderRadius: 12, padding: 14 }}>
        {payload && (
          <HomeCard key={configJson} payload={payload} locale="en-US" host={null} />
        )}
      </div>
    </aside>
  );
}
