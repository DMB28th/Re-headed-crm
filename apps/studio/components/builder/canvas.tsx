"use client";
/**
 * Center canvas (2a): header block, drag-sortable sections and field chips,
 * column segmented control, editable toggles, related-list picker (3b),
 * actions block. Section cards and field chips sort in ONE DndContext —
 * section ids use the reserved "sec-" prefix; field ids are field APIs.
 */
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
import type { LayoutConfig, LayoutField, ObjectDescribe } from "@cardstack/core";

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

  const onDragEnd = (event: DragEndEvent) => {
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
      const toSection = overId.startsWith("section-")
        ? Number(overId.slice("section-".length))
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
    <section className="min-w-0 flex-1 overflow-y-auto">
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={config.recordCard.sections.map((_, i) => `sec-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          {config.recordCard.sections.map((section, sectionIdx) => (
            <SectionCard key={`${sectionIdx}-${section.label}`} sectionIdx={sectionIdx}>
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
                      crmReadOnly={describe.fields.find((f) => f.api === field.api)?.readOnly ?? false}
                      denied={config.permissions.fieldDenylist.includes(field.api)}
                      onToggleEditable={() =>
                        mutateSections((sections) => {
                          const target = sections[sectionIdx]!.fields.find((f) => f.api === field.api)!;
                          target.editable = !target.editable;
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-45">columns</span>
                  {relDescribe.fields.map((field) => {
                    const on = rel.columns.includes(field.api);
                    return (
                      <button
                        key={field.api}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          on ? "border-accent bg-accent text-white" : "border-line text-ink-55"
                        }`}
                        title={on && rel.columns.length === 1 ? "At least one column" : field.label}
                        onClick={() =>
                          mutateRelatedLists((lists) => {
                            const cols = lists[i]!.columns;
                            if (on) {
                              if (cols.length === 1) return lists; // keep ≥1 column
                              lists[i]!.columns = cols.filter((c) => c !== field.api);
                            } else {
                              lists[i]!.columns = [...cols, field.api];
                            }
                            return lists;
                          })
                        }
                      >
                        {field.label}
                      </button>
                    );
                  })}
                </div>
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
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          {config.recordCard.actions.map((action) => (
            <span key={action.label} className="rounded-full border border-line px-2.5 py-0.5">
              {action.label}
            </span>
          ))}
          <span className="text-[11px] text-ink-45">🔒 trust line is not removable</span>
        </div>
      </div>
    </section>
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
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`st-card mt-3 p-3 ${isDragging ? "opacity-60 shadow-md" : ""}`}
      id={`section-${sectionIdx}`}
    >
      {children(grip)}
    </div>
  );
}

function FieldChip({
  field,
  label,
  crmReadOnly,
  denied,
  onToggleEditable,
  onRemove,
}: {
  field: LayoutField;
  label: string;
  crmReadOnly: boolean;
  denied: boolean;
  onToggleEditable: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.api,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between rounded-[8px] border border-line-soft bg-surface px-2.5 py-1.5 ${
        isDragging ? "opacity-60 shadow-md" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-[12px]">
        <span {...attributes} {...listeners} className="cursor-grab text-ink-45" title="Drag to reorder">
          ⠿
        </span>
        {label}
        <span className="st-chip-mono bg-paper text-ink-45">{field.api}</span>
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
        <button type="button" onClick={onRemove} className="text-ink-45 hover:text-drift-ink" aria-label={`Remove ${label}`}>
          ×
        </button>
      </span>
    </div>
  );
}
