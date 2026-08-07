"use client";
/**
 * Actions editor (design 3a): the record card's action row — reorder,
 * rename, toggle on/off, remove, add. Mirrors permissions-editor.tsx: load
 * draft-or-published from /api/layout/[object], save every mutation
 * straight to the draft, flash "Saved to draft". Publishing stays in the
 * builder.
 *
 * components/builder/canvas.tsx also edits `recordCard.actions` (its
 * "Action components" block), but only add/remove for create_related and
 * screen_flow, with no reorder, no enable/disable, and no quick_action
 * support — that block predates this screen and is left as-is. This is the
 * full editor design 3a calls for, and it routes every mutation through
 * `packages/core`'s card-actions module (`upsertAction`/`removeAction`/…).
 * canvas.tsx does NOT — it hand-rolls its own append/filter/splice logic and
 * has not been migrated to these helpers. The two surfaces agree today only
 * by coincidence (canvas's own already-configured filters happen to compute
 * the same result), not by construction, so a change to either surface's
 * mutation logic must be checked against the other.
 *
 * Every mutation goes through the `card-actions.ts` helpers — never a
 * hand-rolled filter/map/splice over `recordCard.actions` — so this screen,
 * the Flows admin toggle, and the record card's render decision can never
 * disagree about what "off" or "already configured" means.
 */
import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  actionRef,
  findAction,
  removeAction,
  reorderActions,
  setActionEnabled,
  upsertAction,
  type ActionInputMappings,
  type ActionRef,
  type CardAction,
  type LayoutConfig,
} from "@cardstack/core";
import type { LayoutRecord } from "@cardstack/config-store";
import { ActionInputsEditor, type ActionInputVariable } from "./action-inputs-editor";
import type { ActionSource, AvailableActionsResponse, DiscoveredAction } from "../lib/action-catalog";

/** Stable string id for an ActionRef — sortable-item ids and picker keys. */
function refKey(ref: ActionRef): string {
  switch (ref.type) {
    case "update_record":
      return "update_record";
    case "create_related":
      return `create_related:${ref.object}`;
    case "quick_action":
      return `quick_action:${ref.actionApiName}`;
    case "screen_flow":
      return `screen_flow:${ref.flowApiName}`;
  }
}

function actionKindLabel(action: CardAction): string {
  switch (action.type) {
    case "update_record":
      return "Record write";
    case "create_related":
      return `Create ${action.object}`;
    case "quick_action":
      return "Quick action";
    case "screen_flow":
      return "Screen flow";
  }
}

/** CRM-discovered kinds get the metadata-purple treatment; builtins don't. */
function isCrmDiscovered(kind: ActionSource["kind"]): boolean {
  return kind === "quick_action" || kind === "screen_flow";
}

function actionFromEntry(entry: DiscoveredAction): CardAction {
  const { ref } = entry;
  switch (ref.type) {
    case "update_record":
      return { type: "update_record", label: entry.label, enabled: true };
    case "create_related":
      return { type: "create_related", object: ref.object, label: entry.label, enabled: true };
    case "quick_action":
      return {
        type: "quick_action",
        actionApiName: ref.actionApiName,
        label: entry.label,
        enabled: true,
      };
    case "screen_flow":
      return {
        type: "screen_flow",
        flowApiName: ref.flowApiName,
        label: entry.label,
        embed: "auto",
        inputs: {},
        enabled: true,
      };
  }
}

const SOURCE_LABEL: Record<ActionSource["kind"], string> = {
  builtin: "Built-in",
  quick_action: "Quick actions",
  screen_flow: "Screen flows",
};

// Shown when a source came back with no `unavailable` flag AND no entries —
// the org genuinely has none. This is a teaching state, not an error; a
// source with `unavailable` set renders THAT message instead (also as a
// teaching state, never an error banner — see EntrySource below).
const EMPTY_TEACHING_COPY: Partial<Record<ActionSource["kind"], string>> = {
  quick_action: "No quick actions found in this org.",
  screen_flow: "No screen flows found in this org.",
};

