"use client";
/**
 * Center canvas (2a): header block, drag-sortable sections and field chips,
 * column segmented control, editable toggles, related-list picker (3b),
 * actions block. Section cards and field chips sort in ONE DndContext —
 * section ids use the reserved "sec-" prefix; field ids are field APIs.
 */
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
import Link from "next/link";
import { useState } from "react";
import type { FieldDescribe, LayoutConfig, LayoutField, ObjectDescribe } from "@cardstack/core";
import { crmDisplayLabel } from "../../lib/crm-label";

type SetConfig = (updater: (prev: LayoutConfig | null) => LayoutConfig | null) => void;

export function Canvas({
  config,
  describe,
  relatedDescribes,
  onChange,
}: {
  config: LayoutConfig;
  describe: ObjectDescribe;
  relatedDescribes: Record<string, ObjectDescribe>;
  onChange: SetConfig;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const labelOf = (api: string) => describe.fields.find((f) => f.api === api)?.label ?? api;
  const crmLabel = crmDisplayLabel(config.crm);
  // Ghost chip / ghost section for the DragOverlay (2a mid-drag feedback).
  const [dragging, setDragging] = useState<
    { kind: "field"; api: string } | { kind: "section"; index: number } | null
  >(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const totalFields = config.recordCard.sections.reduce((n, s) => n + s.fields.length, 0);

  const mutateSections = (
    fn: (sections: LayoutConfig["recordCard"]["sections"]) => LayoutConfig["recordCard"]["sections"],
  ) =>
    onChange((prev) =>
      prev
        ? { ...prev, recordCard: { ...prev.recordCard, sections: fn(structuredClone(prev.recordCard.sections)) } }
        : prev,
    );

  const mutateRelatedLists = (
    fn: (lists: LayoutConfig["recordCard"]["relatedLists"]) => LayoutConfig["recordCard"]["relatedLists"],
  ) =>
    onChange((prev) =>
      prev
        ? {
            ...prev,
            recordCard: { ...prev.recordCard, relatedLists: fn(structuredClone(prev.recordCard.relatedLists)) },
          }
        : prev,
    );

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setDragging(
      id.startsWith("sec-") ? { kind: "section", index: Number(id.slice(4)) } : { kind: "field", api: id },
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    // Section reorder: both ids carry the reserved "sec-" prefix.
    if (activeId.startsWith("sec-")) {
      if (!overId.startsWith("sec-")) return;
      const from = Number(activeId.slice(4));
      const to = Number(overId.slice(4));
      mutateSections((sections) => arrayMove(sections, from, to));
      return;
    }

    // Field move (within or across sections).
    mutateSections((sections) => {
      const from = sections.findIndex((s) => s.fields.some((f) => f.api === activeId));
      if (from < 0) return sections;
      const field = sections[from]!.fields.find((f) => f.api === activeId)!;
      sections[from]!.fields = sections[from]!.fields.filter((f) => f.api !== activeId);
      // Dropping over a section card (not a chip) yields its "sec-N" sortable id →
      // append to the end of that section. Over a chip → insert before it.
      const toSection = overId.startsWith("sec-")
        ? Number(overId.slice(4))
        : sections.findIndex((s) => s.fields.some((f) => f.api === overId));
      if (toSection < 0 || !sections[toSection]) return sections;
      const overIndex = sections[toSection]!.fields.findIndex((f) => f.api === overId);
      if (overIndex < 0) sections[toSection]!.fields.push(field);
      else sections[toSection]!.fields.splice(overIndex, 0, field);
      // Empty sections are dropped (matches the denylist-filter rule server-side).
      return sections.filter((s) => s.fields.length > 0);
    });
  };

  const header = config.recordCard.header;
  const headerSlot = (slot: "title" | "subtitle" | "badge") => (
    <label className="flex items-center gap-1.5 text-[11.5px] text-ink-55">
      {slot}
      <select
        className="st-input py-1 text-[11.5px]"
        value={header[slot] ?? ""}
        onChange={(e) =>
          onChange((prev) =>
            prev
              ? {
                  ...prev,
                  recordCard: {
                    ...prev.recordCard,
                    header: {
                      ...prev.recordCard.header,
                      ...(slot === "title"
                        ? { title: e.target.value }
                        : { [slot]: e.target.value || undefined }),
                    },
                  },
                }
              : prev,
          )
        }
      >
        {slot !== "title" && <option value="">—</option>}
        {describe.fields.map((f) => (
          <option key={f.api} value={f.api}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );

  const unconfiguredRelationships = describe.relationships.filter(
    (rel) => !config.recordCard.relatedLists.some((r) => r.relationship === rel.api),
  );

  return (
    <section className="min-w-[340px] flex-1 overflow-y-auto">
      <div className="st-card p-3">
        <div className="flex items-center justify-between">
          <span className="st-section-label">Header · always first</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {headerSlot("title")}
          {headerSlot("subtitle")}
          {headerSlot("badge")}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={config.recordCard.sections.map((_, i) => `sec-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          {config.recordCard.sections.map((section, sectionIdx) => (
            <SectionCard key={`sec-${sectionIdx}`} sectionIdx={sectionIdx}>
              {(grip) => (
                <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {grip}
                  <input
                    className="st-input min-w-0 flex-1 py-1 text-[12.5px] font-medium"
                    value={section.label}
                    onChange={(e) =>
                      mutateSections((sections) => {
                        sections[sectionIdx]!.label = e.target.value;
                        return sections;
                      })
                    }
                  />
                </span>
                <span className="flex items-center gap-1">
                  {([1, 2, 3] as const).map((cols) => (
                    <button
                      key={cols}
                      type="button"
                      className={`rounded-[7px] border px-2 py-0.5 text-[11px] ${
                        section.columns === cols
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink-55"
                      }`}
                      onClick={() =>
                        mutateSections((sections) => {
                          sections[sectionIdx]!.columns = cols;
                          return sections;
                        })
                      }
                    >
                      {cols}
                    </button>
                  ))}
                </span>
              </div>

              <SortableContext
                items={section.fields.map((f) => f.api)}
                strategy={verticalListSortingStrategy}
              >
                <div className="mt-2 space-y-1.5">
                  {section.fields.map((field) => (
                    <FieldChip
                      key={field.api}
                      field={field}
                      label={labelOf(field.api)}
                      describeField={describe.fields.find((f) => f.api === field.api)}
                      object={config.object}
                      crmLabel={crmLabel}
                      denied={config.permissions.fieldDenylist.includes(field.api)}
                      onToggleEditable={() =>
                        mutateSections((sections) => {
                          const target = sections[sectionIdx]!.fields.find((f) => f.api === field.api)!;
                          target.editable = !target.editable;
                          return sections;
                        })
                      }
                      onToggleRequired={() =>
                        mutateSections((sections) => {
                          const target = sections[sectionIdx]!.fields.find((f) => f.api === field.api)!;
                          target.required = !target.required;
                          return sections;
                        })
                      }
                      onRemove={() =>
                        mutateSections((sections) => {
                          sections[sectionIdx]!.fields = sections[sectionIdx]!.fields.filter(
                            (f) => f.api !== field.api,
                          );
                          return sections.filter((s) => s.fields.length > 0);
                        })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
                </>
              )}
            </SectionCard>
          ))}
        </SortableContext>

        {/* Ghost chip follows the pointer; the in-list slot renders as the
            2px dashed accent drop indicator (design 2a). */}
        <DragOverlay dropAnimation={null}>
          {dragging?.kind === "field" && (
            <div className="flex cursor-grabbing items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-lg">
              <span className="text-ink-45">⠿</span>
              <span>{labelOf(dragging.api)}</span>
              <span className="st-chip-mono bg-paper text-ink-45">{dragging.api}</span>
            </div>
          )}
          {dragging?.kind === "section" && (
            <div className="st-card cursor-grabbing p-3 shadow-lg">
              <span className="flex items-center gap-2 text-[12.5px] font-medium">
                <span className="text-ink-45">⠿</span>
                {config.recordCard.sections[dragging.index]?.label ?? "Section"}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        className="mt-3 w-full rounded-[10px] border border-dashed border-line px-3 py-2 text-[12px] text-ink-45 hover:text-ink"
        onClick={() =>
          mutateSections((sections) => {
            const unused = describe.fields.find(
              (f) => !sections.some((s) => s.fields.some((sf) => sf.api === f.api)),
            );
            sections.push({
              label: `Section ${sections.length + 1}`,
              columns: 2,
              fields: [{ api: unused?.api ?? describe.fields[0]!.api, editable: false }],
            });
            return sections;
          })
        }
      >
        + Add section
      </button>

      {totalFields > 15 && !nudgeDismissed && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-[10px] bg-draft p-3 text-[11.5px] text-draft-ink">
          <span>
            This card has {totalFields} fields — cards over ~15 work better split by audience.{" "}
            <Link href={`/objects/${config.object}/assignment`} className="underline">
              Assignment
            </Link>
          </span>
          <button
            type="button"
            className="opacity-70 hover:opacity-100"
            aria-label="Dismiss field-count nudge"
            onClick={() => setNudgeDismissed(true)}
          >
            ×
          </button>
        </div>
      )}

      <div className="st-card mt-3 p-3">
        <div className="flex items-center justify-between">
          <span className="st-section-label">Related lists</span>
        </div>
        {config.recordCard.relatedLists.length === 0 && (
          <p className="mt-2 text-[11.5px] text-ink-45">
            None yet — related lists show associated records (contacts on a deal, deals on a
            company) at the bottom of the card.
          </p>
        )}
        {config.recordCard.relatedLists.map((rel, i) => {
          const relDescribe = relatedDescribes[rel.relationship];
          const relLabel =
            describe.relationships.find((r) => r.api === rel.relationship)?.label ??
            rel.relationship.replace(/_/g, " ");
          return (
            <div key={rel.relationship} className="mt-2 rounded-[8px] border border-line-soft p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium">{relLabel}</span>
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11.5px] text-ink-55">
                    show
                    <select
                      className="st-input py-0.5 text-[11.5px]"
                      value={rel.limit}
                      onChange={(e) =>
                        mutateRelatedLists((lists) => {
                          lists[i]!.limit = Number(e.target.value);
                          return lists;
                        })
                      }
                    >
                      {[3, 5, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="text-ink-45 hover:text-drift-ink"
                    aria-label={`Remove ${relLabel} related list`}
                    onClick={() => mutateRelatedLists((lists) => lists.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              </div>
              {relDescribe && (
                <ColumnPicker
                  describe={relDescribe}
                  columns={rel.columns}
                  onChange={(columns) =>
                    mutateRelatedLists((lists) => {
                      lists[i]!.columns = columns;
                      return lists;
                    })
                  }
                />
              )}
            </div>
          );
        })}
        {unconfiguredRelationships.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unconfiguredRelationships.map((rel) => (
              <button
                key={rel.api}
                type="button"
                className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink"
                onClick={() =>
                  mutateRelatedLists((lists) => {
                    const relDescribe = relatedDescribes[rel.api];
                    const columns = (relDescribe?.fields ?? []).slice(0, 3).map((f) => f.api);
                    return [
                      ...lists,
                      {
                        object: rel.relatedObject,
                        relationship: rel.api,
                        columns: columns.length > 0 ? columns : ["name"],
                        limit: 5,
                      },
                    ];
                  })
                }
              >
                + {rel.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="st-card mt-3 p-3">
        <span className="st-section-label">Actions</span>
        <p className="mt-1 text-[11.5px] text-ink-55">
          The buttons on the card's footer. “Save changes” submits the rep's edits (with the
          confirmation diff); “create related” opens a prefilled new-record form in chat.
        </p>
        <div className="mt-2 space-y-1.5">
          {config.recordCard.actions.map((action, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="st-chip-mono bg-paper text-ink-45">
                {action.type === "update_record"
                  ? "save"
                  : action.type === "create_related"
                    ? `create ${action.object}`
                    : "flow"}
              </span>
              <input
                className="st-input flex-1 py-1 text-[12px]"
                value={action.label}
                onChange={(e) =>
                  onChange((prev) => {
                    if (!prev) return prev;
                    const actions = structuredClone(prev.recordCard.actions);
                    actions[i]!.label = e.target.value;
                    return { ...prev, recordCard: { ...prev.recordCard, actions } };
                  })
                }
              />
              {action.type !== "update_record" && (
                <button
                  type="button"
                  className="text-ink-45 hover:text-drift-ink"
                  aria-label={`Remove ${action.label}`}
                  onClick={() =>
                    onChange((prev) =>
                      prev
                        ? {
                            ...prev,
                            recordCard: {
                              ...prev.recordCard,
                              actions: prev.recordCard.actions.filter((_, j) => j !== i),
                            },
                          }
                        : prev,
                    )
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {describe.relationships
            .filter(
              (rel) =>
                !config.recordCard.actions.some(
                  (a) => a.type === "create_related" && a.object === rel.relatedObject,
                ),
            )
            .map((rel) => (
              <button
                key={rel.api}
                type="button"
                className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink"
                onClick={() =>
                  onChange((prev) =>
                    prev
                      ? {
                          ...prev,
                          recordCard: {
                            ...prev.recordCard,
                            actions: [
                              ...prev.recordCard.actions,
                              {
                                type: "create_related",
                                object: rel.relatedObject,
                                label: `Add ${rel.label.replace(/s$/, "").toLowerCase()}`,
                              },
                            ],
                          },
                        }
                      : prev,
                  )
                }
              >
                + create {rel.label.toLowerCase()}
              </button>
            ))}
          <span className="text-[11px] text-ink-45">🔒 trust line is not removable</span>
        </div>
      </div>
    </section>
  );
}

/**
 * Related-list column picker: selected chips + a search box — real portals
 * have hundreds of properties, a chip wall is unusable (feedback round 2).
 */
function ColumnPicker({
  describe,
  columns,
  onChange,
}: {
  describe: ObjectDescribe;
  columns: string[];
  onChange: (columns: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const labelOf = (api: string) => describe.fields.find((f) => f.api === api)?.label ?? api;
  const matches = query
    ? describe.fields
        .filter(
          (f) =>
            !columns.includes(f.api) &&
            (f.label.toLowerCase().includes(query.toLowerCase()) ||
              f.api.toLowerCase().includes(query.toLowerCase())),
        )
        .slice(0, 8)
    : [];

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ink-45">columns</span>
        {columns.map((api) => (
          <span
            key={api}
            className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent px-2 py-0.5 text-[11px] text-white"
          >
            {labelOf(api)}
            <button
              type="button"
              className="opacity-70 hover:opacity-100"
              aria-label={`Remove column ${labelOf(api)}`}
              title={columns.length === 1 ? "At least one column" : undefined}
              onClick={() => {
                if (columns.length > 1) onChange(columns.filter((c) => c !== api));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="search"
          className="st-input w-[180px] py-0.5 text-[11.5px]"
          placeholder={`Search ${describe.fields.length} fields…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {matches.map((field) => (
            <button
              key={field.api}
              type="button"
              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-55 hover:border-accent hover:text-ink"
              title={field.api}
              onClick={() => {
                onChange([...columns, field.api]);
                setQuery("");
              }}
            >
              + {field.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sortable wrapper for a section card ("sec-N" id namespace). The drag handle
 * is passed to children so listeners live on the grip only — the label input
 * stays typeable.
 */
function SectionCard({
  sectionIdx,
  children,
}: {
  sectionIdx: number;
  children: (grip: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sec-${sectionIdx}`,
  });
  const grip = (
    <span
      {...attributes}
      {...listeners}
      className="cursor-grab text-ink-45"
      title="Drag to reorder sections"
    >
      ⠿
    </span>
  );
  return (
    // While dragging, the in-list slot becomes the drop indicator: a 2px
    // dashed accent outline with invisible contents (the ghost is in the
    // DragOverlay).
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`st-card mt-3 p-3 ${
        isDragging ? "!border-2 !border-dashed !border-accent bg-paper [&>*]:invisible" : ""
      }`}
      id={`section-${sectionIdx}`}
    >
      {children(grip)}
    </div>
  );
}

function FieldChip({
  field,
  label,
  describeField,
  object,
  crmLabel,
  denied,
  onToggleEditable,
  onToggleRequired,
  onRemove,
}: {
  field: LayoutField;
  label: string;
  describeField: FieldDescribe | undefined;
  object: string;
  crmLabel: string;
  denied: boolean;
  onToggleEditable: () => void;
  onToggleRequired: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.api,
  });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const crmReadOnly = describeField?.readOnly ?? false;
  // A field the layout references but the portal's schema no longer has — it
  // renders an em dash on the card. Dot-paths (parent fields) and the
  // synthesized display name aren't drift.
  const drift = !describeField && !field.api.includes(".") && field.api !== "__display_name";
  const crmRequired = describeField?.required ?? false;
  const layoutRequired = field.required ?? false;
  // Either CRM-required or admin-marked-required locks the field on the card and
  // blocks clearing it from chat (server-enforced).
  const required = crmRequired || layoutRequired;
  const requiredTitle = crmRequired
    ? `Required in ${crmLabel} — records can't be saved without it, so it can't leave the card.`
    : "Marked required on this card — reps can't clear it from chat.";

  return (
    // While dragging, the in-list slot becomes the drop indicator: a 2px
    // dashed accent outline with invisible contents (ghost is in the overlay).
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-center justify-between rounded-[8px] border border-line-soft bg-surface px-2.5 py-1.5 ${
        isDragging ? "!border-2 !border-dashed !border-accent bg-paper [&>*]:invisible" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-[12px]">
        <span {...attributes} {...listeners} className="cursor-grab text-ink-45" title="Drag to reorder">
          ⠿
        </span>
        <button
          type="button"
          className="inline-block max-w-[180px] truncate text-left hover:underline"
          title={label}
          onClick={() => setPopoverOpen((o) => !o)}
        >
          {label}
        </button>
        {/* Real portals have very long internal names — truncate, full name on hover. */}
        <span
          className="st-chip-mono inline-block max-w-[140px] truncate bg-paper text-ink-45"
          title={field.api}
        >
          {field.api}
        </span>
        {required && (
          <span className="st-chip-mono bg-draft text-draft-ink" title={requiredTitle}>
            {crmRequired ? `Required · ${crmLabel}` : "Required"}
          </span>
        )}
        {drift && (
          <span
            className="st-chip-mono bg-drift text-drift-ink"
            title={`Not in ${crmLabel}'s schema — this field renders as an em dash. Remove it?`}
          >
            Not in {crmLabel}
          </span>
        )}
        {denied && <span className="st-chip-mono bg-drift text-drift-ink">denylisted</span>}
      </span>
      <span className="flex items-center gap-2">
        {crmReadOnly ? (
          <span className="text-[10.5px] text-ink-45">Read-only · CRM</span>
        ) : (
          <button
            type="button"
            onClick={onToggleEditable}
            className={`st-chip-mono border ${
              field.editable
                ? "border-transparent bg-published text-published-ink"
                : "border-line bg-surface text-ink-55"
            }`}
            title="Reps can edit this field from chat"
          >
            {field.editable ? "Editable" : "Read-only"}
          </button>
        )}
        <button
          type="button"
          onClick={required ? undefined : onRemove}
          disabled={required}
          className={required ? "cursor-not-allowed text-ink-45 opacity-40" : "text-ink-45 hover:text-drift-ink"}
          aria-label={required ? `${label} is required and can't be removed` : `Remove ${label}`}
          title={required ? requiredTitle : undefined}
        >
          ×
        </button>
      </span>

      {popoverOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPopoverOpen(false)} />
          <div className="absolute left-6 top-full z-30 mt-1 w-[300px] rounded-[10px] border border-line bg-surface p-3 shadow-lg">
            <div className="text-[12.5px] font-medium">{label}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="st-chip-mono bg-paper text-ink-45">{field.api}</span>
              <span className="st-chip-mono bg-paper text-ink-45">
                {describeField?.type ?? "unknown"}
              </span>
              {required && (
                <span className="st-chip-mono bg-draft text-draft-ink">
                  {crmRequired ? `Required · ${crmLabel}` : "Required"}
                </span>
              )}
              {drift && <span className="st-chip-mono bg-drift text-drift-ink">Not in {crmLabel}</span>}
            </div>
            {drift ? (
              <p className="mt-2 text-[11.5px] leading-snug text-drift-ink">
                This field isn't in {crmLabel}'s schema — the card shows an em dash for it. Remove it
                with the × on the chip.
              </p>
            ) : (
              <p className="mt-2 text-[11.5px] leading-snug text-ink-55">
                {describeField?.description ||
                  `No description in ${crmLabel} — the model, rep tooltips and coverage all read this metadata.`}
              </p>
            )}
            {required && (
              <p className="mt-1.5 text-[11px] text-draft-ink">Can't be saved empty from chat.</p>
            )}
            {crmReadOnly ? (
              <p className="mt-2 text-[11px] text-ink-45">Read-only · {crmLabel} field security.</p>
            ) : (
              <>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[12px]">Reps can edit</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={field.editable}
                    aria-label={`Reps can edit ${label}`}
                    onClick={onToggleEditable}
                    className={`h-5 w-9 rounded-full transition-colors ${field.editable ? "bg-accent" : "bg-line"}`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition-transform ${field.editable ? "translate-x-4" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
                {/* Admin-marked required (enforced server-side). Hidden when the
                    CRM already requires it — that's non-negotiable, not a toggle. */}
                {field.editable && !crmRequired && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[12px]">
                      Required — can't be cleared from chat
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={layoutRequired}
                      aria-label={`Required from chat: ${label}`}
                      onClick={onToggleRequired}
                      className={`h-5 w-9 rounded-full transition-colors ${layoutRequired ? "bg-accent" : "bg-line"}`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${layoutRequired ? "translate-x-4" : "translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                )}
              </>
            )}
            <Link
              href={`/objects/${object}/permissions`}
              className="mt-2.5 block text-[11.5px] text-ink-55 underline underline-offset-2 hover:text-ink"
            >
              {denied ? "Denylisted — manage in Permissions" : "Denylist fields in Permissions"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
