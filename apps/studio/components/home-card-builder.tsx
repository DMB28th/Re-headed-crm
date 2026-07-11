"use client";
/**
 * Home-card builder (design 8a): blocks instead of fields — Header is fixed,
 * Lists / Picked-up-recently / Follow-ups toggle, configure and DRAG to
 * reorder. No dashboard blocks on purpose. Preview renders the REAL HomeCard
 * widget "as the rep" and is clickable: tiles drill into the real results
 * table, recent rows into the real record card (feedback 2026-07-11).
 */
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  buildRecordCardPayload,
  buildResultsTablePayload,
  parseLayoutConfig,
  type CustomList,
  type HomeCardBlock,
  type HomeCardConfig,
  type HomeCardPayload,
  type LayoutConfig,
  type RecordCardPayload,
  type ResultsTablePayload,
} from "@cardstack/core";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import { HomeCard, RecordCard, ResultsTable, type WidgetHost } from "@cardstack/widgets/react";
import { createPreviewHost } from "../lib/preview-host";
import "@cardstack/widgets/styles/theme.css";
import "@cardstack/widgets/styles/home-card.css";
import "@cardstack/widgets/styles/results-table.css";
import "@cardstack/widgets/styles/record-card.css";

interface ExposedViewInfo {
  viewId: string;
  object: string;
  name: string;
  filterSummary: string;
  custom?: CustomList;
}

const BLOCK_META: Record<
  HomeCardBlock["type"],
  { label: string; explainer: string }
> = {
  lists: {
    label: "Your lists",
    explainer:
      "Tiles with live counts for the views and Cardstack lists exposed on each object's Lists page.",
  },
  recent: {
    label: "Picked up recently",
    explainer:
      "The records this rep touched last, from CRM activity — continuity for handoffs and " +
      "support follow-ups. Toggle it off if your team won't use it.",
  },
  followups: {
    label: "Follow-ups",
    explainer: "CRM tasks; checking one off is a confirmed write.",
  },
};

