"use client";
/**
 * Home-card builder (design 8a): blocks instead of fields — Header is fixed,
 * Lists / Picked-up-recently / Follow-ups toggle, configure and DRAG to
 * reorder. No dashboard blocks on purpose. Preview renders the REAL HomeCard
 * widget "as the rep" and is clickable: tiles drill into the real results
 * table, recent rows into the real record card (feedback 2026-07-11).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  CustomList,
  HomeCardBlock,
  HomeCardConfig,
  HomeCardPayload,
  RecordCardPayload,
  ResultsTablePayload,
} from "@cardstack/core";
import { HomeCard, RecordCard, ResultsTable, type WidgetHost, type WidgetHostResult } from "@cardstack/widgets/react";
import { LoadFailed } from "./load-failed";
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

/** Starting draft when a tenant has never published a home card (all blocks on). */
const defaultHomeCard = (tenantId: string): HomeCardConfig => ({
  version: 1,
  tenantId,
  audience: "default",
  revision: 1,
  blocks: [
    { type: "lists", source: "all", maxTiles: 4, viewIds: [] },
    { type: "recent", limit: 3 },
    { type: "followups", limit: 5 },
  ],
});

export function HomeCardBuilder() {
  const [config, setConfig] = useState<HomeCardConfig | null>(null);
  const [exposedViews, setExposedViews] = useState<ExposedViewInfo[]>([]);
  const [connectedUser, setConnectedUser] = useState<string>("the rep");
  const [liveHubspot, setLiveHubspot] = useState(false);
  // null = nothing published yet (fresh tenant): builder starts from a default draft.
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedNote, setPublishedNote] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draggingBlock, setDraggingBlock] = useState<HomeCardBlock["type"] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch("/api/home-card");
        const data = (await res.json()) as {
          homeCard: HomeCardConfig | null;
          exposedViews: ExposedViewInfo[];
          connectedUser: string | null;
          connection?: { crm: string; live?: boolean };
          currentUser?: { tenantId: string };
          error?: string;
        };
        if (!res.ok || data.error) {
          setLoadError(data.error ?? `Request failed (${res.status}).`);
          return;
        }
        if (data.homeCard) {
          setConfig(data.homeCard);
          setPublishedRevision(data.homeCard.revision);
        } else if (data.currentUser) {
          // No card published yet — start from the default draft so the admin
          // can configure and publish rather than staring at a spinner.
          setConfig(defaultHomeCard(data.currentUser.tenantId));
          setPublishedRevision(null);
        } else {
          setLoadError("No home card and no tenant context came back — check the connection.");
          return;
        }
        setExposedViews(data.exposedViews);
        if (data.connectedUser) setConnectedUser(data.connectedUser);
        setLiveHubspot(data.connection?.crm === "hubspot" && !!data.connection?.live);
      } catch (error) {
        setLoadError(String(error));
      }
    })();
  }, [reloadKey]);

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

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
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

  const onDragStart = (event: DragStartEvent) =>
    setDraggingBlock(String(event.active.id) as HomeCardBlock["type"]);

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingBlock(null);
    const overId = event.over ? String(event.over.id) : null;
    const activeId = String(event.active.id);
    if (!overId || activeId === overId) return;
    const from = config.blocks.findIndex((b) => b.type === activeId);
    const to = config.blocks.findIndex((b) => b.type === overId);
    if (from < 0 || to < 0) return;
    setConfig({ ...config, blocks: arrayMove(config.blocks, from, to) });
  };

  const listsBlock = blockOf("lists");
  // Revision bumps only on publish; null = never published, always publishable.
  const dirty = publishedRevision === null || config.revision === publishedRevision;

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
          <span className="st-chip-mono bg-published text-published-ink">
            {publishedRevision === null ? "draft" : `v${publishedRevision}`}
          </span>
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
        <section className="min-w-0 flex-1 overflow-y-auto">
          {/* The template mirrors the card itself (feedback round 2): one
              card-shaped frame, blocks in render order, drag inside it. */}
          <div className="mx-auto max-w-[560px] rounded-[14px] border border-line bg-surface p-4 shadow-sm">
            <div
              className="flex items-baseline justify-between border-b border-line-soft pb-3"
              title="Always first — identity is not a block and can't be moved or removed."
            >
              <span className="text-[15px] font-semibold">Your CRM</span>
              <span className="text-[11.5px] text-ink-45">HubSpot · {connectedUser}</span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragCancel={() => setDraggingBlock(null)}
              onDragEnd={onDragEnd}
            >
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
                        {block.type === "recent" && liveHubspot && (
                          <p className="mt-2 rounded-[8px] bg-draft px-2.5 py-1.5 text-[11.5px] text-draft-ink">
                            HubSpot doesn&apos;t expose &ldquo;recently viewed&rdquo; through its
                            public API — this block fills on Salesforce and the mock portal, and
                            renders empty for reps on HubSpot. Consider toggling it off.
                          </p>
                        )}
                        {block.type === "lists" && exposedViews.length === 0 && (
                          <p className="mt-2 rounded-[8px] bg-draft px-2.5 py-1.5 text-[11.5px] text-draft-ink">
                            Nothing is exposed yet, so this block renders empty for reps —
                            expose views or create Cardstack lists on an object&apos;s{" "}
                            <Link href="/objects/deals/lists" className="underline">
                              Lists page
                            </Link>
                            .
                          </p>
                        )}
                        {blockBody(block.type)}
                      </>
                    )}
                  </BlockCard>
                ))}
              </SortableContext>

              {/* Ghost block follows the pointer; the in-list slot renders as
                  the 2px dashed accent drop indicator (design 2a/8a). */}
              <DragOverlay dropAnimation={null}>
                {draggingBlock && (
                  <div className="cursor-grabbing rounded-[10px] border border-line bg-paper p-3 shadow-lg">
                    <span className="flex items-center gap-2">
                      <span className="text-ink-45">⠿</span>
                      <span className="st-section-label">{BLOCK_META[draggingBlock].label}</span>
                    </span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            <div className="mt-3 border-t border-line-soft pt-2 text-[10.5px] text-ink-45">
              🔒 Writes require confirmation · HubSpot · via Cardstack
            </div>
          </div>

          <div className="mx-auto mt-3 max-w-[560px] space-y-2">
            {(["lists", "recent", "followups"] as const)
              .filter((type) => !blockOf(type))
              .map((type) => (
                <button
                  key={type}
                  type="button"
                  className="flex w-full items-center justify-between rounded-[10px] border border-dashed border-line px-3 py-2 text-left hover:border-accent"
                  onClick={() => toggleBlock(type)}
                >
                  <span>
                    <span className="text-[12.5px] font-medium">+ {BLOCK_META[type].label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-55">
                      {BLOCK_META[type].explainer}
                    </span>
                  </span>
                </button>
              ))}
            <div className="rounded-[10px] border border-dashed border-line p-3 text-[11.5px] text-ink-45">
              No dashboard blocks on purpose — the home card is a launcher, not analytics.
              Pinned records &amp; Actions blocks come later. Drag the ⠿ grips to reorder.
            </div>
          </div>
        </section>

        <HomeCardPreview config={config} exposedViews={exposedViews} connectedUser={connectedUser} />
      </div>
    </div>
  );
}

/** Sortable template block (a section of the card frame); listeners live on the grip. */
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
    // While dragging, the in-list slot becomes the drop indicator: a 2px
    // dashed accent outline with invisible contents (ghost is in the overlay).
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`mt-3 rounded-[10px] border border-line-soft bg-paper p-3 ${
        isDragging ? "!border-2 !border-dashed !border-accent [&>*]:invisible" : ""
      }`}
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
  | { kind: "record"; payload: RecordCardPayload; object: string }
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
  const [payload, setPayload] = useState<HomeCardPayload | null>(null);
  const [live, setLive] = useState(false);
  const [drill, setDrill] = useState<Drill>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  const configJson = JSON.stringify(config);
  const exposedJson = JSON.stringify(exposedViews);

  // Server-assembled payload — the exact codepath crm_home runs, against the
  // tenant's actual connection (mock or live CRM).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewCall({ kind: "home", config: JSON.parse(configJson) });
      if (cancelled) return;
      if (result.error) {
        setDrillError(result.error);
        return;
      }
      setPayload(result.payload as HomeCardPayload);
      setLive(!!result.live);
      setDrillError(null);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [configJson]);

  const drillIntoView = async (name: string) => {
    const view = (JSON.parse(exposedJson) as ExposedViewInfo[]).find((v) => v.name === name);
    if (!view) return;
    const result = await previewCall({ kind: "view", object: view.object, viewId: view.viewId });
    if (result.error) {
      setDrillError(result.error);
      return;
    }
    setDrillError(null);
    setDrill({ kind: "view", payload: result.payload as ResultsTablePayload });
  };

  const drillIntoRecord = async (object: string, id: string) => {
    const result = await previewCall({ kind: "record", object, recordId: id });
    if (result.error) {
      setDrillError(result.error);
      return;
    }
    setDrillError(null);
    setDrill({ kind: "record", payload: result.payload as RecordCardPayload, object });
  };

  // Followups route the SAME strings the real widgets send in chat into
  // drill-in renders of the real widgets.
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
      callTool: async (name, args): Promise<WidgetHostResult> => {
        if (name === "crm_complete_task") {
          const result = await previewCall({ kind: "complete-task", id: args.id });
          if (result.error) return { isError: true, content: [{ type: "text", text: result.error }] };
          return { content: result.text ? [{ type: "text", text: result.text }] : [] };
        }
        return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
      },
      updateModelContext: () => {},
      sendFollowup: parseFollowup,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exposedJson],
  );

  const recordHost = (drilled: Extract<NonNullable<Drill>, { kind: "record" }>): WidgetHost => ({
    updateModelContext: () => {},
    sendFollowup: parseFollowup,
    callTool: async (name, args): Promise<WidgetHostResult> => {
      if (name === "crm_get_related") {
        const result = await previewCall({
          kind: "related",
          object: drilled.object,
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
          // Drill-through may target another object — forward it.
          object: (args.object as string | undefined) ?? drilled.object,
          recordId: args.id,
        });
        if (result.error) return { isError: true, content: [{ type: "text", text: result.error }] };
        return { structuredContent: result.payload as Record<string, unknown> };
      }
      if (name === "crm_update_record") {
        const result = await previewCall({
          kind: "write",
          object: drilled.object,
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
  });

  return (
    <aside className="w-[396px] shrink-0 overflow-y-auto">
      <div className="mb-2 flex items-center justify-between">
        <span className="st-section-label">
          {drill ? "Preview · drilled in" : `Preview · as ${connectedUser}`}
          {live ? " · live data" : ""}
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
        {live
          ? "Previewing against your LIVE portal (read-only — writes are disabled here; test them from chat)."
          : "Rep data fills at render. Clicks behave like chat: tiles open the results table, rows open the record card — same widgets, simulated data."}
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