export function ActionsEditor({ object }: { object: string }) {
  const [config, setConfig] = useState<LayoutConfig | null>(null);
  const [catalog, setCatalog] = useState<AvailableActionsResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Screen-flow rows expand in place to show their input mapping editor —
  // keyed by flowApiName so expansion survives reordering.
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    (async () => {
      const [layoutRes, catalogRes] = await Promise.all([
        fetch(`/api/layout/${object}`),
        fetch(`/api/objects/${object}/available-actions`),
      ]);
      const layoutData = (await layoutRes.json()) as { record: LayoutRecord };
      setConfig(layoutData.record.draft ?? layoutData.record.published);
      const catalogData = (await catalogRes.json()) as AvailableActionsResponse | { error: string };
      setCatalog("sources" in catalogData ? catalogData : { sources: [] });
    })();
  }, [object]);

  const save = useCallback(
    async (next: LayoutConfig) => {
      setConfig(next);
      setError(null);
      const response = await fetch(`/api/layout/${object}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Couldn't save (${response.status}).`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    },
    [object],
  );

  if (!config || !catalog) return <div className="text-[12.5px] text-ink-45">Loading…</div>;

  const actions = config.recordCard.actions;
  // Primary = the first ENABLED action, not index 0 (which may itself be
  // disabled). This must track `selectRenderableActions` — what the card
  // actually renders — but unlike that function we do NOT also drop
  // update_record when nothing on the card is editable: this screen shows
  // the admin's CONFIGURATION, not a permissions-resolved preview of it.
  const primaryIndex = actions.findIndex((a) => a.enabled !== false);

  const mutateActions = (fn: (current: CardAction[]) => CardAction[]) =>
    void save({ ...config, recordCard: { ...config.recordCard, actions: fn(actions) } });

  // Recomputed against the LIVE draft rather than trusting the catalog
  // fetch's `alreadyConfigured` snapshot, which goes stale the moment this
  // screen adds or removes an action without a full re-fetch.
  const isConfigured = (ref: ActionRef) => findAction(actions, ref) !== undefined;

  // A configured screen_flow action carries no `inputVariables` of its own
  // (that's discovery metadata, not layout config) — look it up by
  // flowApiName in the catalog's screen_flow source. `undefined` here means
  // either the flow's definition was unreadable OR the catalog fetch never
  // found this flow at all; both render the same caution state, which is
  // the correct fallback for "we can't tell you what this flow needs."
  const screenFlowEntries = catalog.sources.find((s) => s.kind === "screen_flow")?.entries ?? [];
  const inputVariablesFor = (flowApiName: string) =>
    screenFlowEntries.find((e) => e.ref.type === "screen_flow" && e.ref.flowApiName === flowApiName)
      ?.inputVariables;

  const toggleFlowExpanded = (flowApiName: string) =>
    setExpandedFlows((prev) => {
      const next = new Set(prev);
      if (next.has(flowApiName)) next.delete(flowApiName);
      else next.add(flowApiName);
      return next;
    });

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const from = actions.findIndex((a) => refKey(actionRef(a)) === activeId);
    const to = actions.findIndex((a) => refKey(actionRef(a)) === overId);
    if (from < 0 || to < 0) return;
    mutateActions((current) => reorderActions(current, from, to));
  };

  return (
    <div className="max-w-[720px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.025em] capitalize">{object} actions</h1>
        <span className="text-[11.5px] text-ink-45">{saved ? "Saved to draft" : " "}</span>
      </div>
      <p className="mt-1 text-[14px] text-ink-55">
        The buttons reps see on the card, and the chat phrases that trigger the same actions.
        Order sets which one leads — the first enabled action is Primary.
      </p>
      {error && (
        <div role="alert" className="mt-4 rounded-[9px] bg-drift px-3 py-2 text-[13px] text-drift-ink">
          {error}
        </div>
      )}

      {actions.length === 0 && (
        <p className="mt-5 text-[12.5px] text-ink-45">No actions configured yet — add one below.</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={actions.map((a) => refKey(actionRef(a)))}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-5 space-y-2">
            {actions.map((action, i) => (
              <ActionRow
                key={refKey(actionRef(action))}
                action={action}
                isPrimary={i === primaryIndex}
                onCommitLabel={(label) => mutateActions((current) => upsertAction(current, { ...action, label }))}
                onToggleEnabled={() =>
                  mutateActions((current) => setActionEnabled(current, actionRef(action), action.enabled === false))
                }
                onRemove={() => mutateActions((current) => removeAction(current, actionRef(action)))}
                expanded={action.type === "screen_flow" && expandedFlows.has(action.flowApiName)}
                onToggleExpand={
                  action.type === "screen_flow" ? () => toggleFlowExpanded(action.flowApiName) : undefined
                }
                inputVariables={action.type === "screen_flow" ? inputVariablesFor(action.flowApiName) : undefined}
                onInputsChange={
                  action.type === "screen_flow"
                    ? (nextInputs: ActionInputMappings) =>
                        mutateActions((current) =>
                          upsertAction(current, { ...action, inputs: nextInputs }, { overwriteInputs: true }),
                        )
                    : undefined
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Pinned trust line — plain text, no switch, no config behind it.
          "Require confirmation" is locked ON; it is the product's spine,
          not a setting an admin can turn off here. */}
      <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-line-soft bg-paper px-3 py-2.5 text-[12.5px] text-ink-55">
        <span aria-hidden="true">🔒</span>
        Writes require confirmation
      </div>

      <div className="mt-4">
        <button type="button" className="st-btn" onClick={() => setPickerOpen((open) => !open)}>
          {pickerOpen ? "Close" : "+ Add action"}
        </button>
        {pickerOpen && (
          <div className="mt-2 rounded-[10px] border border-line bg-surface p-3 shadow-lg">
            {catalog.sources.map((source) => (
              <SourceGroup
                key={source.kind}
                source={source}
                isConfigured={isConfigured}
                onPick={(entry) => mutateActions((current) => upsertAction(current, actionFromEntry(entry)))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One configured action row. Sortable via `useSortable`; label commits on
 * blur (not per keystroke) so a rename doesn't fire a PUT on every
 * character — the same commit-on-blur idiom `InputNameField` in
 * builder/canvas.tsx uses for renaming action inputs.
 */
function ActionRow({
  action,
  isPrimary,
  onCommitLabel,
  onToggleEnabled,
  onRemove,
  expanded,
  onToggleExpand,
  inputVariables,
  onInputsChange,
}: {
  action: CardAction;
  isPrimary: boolean;
  onCommitLabel: (label: string) => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  /** screen_flow only — undefined props below mean "not a screen_flow row". */
  expanded?: boolean;
  onToggleExpand?: () => void;
  inputVariables?: ActionInputVariable[];
  onInputsChange?: (next: ActionInputMappings) => void;
}) {
  const id = refKey(actionRef(action));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [label, setLabel] = useState(action.label);
  useEffect(() => setLabel(action.label), [action.label]);
  const enabled = action.enabled !== false;

  return (
    // Disabled rows stay in place, dimmed — their position is what `enabled`
    // exists to preserve, so they never move to a separate list. The outer
    // element is no longer the flex row itself (it now also hosts the
    // input-mapping panel below it), so drag styling and dimming move here
    // and `[&>*]:invisible` hides both the row and the panel while dragging.
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[10px] border border-line-soft bg-surface ${
        isDragging ? "!border-2 !border-dashed !border-accent bg-paper [&>*]:invisible" : ""
      } ${!enabled ? "opacity-45" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span {...attributes} {...listeners} className="cursor-grab text-ink-45" title="Drag to reorder">
          ⠿
        </span>
        {isPrimary && <span className="st-chip-mono bg-published text-published-ink">Primary</span>}
        <span className="st-chip-mono bg-surface text-ink-45">{actionKindLabel(action)}</span>
        <input
          className="st-input min-w-0 flex-1 py-1 text-[12.5px]"
          aria-label={`Label for ${actionKindLabel(action).toLowerCase()} action`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const trimmed = label.trim();
            if (!trimmed || trimmed === action.label) {
              setLabel(action.label);
              return;
            }
            onCommitLabel(trimmed);
          }}
        />
        {action.type === "screen_flow" && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className="shrink-0 rounded-[8px] border border-dashed border-line px-2 py-1 text-[11px] text-ink-45 hover:text-ink"
          >
            {expanded ? "Close" : "Map inputs"}
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? "Disable" : "Enable"} ${action.label}`}
          onClick={onToggleEnabled}
          className={`h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-line"}`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        {/* update_record has no remove control: card.tsx:575 only falls back to
            the legacy "Edit fields" button when `actions` is EMPTY, so removing
            the sole update_record from a non-empty array leaves the card with
            no edit affordance at all. The on/off switch is the footgun-free
            equivalent — it lets an admin turn update_record off while keeping
            its position, label, and the ability to re-enable it. Matches the
            same carve-out in builder/canvas.tsx (`action.type !== "update_record"`
            guarding its remove button). Do not "restore consistency" here. */}
        {action.type !== "update_record" && (
          <button
            type="button"
            className="text-ink-45 hover:text-drift-ink"
            aria-label={`Remove ${action.label}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      {!enabled && (
        <p className="px-3 pb-2 text-[11px] text-ink-45">
          {action.type === "screen_flow" || action.type === "quick_action"
            ? "Hidden from the card, and the model won't run it if a rep asks in chat."
            : "Hidden from the card — the model can still do this if a rep asks in chat."}
        </p>
      )}
      {action.type === "screen_flow" && expanded && (
        <div className="border-t border-line-soft px-3 py-2.5">
          <ActionInputsEditor
            variables={inputVariables}
            value={action.inputs}
            onChange={(next) => onInputsChange?.(next)}
          />
        </div>
      )}
    </div>
  );
}

/** One source's group in the add picker — builtin, quick actions, or screen flows. */
function SourceGroup({
  source,
  isConfigured,
  onPick,
}: {
  source: ActionSource;
  isConfigured: (ref: ActionRef) => boolean;
  onPick: (entry: DiscoveredAction) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="st-section-label">{SOURCE_LABEL[source.kind]}</div>
      {source.unavailable ? (
        // Read failure — still a teaching state, never an error banner: the
        // admin just can't add from this source right now.
        <p className="mt-1 text-[11.5px] text-ink-45">{source.unavailable}</p>
      ) : source.entries.length === 0 ? (
        <p className="mt-1 text-[11.5px] text-ink-45">
          {EMPTY_TEACHING_COPY[source.kind] ?? "Nothing here yet."}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {source.entries.map((entry) => (
            <EntryChip
              key={refKey(entry.ref)}
              entry={entry}
              crmDiscovered={isCrmDiscovered(source.kind)}
              configured={isConfigured(entry.ref)}
              onPick={() => onPick(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryChip({
  entry,
  crmDiscovered,
  configured,
  onPick,
}: {
  entry: DiscoveredAction;
  crmDiscovered: boolean;
  configured: boolean;
  onPick: () => void;
}) {
  // Already-configured entries render checked and DISABLED, not hidden —
  // the admin can see everything the CRM offers and why an entry can't be
  // added again (this also keeps a second `update_record` from ever being
  // offered; a duplicate would collide in the card's React key).
  const className = configured
    ? "flex items-center gap-1 rounded-[8px] border border-line-soft bg-paper px-2.5 py-1 text-[11.5px] text-ink-45 cursor-not-allowed"
    : crmDiscovered
      ? "flex items-center gap-1 rounded-[8px] border border-transparent bg-crmmeta px-2.5 py-1 text-[11.5px] text-crmmeta-ink hover:opacity-80"
      : "flex items-center gap-1 rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink";
  return (
    <button
      type="button"
      disabled={configured}
      onClick={onPick}
      title={configured ? `${entry.label} is already on this card` : undefined}
      className={className}
    >
      <span aria-hidden="true">{configured ? "✓" : "+"}</span>
      {entry.label}
    </button>
  );
}
