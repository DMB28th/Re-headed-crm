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
import { useEffect, useState } from "react";
import type {
  ActionContextKey,
  ActionInputMapping,
  ActionInputMappings,
  ActionInputValueType,
  CardAction,
  FieldDescribe,
  FlowInputVariable,
  FlowRenderModeConfig,
  FlowSummary,
  LayoutConfig,
  LayoutField,
  ObjectDescribe,
} from "@cardstack/core";
import { crmDisplayLabel } from "../../lib/crm-label";

type SetConfig = (updater: (prev: LayoutConfig | null) => LayoutConfig | null) => void;

interface FlowCatalogResponse {
  flows: FlowSummary[];
  modes: FlowRenderModeConfig[];
  error?: string;
}

type ScreenFlowAction = Extract<CardAction, { type: "screen_flow" }>;
type ActionInputSource = ActionInputMapping["source"];

const CONTEXT_KEYS: { value: ActionContextKey; label: string }[] = [
  { value: "recordId", label: "Current record id" },
  { value: "objectApiName", label: "Current object" },
  { value: "crm", label: "CRM kind" },
  { value: "tenantId", label: "Tenant" },
  { value: "userId", label: "Current user id" },
  { value: "userEmail", label: "Current user email" },
  { value: "audience", label: "Audience" },
  { value: "actionSessionId", label: "Action session" },
];

const INPUT_SOURCES: { value: ActionInputSource; label: string }[] = [
  { value: "context", label: "Context" },
  { value: "field", label: "Record field" },
  { value: "literal", label: "Literal" },
  { value: "ask", label: "Ask rep" },
  { value: "selection", label: "Selected rows" },
];

const VALUE_TYPES: { value: ActionInputValueType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date/time" },
  { value: "recordId", label: "Record id" },
  { value: "recordIds", label: "Record ids" },
  { value: "json", label: "JSON" },
];

function valueTypePatch(valueType: ActionInputValueType | undefined) {
  return valueType ? { valueType } : {};
}

function defaultMappingForSource(
  source: ActionInputSource,
  describe: ObjectDescribe,
  previous?: ActionInputMapping,
): ActionInputMapping {
  const previousValueType =
    previous && "valueType" in previous && previous.valueType !== "recordIds"
      ? previous.valueType
      : undefined;
  if (source === "context") {
    return { source, key: "recordId", ...valueTypePatch(previousValueType ?? "recordId") };
  }
  if (source === "field") {
    return {
      source,
      field: describe.fields[0]?.api ?? "id",
      ...valueTypePatch(previousValueType),
    };
  }
  if (source === "literal") {
    return { source, value: "", ...valueTypePatch(previousValueType ?? "string") };
  }
  if (source === "selection") {
    const relationship = describe.relationships[0];
    return {
      source,
      ...(relationship ? { object: relationship.relatedObject, relationship: relationship.api } : {}),
      valueType: "recordIds",
      required: false,
    };
  }
  return {
    source: "ask",
    prompt: "Ask the rep for this value",
    valueType: previousValueType ?? "string",
    required: true,
  };
}

function inferMappingForVariable(variable: FlowInputVariable, describe: ObjectDescribe): ActionInputMapping {
  const name = variable.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const label = variable.label ?? variable.name;
  if (name === "recordid" || name === "currentrecordid") {
    return { source: "context", key: "recordId", valueType: variable.valueType ?? "recordId" };
  }
  if (name === "objectapiname" || name === "objectname") {
    return { source: "context", key: "objectApiName", valueType: variable.valueType ?? "string" };
  }
  if (name === "userid" || name === "currentuserid" || name === "ownerid") {
    return { source: "context", key: "userId", valueType: variable.valueType ?? "recordId" };
  }
  const field = describe.fields.find(
    (candidate) =>
      candidate.api.toLowerCase().replace(/[^a-z0-9]/g, "") === name ||
      candidate.label.toLowerCase().replace(/[^a-z0-9]/g, "") === name,
  );
  if (field) {
    return { source: "field", field: field.api, ...valueTypePatch(variable.valueType) };
  }
  return {
    source: "ask",
    prompt: `Ask for ${label.toLowerCase()}`,
    valueType: variable.valueType ?? "string",
    required: variable.required ?? true,
  };
}

function defaultInputsForFlow(flow: FlowSummary, describe: ObjectDescribe): ActionInputMappings {
  const variables =
    flow.inputVariables && flow.inputVariables.length > 0
      ? flow.inputVariables
      : [
          { name: "recordId", label: "Record ID", valueType: "recordId", required: true },
          { name: "objectApiName", label: "Object API name", valueType: "string", required: true },
        ] satisfies FlowInputVariable[];
  return Object.fromEntries(
    variables.map((variable) => [variable.name, inferMappingForVariable(variable, describe)]),
  ) as ActionInputMappings;
}

