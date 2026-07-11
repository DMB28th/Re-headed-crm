"use client";
/**
 * Center canvas (2a): header block, drag-sortable field chips per section,
 * column segmented control, editable toggles, related lists + actions blocks.
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LayoutConfig, LayoutField, ObjectDescribe } from "@cardstack/core";

type SetConfig = (updater: (prev: LayoutConfig | null) => LayoutConfig | null) => void;

export function Canvas({
  config,
  describe,
  onChange,
}: {
  config: LayoutConfig;
  describe: ObjectDescribe;
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

  const onDragEnd = (event: DragEndEvent) => {
    const activeApi = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeApi === overId) return;
    mutateSections((sections) => {
      const from = sections.findIndex((s) => s.fields.some((f) => f.api === activeApi));
      if (from < 0) return sections;
      const field = sections[from]!.fields.find((f) => f.api === activeApi)!;
      sections[from]!.fields = sections[from]!.fields.filter((f) => f.api !== activeApi);
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
        {config.recordCard.sections.map((section, sectionIdx) => (
          <div key={`${sectionIdx}-${section.label}`} className="st-card mt-3 p-3" id={`section-${sectionIdx}`}>
            <div className="flex items-center justify-between gap-2">
              <input
                className="st-input py-1 text-[12.5px] font-medium"
                value={section.label}
                onChange={(e) =>
                  mutateSections((sections) => {
                    sections[sectionIdx]!.label = e.target.value;
                    return sections;
                  })
                }
              />
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
          </div>
        ))}
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
        <span className="st-section-label">Related lists</span>
        {config.recordCard.relatedLists.map((rel, i) => (
          <div key={rel.relationship} className="mt-2 flex items-center justify-between text-[12px]">
            <span>
              {rel.relationship.replace(/_/g, " ")} · cols: {rel.columns.join(", ")}
            </span>
            <label className="flex items-center gap-1.5 text-[11.5px] text-ink-55">
              show
              <select
                className="st-input py-0.5 text-[11.5px]"
                value={rel.limit}
                onChange={(e) =>
                  onChange((prev) => {
                    if (!prev) return prev;
                    const relatedLists = structuredClone(prev.recordCard.relatedLists);
                    relatedLists[i]!.limit = Number(e.target.value);
                    return { ...prev, recordCard: { ...prev.recordCard, relatedLists } };
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
          </div>
        ))}
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