export function HomeCardBuilder() {
  const [config, setConfig] = useState<HomeCardConfig | null>(null);
  const [exposedViews, setExposedViews] = useState<ExposedViewInfo[]>([]);
  const [connectedUser, setConnectedUser] = useState<string>("the rep");
  const [publishedRevision, setPublishedRevision] = useState<number>(1);
  const [publishing, setPublishing] = useState(false);
  const [publishedNote, setPublishedNote] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/home-card");
      const data = (await res.json()) as {
        homeCard: HomeCardConfig | null;
        exposedViews: ExposedViewInfo[];
        connectedUser: string | null;
      };
      if (data.homeCard) {
        setConfig(data.homeCard);
        setPublishedRevision(data.homeCard.revision);
      }
      setExposedViews(data.exposedViews);
      if (data.connectedUser) setConnectedUser(data.connectedUser);
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

  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    const activeId = String(event.active.id);
    if (!overId || activeId === overId) return;
    const from = config.blocks.findIndex((b) => b.type === activeId);
    const to = config.blocks.findIndex((b) => b.type === overId);
    if (from < 0 || to < 0) return;
    setConfig({ ...config, blocks: arrayMove(config.blocks, from, to) });
  };

  const listsBlock = blockOf("lists");
  const dirty = config.revision === publishedRevision; // revision bumps only on publish

  const blockBody = (type: HomeCardBlock["type"]) => {
    if (type !== "lists" || !listsBlock) return null;
    return (
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
            {exposedViews.length === 0 && (
              <span className="text-[11.5px] text-ink-45">
                Nothing exposed yet — expose views or create Cardstack lists on an object's
                Lists page and they show up here.
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

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

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={config.blocks.map((b) => b.type)}
              strategy={verticalListSortingStrategy}
            >
              {config.blocks.map((block) => (
                <BlockCard key={block.type} type={block.type}>
                  {(grip) => (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {grip}
                          <span className="st-section-label">{BLOCK_META[block.type].label}</span>
                        </span>
                        <BlockToggle on onToggle={() => toggleBlock(block.type)} />
                      </div>
                      <p className="mt-1 text-[11.5px] text-ink-55">
                        {BLOCK_META[block.type].explainer}
                      </p>
                      {blockBody(block.type)}
                    </>
                  )}
                </BlockCard>
              ))}
            </SortableContext>
          </DndContext>

          {(["lists", "recent", "followups"] as const)
            .filter((type) => !blockOf(type))
            .map((type) => (
              <div key={type} className="st-card p-3 opacity-70">
                <div className="flex items-center justify-between">
                  <span className="st-section-label">{BLOCK_META[type].label}</span>
                  <BlockToggle on={false} onToggle={() => toggleBlock(type)} />
                </div>
                <p className="mt-1 text-[11.5px] text-ink-55">{BLOCK_META[type].explainer}</p>
              </div>
            ))}

          <div className="rounded-[10px] border border-dashed border-line p-3 text-[11.5px] text-ink-45">
            No dashboard blocks on purpose — the home card is a launcher, not analytics.
            Pinned records &amp; Actions blocks come later. Drag the ⠿ grips to reorder.
          </div>
        </section>

        <HomeCardPreview config={config} exposedViews={exposedViews} connectedUser={connectedUser} />
      </div>
    </div>
  );
}

/** Sortable block card; drag listeners live on the grip only. */
function BlockCard({
  type,
  children,
}: {
  type: string;
  children: (grip: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: type,
  });
  const grip = (
    <span {...attributes} {...listeners} className="cursor-grab text-ink-45" title="Drag to reorder blocks">
      ⠿
    </span>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`st-card p-3 ${isDragging ? "opacity-60 shadow-md" : ""}`}
    >
      {children(grip)}
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

type Drill =
  | { kind: "view"; payload: ResultsTablePayload }
  | { kind: "record"; payload: RecordCardPayload; configJson: string }
  | null;

function HomeCardPreview({
  config,
  exposedViews,
  connectedUser,
}: {
  config: HomeCardConfig;
  exposedViews: ExposedViewInfo[];
  connectedUser: string;
}) {
  const adapter = useMemo(() => new MockCrmAdapter(), []);
  const [payload, setPayload] = useState<HomeCardPayload | null>(null);
  const [drill, setDrill] = useState<Drill>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [layoutCache] = useState<Map<string, LayoutConfig>>(() => new Map());
  const configJson = JSON.stringify(config);
  const exposedJson = JSON.stringify(exposedViews);

  const rowsFor = useMemo(
    () => async (view: ExposedViewInfo) => {
      if (view.custom) {
        return adapter.search(view.object, {
          ...(view.custom.filters.length > 0 ? { filters: view.custom.filters } : {}),
          ...(view.custom.sort ? { sort: view.custom.sort } : {}),
        });
      }
      return adapter.getViewRows(view.viewId);
    },
    [adapter],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parsed = JSON.parse(configJson) as HomeCardConfig;
      const exposed = JSON.parse(exposedJson) as ExposedViewInfo[];
      const listsBlock = parsed.blocks.find((b) => b.type === "lists");
      const lists = [];
      if (listsBlock) {
        const wanted =
          listsBlock.source === "curated"
            ? exposed.filter((v) => listsBlock.viewIds.includes(v.viewId))
            : exposed;
        for (const view of wanted.slice(0, listsBlock.maxTiles)) {
          const page = await rowsFor(view);
          lists.push({
            viewId: view.viewId,
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
          connectedUser,
        },
      };
      if (!cancelled) setPayload(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [configJson, exposedJson, adapter, connectedUser, rowsFor]);

  const layoutFor = async (object: string): Promise<LayoutConfig> => {
    const cached = layoutCache.get(object);
    if (cached) return cached;
    const res = await fetch(`/api/layout/${object}`);
    const data = (await res.json()) as {
      record: { published: LayoutConfig | null; draft: LayoutConfig | null };
    };
    const config = data.record.published ?? data.record.draft;
    if (!config) throw new Error(`No layout configured for ${object}.`);
    const parsed = parseLayoutConfig(config);
    layoutCache.set(object, parsed);
    return parsed;
  };

  const drillIntoView = async (name: string) => {
    try {
      const view = exposedViews.find((v) => v.name === name);
      if (!view) return;
      const layout = await layoutFor(view.object);
      const page = await rowsFor(view);
      const built = await buildResultsTablePayload({
        source: adapter,
        config: layout,
        page,
        title: view.name,
        savedViewName: view.name,
        savedViewId: view.viewId,
        savedViewFilterSummary: view.filterSummary,
      });
      setDrillError(null);
      setDrill({ kind: "view", payload: built });
    } catch (error) {
      setDrillError(String(error));
    }
  };

  const drillIntoRecord = async (object: string, id: string) => {
    try {
      const layout = await layoutFor(object);
      const record = await adapter.getRecord(object, id, []);
      const built = await buildRecordCardPayload({ source: adapter, config: layout, record });
      setDrillError(null);
      setDrill({ kind: "record", payload: built, configJson: JSON.stringify(layout) });
    } catch (error) {
      setDrillError(String(error));
    }
  };

  // Preview host: followups route the SAME strings the real widgets send in
  // chat into drill-in renders of the real widgets.
  const parseFollowup = (text: string) => {
    const view = /saved view "([^"]+)"/i.exec(text);
    if (view?.[1]) {
      void drillIntoView(view[1]);
      return;
    }
    const record = /the (\w+) record "[^"]*" \(id ([\w-]+)\)/i.exec(text);
    if (record?.[1] && record[2]) {
      void drillIntoRecord(record[1], record[2]);
    }
  };

  const homeHost: WidgetHost = useMemo(
    () => ({
      callTool: async (name, args) => {
        if (name === "crm_complete_task") {
          const task = await adapter.completeTask(args.id as string);
          return {
            content: [
              { type: "text", text: `Preview: completed "${task.subject}" (simulated — mock portal only).` },
            ],
          };
        }
        return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
      },
      updateModelContext: () => {},
      sendFollowup: parseFollowup,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, exposedJson],
  );

  const recordHost = (drilled: Extract<NonNullable<Drill>, { kind: "record" }>): WidgetHost =>
    createPreviewHost({
      adapter,
      getConfigJson: () => drilled.configJson,
      getProvenance: () => drilled.payload.provenance,
      onFollowup: parseFollowup,
    });

  return (
    <aside className="w-[396px] shrink-0 overflow-y-auto">
      <div className="mb-2 flex items-center justify-between">
        <span className="st-section-label">
          {drill ? "Preview · drilled in" : `Preview · as ${connectedUser}`}
        </span>
        {drill ? (
          <button type="button" className="cs-link-btn !p-0 text-[11px]" onClick={() => setDrill(null)}>
            ← Back to home card
          </button>
        ) : (
          <span className="text-[10.5px] text-ink-45">click tiles &amp; rows to dig in</span>
        )}
      </div>
      <div style={{ background: "#f4f3f1", borderRadius: 12, padding: 14 }}>
        {drillError && (
          <div className="rounded-[10px] bg-drift p-3 text-[11.5px] text-drift-ink">{drillError}</div>
        )}
        {!drill && payload && (
          <HomeCard key={configJson} payload={payload} locale="en-US" host={homeHost} />
        )}
        {drill?.kind === "view" && (
          <ResultsTable payload={drill.payload} locale="en-US" host={{
            callTool: async () => ({ isError: true, content: [{ type: "text", text: "pagination not simulated in preview" }] }),
            updateModelContext: () => {},
            sendFollowup: parseFollowup,
          }} />
        )}
        {drill?.kind === "record" && (
          <RecordCardDrill drill={drill} makeHost={recordHost} />
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-45">
        Rep data fills at render. Clicks behave like chat: tiles open the results table,
        rows open the record card — same widgets, simulated data.
      </p>
    </aside>
  );
}

/** Record drill-in needs local payload state (the card edits in place). */
function RecordCardDrill({
  drill,
  makeHost,
}: {
  drill: Extract<NonNullable<Drill>, { kind: "record" }>;
  makeHost: (d: Extract<NonNullable<Drill>, { kind: "record" }>) => WidgetHost;
}) {
  const [payload, setPayload] = useState(drill.payload);
  useEffect(() => setPayload(drill.payload), [drill.payload]);
  return (
    <RecordCard payload={payload} setPayload={setPayload} locale="en-US" host={makeHost(drill)} />
  );
}