function nextInputName(inputs: ActionInputMappings): string {
  let i = 1;
  while (inputs[`input${i}`]) i += 1;
  return `input${i}`;
}

function parseLiteralValue(value: string, valueType: ActionInputValueType | undefined) {
  if (valueType === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (valueType === "boolean") return value.toLowerCase() === "true";
  if (valueType === "json") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return value;
}

function mappingSummary(mapping: ActionInputMapping, labelOf: (api: string) => string): string {
  if (mapping.source === "context") {
    return CONTEXT_KEYS.find((option) => option.value === mapping.key)?.label ?? mapping.key;
  }
  if (mapping.source === "field") return labelOf(mapping.field);
  if (mapping.source === "literal") return String(mapping.value ?? "");
  if (mapping.source === "selection") return mapping.relationship ? `Selected ${mapping.relationship}` : "Selected rows";
  return mapping.prompt;
}

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
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [flowModes, setFlowModes] = useState<FlowRenderModeConfig[]>([]);
  const totalFields = config.recordCard.sections.reduce((n, s) => n + s.fields.length, 0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/flows");
        const data = (await res.json()) as FlowCatalogResponse;
        if (!cancelled && res.ok && !data.error) {
          setFlows(data.flows);
          setFlowModes(data.modes);
        }
      } catch {
        // Flow actions are optional; the builder still works when the CRM cannot list them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const mutateActions = (
    fn: (actions: LayoutConfig["recordCard"]["actions"]) => LayoutConfig["recordCard"]["actions"],
  ) =>
    onChange((prev) =>
      prev
        ? { ...prev, recordCard: { ...prev.recordCard, actions: fn(structuredClone(prev.recordCard.actions)) } }
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
  const modeForFlow = (flowApiName: string) =>
    flowModes.find((mode) => mode.flowApiName === flowApiName)?.mode ?? "auto";
  const flowLabel = (flowApiName: string) => flows.find((flow) => flow.api === flowApiName)?.label ?? flowApiName;
  const configuredFlowActions = new Set(
    config.recordCard.actions
      .filter((action): action is Extract<CardAction, { type: "screen_flow" }> => action.type === "screen_flow")
      .map((action) => action.flowApiName),
  );
  const availableFlowActions = flows.filter((flow) => !configuredFlowActions.has(flow.api));

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
                  <button
                    type="button"
                    className="ml-1 rounded-[7px] px-1.5 py-0.5 text-[13px] leading-none text-ink-45 hover:text-drift-ink"
                    aria-label={`Delete section ${section.label || sectionIdx + 1}`}
                    title="Delete section"
                    onClick={() =>
                      mutateSections((sections) => sections.filter((_, i) => i !== sectionIdx))
                    }
                  >
                    ×
                  </button>
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
                        ...(rel.foreignKey ? { foreignKey: rel.foreignKey } : {}),
                        columns: columns.length > 0 ? columns : ["Name"],
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="st-section-label">Action components</span>
            <p className="mt-1 text-[11.5px] text-ink-55">
              Buttons and chat calls resolve to the same action. Flows stay governed by the shared
              render policy, then write back through the CRM.
            </p>
          </div>
          <Link href="/flows" className="text-[11.5px] text-ink-45 underline">
            Render policy
          </Link>
        </div>
        <div className="mt-3 grid gap-2">
          {config.recordCard.actions.map((action, i) => {
            const kind =
              action.type === "update_record"
                ? "Record write"
                : action.type === "create_related"
                  ? `Create ${action.object}`
                  : "Screen flow";
            const chatPhrase =
              action.type === "update_record"
                ? "save these changes"
                : action.type === "create_related"
                  ? `create ${action.object.toLowerCase()}`
                  : flowLabel(action.flowApiName).toLowerCase();
            return (
              <div key={`${action.type}-${i}`} className="rounded-[10px] border border-line-soft bg-paper p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-medium">{action.label}</span>
                      <span className="st-chip-mono bg-surface text-ink-45">{kind}</span>
                      <span className="st-chip-mono bg-published text-published-ink">button + chat</span>
                      {action.type === "screen_flow" && (
                        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">
                          {modeForFlow(action.flowApiName)}
                        </span>
                      )}
                      {action.type === "screen_flow" && (
                        <span
                          className="st-chip-mono bg-published text-published-ink"
                          title="Reps can run this flow from chat via the open-in-Salesforce handoff. Native/Embedded modes fall back to handoff."
                        >
                          handoff live
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-55">
                      Button: {action.label} <span className="text-ink-45">/</span> Chat: "{chatPhrase}"
                    </div>
                    {action.type === "screen_flow" && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-45">
                        <span className="st-chip-mono bg-surface text-ink-45">{action.flowApiName}</span>
                        <span>Fallback opens in Salesforce when the host cannot render it.</span>
                      </div>
                    )}
                  </div>
                  {action.type !== "update_record" && (
                    <button
                      type="button"
                      className="text-ink-45 hover:text-drift-ink"
                      aria-label={`Remove ${action.label}`}
                      onClick={() => mutateActions((actions) => actions.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex min-w-[220px] flex-1 items-center gap-1.5 text-[11.5px] text-ink-55">
                    label
                    <input
                      className="st-input min-w-0 flex-1 py-1 text-[12px]"
                      value={action.label}
                      onChange={(e) =>
                        mutateActions((actions) => {
                          actions[i]!.label = e.target.value;
                          return actions;
                        })
                      }
                    />
                  </label>
                  {action.type === "update_record" && (
                    <span className="st-chip-mono bg-surface text-ink-45">confirmation diff locked</span>
                  )}
                </div>
                {action.type === "screen_flow" && (
                  <ActionInputsEditor
                    inputs={action.inputs ?? {}}
                    describe={describe}
                    onChange={(inputs) =>
                      mutateActions((actions) => {
                        const next = actions[i];
                        if (next?.type === "screen_flow") next.inputs = inputs;
                        return actions;
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
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
                    mutateActions((actions) => [
                      ...actions,
                      {
                        type: "create_related",
                        object: rel.relatedObject,
                        label: `Add ${rel.label.replace(/s$/, "").toLowerCase()}`,
                      },
                    ])
                  }
                >
                  + related {rel.label.toLowerCase()}
                </button>
              ))}
            {availableFlowActions.map((flow) => (
              <button
                key={flow.api}
                type="button"
                className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink"
                title={flow.writesSummary}
                onClick={() =>
                  mutateActions((actions) => [
                    ...actions,
                    {
                      type: "screen_flow",
                      flowApiName: flow.api,
                      label: flow.label,
                      embed: "auto",
                      inputs: defaultInputsForFlow(flow, describe),
                    },
                  ])
                }
              >
                + flow {flow.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-45">
            <span>Trust line is not removable.</span>
            <Link href="/custom-screens" className="underline">
              Map unsupported flow screens
            </Link>
          </div>
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
 * Controlled name field: keeps a local editing value and commits on blur. A
 * rejected rename (empty, unchanged, or duplicate) resets to the stored name so
 * the visible text can't desync from the underlying mapping key.
 */
function InputNameField({ name, onRename }: { name: string; onRename: (next: string) => boolean }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return (
    <input
      className="st-input w-[150px] py-1 font-mono text-[11.5px]"
      value={value}
      aria-label={`Input name ${name}`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (!onRename(value)) setValue(name);
      }}
    />
  );
}

function ActionInputsEditor({
  inputs,
  describe,
  onChange,
}: {
  inputs: ActionInputMappings;
  describe: ObjectDescribe;
  onChange: (inputs: ActionInputMappings) => void;
}) {
  const labelOf = (api: string) => describe.fields.find((field) => field.api === api)?.label ?? api;

  const setMapping = (name: string, mapping: ActionInputMapping) => {
    onChange({ ...inputs, [name]: mapping });
  };

  const renameInput = (name: string, nextName: string): boolean => {
    const clean = nextName.trim();
    if (!clean || clean === name || inputs[clean]) return false;
    const next = { ...inputs };
    const mapping = next[name];
    delete next[name];
    if (mapping) next[clean] = mapping;
    onChange(next);
    return true;
  };

  const setValueType = (name: string, mapping: ActionInputMapping, valueType: ActionInputValueType) => {
    if (mapping.source === "selection") return;
    if (mapping.source === "literal") {
      setMapping(name, {
        ...mapping,
        valueType,
        value: parseLiteralValue(String(mapping.value ?? ""), valueType),
      });
      return;
    }
    setMapping(name, { ...mapping, valueType });
  };

  return (
    <div className="mt-3 rounded-[10px] border border-line-soft bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="st-section-label">Inputs</div>
          <p className="mt-1 text-[11px] text-ink-45">
            Resolved once, then passed to the flow and any mapped custom screen.
          </p>
        </div>
        <button
          type="button"
          className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink"
          onClick={() =>
            onChange({
              ...inputs,
              [nextInputName(inputs)]: defaultMappingForSource("context", describe),
            })
          }
        >
          + Add input
        </button>
      </div>

      {Object.keys(inputs).length === 0 && (
        <p className="mt-2 text-[11.5px] text-ink-45">
          No explicit inputs. The runtime will only pass its safe host context.
        </p>
      )}

      <div className="mt-2 space-y-2">
        {Object.entries(inputs).map(([name, mapping]) => (
          <div key={name} className="rounded-[9px] border border-line-soft bg-paper p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <InputNameField
                name={name}
                onRename={(next) => renameInput(name, next)}
              />
              <select
                className="st-input py-1 text-[11.5px]"
                value={mapping.source}
                onChange={(event) =>
                  setMapping(
                    name,
                    defaultMappingForSource(event.target.value as ActionInputSource, describe, mapping),
                  )
                }
              >
                {INPUT_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
              {mapping.source !== "selection" && (
                <select
                  className="st-input py-1 text-[11.5px]"
                  value={("valueType" in mapping && mapping.valueType) || "string"}
                  onChange={(event) =>
                    setValueType(name, mapping, event.target.value as ActionInputValueType)
                  }
                >
                  {VALUE_TYPES.filter((type) => type.value !== "recordIds").map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              )}
              <span className="st-chip-mono bg-surface text-ink-45" title={mappingSummary(mapping, labelOf)}>
                {mappingSummary(mapping, labelOf)}
              </span>
              <button
                type="button"
                className="ml-auto text-ink-45 hover:text-drift-ink"
                aria-label={`Remove input ${name}`}
                onClick={() => {
                  const next = { ...inputs };
                  delete next[name];
                  onChange(next);
                }}
              >
                ×
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {mapping.source === "context" && (
                <select
                  className="st-input min-w-[220px] py-1 text-[11.5px]"
                  value={mapping.key}
                  onChange={(event) =>
                    setMapping(name, { ...mapping, key: event.target.value as ActionContextKey })
                  }
                >
                  {CONTEXT_KEYS.map((key) => (
                    <option key={key.value} value={key.value}>
                      {key.label}
                    </option>
                  ))}
                </select>
              )}
              {mapping.source === "field" && (
                <select
                  className="st-input min-w-[220px] py-1 text-[11.5px]"
                  value={mapping.field}
                  onChange={(event) => setMapping(name, { ...mapping, field: event.target.value })}
                >
                  {describe.fields.map((field) => (
                    <option key={field.api} value={field.api}>
                      {field.label}
                    </option>
                  ))}
                </select>
              )}
              {mapping.source === "literal" && (
                <input
                  className="st-input min-w-[220px] flex-1 py-1 text-[11.5px]"
                  placeholder="Static value"
                  defaultValue={String(mapping.value ?? "")}
                  onBlur={(event) =>
                    setMapping(name, {
                      ...mapping,
                      value: parseLiteralValue(event.target.value, mapping.valueType),
                    })
                  }
                />
              )}
              {mapping.source === "ask" && (
                <>
                  <input
                    className="st-input min-w-[240px] flex-1 py-1 text-[11.5px]"
                    placeholder="Prompt shown before launch"
                    value={mapping.prompt}
                    onChange={(event) =>
                      setMapping(name, { ...mapping, prompt: event.target.value })
                    }
                    onBlur={(event) => {
                      if (!event.target.value.trim())
                        setMapping(name, { ...mapping, prompt: "Ask the rep for this value" });
                    }}
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mapping.required}
                    className={`h-5 w-9 shrink-0 rounded-full transition-colors ${
                      mapping.required ? "bg-accent" : "bg-line"
                    }`}
                    title={mapping.required ? "Required before launch" : "Optional"}
                    onClick={() => setMapping(name, { ...mapping, required: !mapping.required })}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                        mapping.required ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </>
              )}
              {mapping.source === "selection" && (
                <select
                  className="st-input min-w-[220px] py-1 text-[11.5px]"
                  value={mapping.relationship ?? ""}
                  onChange={(event) => {
                    const relationship = describe.relationships.find((rel) => rel.api === event.target.value);
                    setMapping(
                      name,
                      relationship
                        ? {
                            source: "selection",
                            relationship: relationship.api,
                            object: relationship.relatedObject,
                            valueType: "recordIds",
                            required: mapping.required,
                          }
                        : { source: "selection", valueType: "recordIds", required: mapping.required },
                    );
                  }}
                >
                  <option value="">Current selected rows</option>
                  {describe.relationships.map((relationship) => (
                    <option key={relationship.api} value={relationship.api}>
                      {relationship.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
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
