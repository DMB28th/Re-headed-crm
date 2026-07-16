"use client";
/**
 * Lists (design 5a + feedback 2026-07-11): two sources, one exposure model.
 * - CRM saved views sync read-only — filters are managed in the CRM.
 * - Cardstack lists are admin-defined HERE (name + filters) and run through
 *   the adapter's search. Both expose/alias/default the same way.
 *
 * Condition builder UI leans on Momentum.io's field · operator · value rows
 * (AND between conditions, chip values for IN / is-any-of).
 */
import { useEffect, useState, type KeyboardEvent } from "react";
import {
  summarizeCustomFilters,
  VALUELESS_LIST_OPS,
  MULTI_VALUE_LIST_OPS,
  type CustomList,
  type CustomListFilter,
  type FilterLabels,
  type ObjectDescribe,
  type SavedView,
  type ViewExposure,
  type ViewExposuresConfig,
} from "@cardstack/core";
import { LoadFailed } from "./load-failed";

const OPS: { value: CustomListFilter["op"]; label: string; group: string }[] = [
  { value: "eq", label: "is", group: "Match" },
  { value: "neq", label: "is not", group: "Match" },
  { value: "contains", label: "contains", group: "Text" },
  { value: "not_contains", label: "does not contain", group: "Text" },
  { value: "starts_with", label: "starts with", group: "Text" },
  { value: "ends_with", label: "ends with", group: "Text" },
  { value: "in", label: "is any of (IN)", group: "Set" },
  { value: "not_in", label: "is none of", group: "Set" },
  { value: "gt", label: "greater than", group: "Compare" },
  { value: "gte", label: "greater or equal", group: "Compare" },
  { value: "lt", label: "less than", group: "Compare" },
  { value: "lte", label: "less or equal", group: "Compare" },
  { value: "is_empty", label: "is empty", group: "Empty" },
  { value: "not_empty", label: "is not empty", group: "Empty" },
];

interface ListTemplate {
  key: string;
  name: string;
  aliases: string[];
  filters: CustomListFilter[];
  summary: string;
}

/**
 * One-click list templates derived from the object's own describe — the
 * practical way to rebuild HubSpot object VIEWS (which have no public API) as
 * Cardstack lists. Each only appears when the object actually has that concept
 * (stage/amount/owner/close-date), so it works for any CRM object.
 */
function templatesFor(describe: ObjectDescribe): ListTemplate[] {
  const plural = describe.labelPlural.toLowerCase();
  const labelOf = (api: string) => describe.fields.find((f) => f.api === api)?.label ?? api;
  const out: ListTemplate[] = [];
  const stage = describe.stageField;
  const stageMeta = stage ? describe.fields.find((f) => f.api === stage) : undefined;
  const closed = stageMeta?.closedValues ?? [];
  if (stage && closed.length > 0) {
    out.push({
      key: "open",
      name: `Open ${plural}`,
      aliases: [`open ${plural}`, "open pipeline"],
      filters: [{ field: stage, op: "not_in", values: closed }],
      summary: `${labelOf(stage)} is not closed`,
    });
    out.push({
      key: "closed",
      name: `Closed ${plural}`,
      aliases: [`closed ${plural}`],
      filters: [{ field: stage, op: "in", values: closed }],
      summary: `${labelOf(stage)} is closed`,
    });
  }
  if (describe.amountField) {
    const a = describe.amountField;
    out.push({
      key: "large",
      name: `Large ${plural} (50k+)`,
      aliases: [`large ${plural}`, `big ${plural}`],
      filters: [{ field: a, op: "gte", value: 50000 }],
      summary: `${labelOf(a)} ≥ 50,000`,
    });
    out.push({
      key: "no-amount",
      name: `${describe.labelPlural} with no amount`,
      aliases: [`${plural} missing amount`],
      filters: [{ field: a, op: "is_empty" }],
      summary: `${labelOf(a)} is empty`,
    });
  }
  if (describe.ownerField) {
    const o = describe.ownerField;
    out.push({
      key: "no-owner",
      name: `Unassigned ${plural}`,
      aliases: [`unassigned ${plural}`, `${plural} with no owner`],
      filters: [{ field: o, op: "is_empty" }],
      summary: `${labelOf(o)} is empty`,
    });
  }
  if (describe.closeDateField) {
    const c = describe.closeDateField;
    out.push({
      key: "no-closedate",
      name: `${describe.labelPlural} with no close date`,
      aliases: [`${plural} missing close date`],
      filters: [{ field: c, op: "is_empty" }],
      summary: `${labelOf(c)} is empty`,
    });
  }
  return out;
}

export function ViewsEditor({ object }: { object: string }) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [exposures, setExposures] = useState<ViewExposuresConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch(`/api/views/${object}`);
        const data = (await res.json()) as {
          savedViews: SavedView[];
          exposures: ViewExposuresConfig;
          describe: ObjectDescribe;
          error?: string;
        };
        if (!res.ok || data.error) {
          setLoadError(data.error ?? `Request failed (${res.status}).`);
          return;
        }
        setSavedViews(data.savedViews);
        setExposures(data.exposures);
        setDescribe(data.describe);
      } catch (error) {
        setLoadError(String(error));
      }
    })();
  }, [object, reloadKey]);

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

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (!exposures || !describe) return <div className="text-[12.5px] text-ink-45">Loading…</div>;

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

  const labelOf = (api: string) => describe.fields.find((f) => f.api === api)?.label ?? api;

  // Field + picklist labels so summaries read "Deal Stage is Closed won", not
  // "dealstage eq 2540864".
  const filterLabels: FilterLabels = Object.fromEntries(
    describe.fields.map((f) => [
      f.api,
      { label: f.label, ...(f.valueLabels ? { valueLabels: f.valueLabels } : {}) },
    ]),
  );

  const summarize = (list: CustomList): string =>
    summarizeCustomFilters({ ...list, filterSummary: undefined }, filterLabels);

  const updateCustomList = (id: string, patch: Partial<CustomList>) => {
    const customLists = exposures.customLists.map((list) => {
      if (list.id !== id) return list;
      const next = { ...list, ...patch };
      return { ...next, filterSummary: summarize(next) };
    });
    void save({ ...exposures, customLists });
  };

  const addCustomList = () => {
    const id = `cl-${Date.now().toString(36)}`;
    const list: CustomList = {
      id,
      name: "New list",
      filters: [],
      filterSummary: "All records",
    };
    setEditing(id);
    void save({
      ...exposures,
      customLists: [...exposures.customLists, list],
      views: [...exposures.views, { viewId: id, exposed: true, aliases: [], isDefault: false }],
    });
  };

  const addFromTemplate = (t: ListTemplate) => {
    const id = `cl-${t.key}-${Date.now().toString(36)}`;
    const list: CustomList = { id, name: t.name, filters: t.filters, filterSummary: t.summary };
    void save({
      ...exposures,
      customLists: [...exposures.customLists, list],
      views: [...exposures.views, { viewId: id, exposed: true, aliases: t.aliases, isDefault: false }],
    });
  };

  const deleteCustomList = (id: string) => {
    setEditing((e) => (e === id ? null : e));
    void save({
      ...exposures,
      customLists: exposures.customLists.filter((l) => l.id !== id),
      views: exposures.views.filter((v) => v.viewId !== id),
    });
  };

  const exposureRowControls = (viewId: string) => {
    const exposure = exposureFor(viewId);
    return {
      exposure,
      aliasInput: (
        <input
          className="st-input text-[11.5px]"
          placeholder="my deals, open deals…"
          defaultValue={exposure.aliases.join(", ")}
          onBlur={(e) =>
            updateView(viewId, {
              aliases: e.target.value
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
            })
          }
        />
      ),
      toggle: (
        <button
          type="button"
          role="switch"
          aria-checked={exposure.exposed}
          onClick={() => updateView(viewId, { exposed: !exposure.exposed })}
          className={`h-5 w-9 rounded-full transition-colors ${exposure.exposed ? "bg-accent" : "bg-line"}`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${exposure.exposed ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      ),
      defaultChip: exposure.isDefault ? (
        <span className="st-chip-mono bg-published text-published-ink">default</span>
      ) : (
        exposure.exposed && (
          <button
            type="button"
            className="text-[10.5px] text-ink-45 underline"
            onClick={() => updateView(viewId, { isDefault: true })}
          >
            make default
          </button>
        )
      ),
    };
  };

  return (
    <div className="max-w-[820px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold capitalize">{object} · Lists</h1>
        <span className="text-[11.5px] text-ink-45">{saved ? "Saved" : " "}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Two sources: saved views sync from the CRM (filters managed there), and Cardstack lists
        you define right here. Both decide what chat can see and what phrases reach them.
        Changes apply on the next ask (no publish step).
      </p>

      <h2 className="st-section-label mt-6">Synced from the CRM</h2>
      <div className="st-card mt-2 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] gap-3 border-b border-line-soft px-4 py-2">
          {["View", "Filters (from CRM)", "Ask Claude with", "Exposed"].map((h) => (
            <span key={h} className="st-section-label">
              {h}
            </span>
          ))}
        </div>
        {savedViews.length === 0 && (
          <div className="px-4 py-3 text-[12.5px] text-ink-45">
            No CRM lists for this object. HubSpot <strong>Lists</strong> (Contacts ▸ Lists, plus
            company/deal lists) import here automatically when the token has the{" "}
            <code className="st-chip-mono bg-paper">crm.lists.read</code> scope — Connections shows a
            note if it's missing. The object-table “saved views” aren't in HubSpot's public API;
            recreate those as Cardstack lists below.
          </div>
        )}
        {savedViews.map((view) => {
          const { aliasInput, toggle, defaultChip } = exposureRowControls(view.id);
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
                  {defaultChip}
                </span>
              </span>
              <span className="text-[11.5px] text-ink-55">{view.filterSummary}</span>
              {aliasInput}
              {toggle}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="st-section-label">Cardstack lists</h2>
          <p className="mt-1 text-[12px] text-ink-45">
            Build conditions like Momentum — field, operator, value — then expose them to chat.
          </p>
        </div>
        <button type="button" className="st-btn st-btn--primary shrink-0" onClick={addCustomList}>
          + New list
        </button>
      </div>

      {/* One-click templates: rebuild common CRM views (which HubSpot doesn't
          expose via API) as Cardstack lists, with filters from real metadata. */}
      {(() => {
        const templates = templatesFor(describe).filter(
          (t) => !exposures.customLists.some((l) => l.name === t.name),
        );
        if (templates.length === 0) return null;
        return (
          <div className="mt-2 rounded-[10px] border border-line-soft bg-paper px-3 py-2.5">
            <div className="text-[11px] text-ink-45">
              Quick add — one-click lists built from this object's fields (edit or delete after):
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-55 hover:border-accent hover:text-ink"
                  title={t.summary}
                  onClick={() => addFromTemplate(t)}
                >
                  + {t.name}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="st-card mt-2 overflow-hidden">
        {exposures.customLists.length === 0 && (
          <div className="px-4 py-3 text-[12.5px] text-ink-45">
            None yet — Cardstack lists are filters you define here, without touching the CRM.
          </div>
        )}
        {exposures.customLists.map((list) => {
          const { aliasInput, toggle, defaultChip } = exposureRowControls(list.id);
          const isEditing = editing === list.id;
          return (
            <div key={list.id} className="border-b border-line-soft last:border-b-0">
              <div className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] items-center gap-3 px-4 py-2.5">
                <span className="text-[12.5px]">
                  {isEditing ? (
                    <input
                      className="st-input w-full py-1 text-[12.5px] font-medium"
                      value={list.name}
                      onChange={(e) => updateCustomList(list.id, { name: e.target.value })}
                    />
                  ) : (
                    <span className="font-medium">{list.name}</span>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">Cardstack</span>
                    {defaultChip}
                  </span>
                </span>
                <span className="text-[11.5px] text-ink-55">
                  {summarize(list)}
                  <button
                    type="button"
                    className="ml-2 text-[10.5px] text-ink-45 underline"
                    onClick={() => setEditing(isEditing ? null : list.id)}
                  >
                    {isEditing ? "done" : "edit"}
                  </button>
                  {deleteConfirm === list.id ? (
                    <>
                      <button
                        type="button"
                        className="ml-2 text-[10.5px] text-drift-ink underline"
                        onClick={() => {
                          deleteCustomList(list.id);
                          setDeleteConfirm(null);
                        }}
                      >
                        {(() => {
                          const ex = exposureFor(list.id);
                          return ex.isDefault
                            ? "delete — reps' default ask breaks"
                            : ex.aliases.length > 0
                              ? `delete — "${ex.aliases[0]}" stops resolving`
                              : "confirm delete";
                        })()}
                      </button>
                      <button
                        type="button"
                        className="ml-1.5 text-[10.5px] text-ink-45 underline"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ml-2 text-[10.5px] text-drift-ink underline"
                      onClick={() => setDeleteConfirm(list.id)}
                    >
                      delete
                    </button>
                  )}
                </span>
                {aliasInput}
                {toggle}
              </div>
              {isEditing && (
                <ConditionBuilder
                  describe={describe}
                  filters={list.filters}
                  onChange={(filters) => updateCustomList(list.id, { filters })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Momentum-style condition builder: field · operator · value, AND between rows. */
function ConditionBuilder({
  describe,
  filters,
  onChange,
}: {
  describe: ObjectDescribe;
  filters: CustomListFilter[];
  onChange: (filters: CustomListFilter[]) => void;
}) {
  const fieldMeta = (api: string) => describe.fields.find((f) => f.api === api);

  const update = (i: number, patch: Partial<CustomListFilter>) =>
    onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const valueInput = (filter: CustomListFilter, i: number) => {
    if (VALUELESS_LIST_OPS.includes(filter.op)) {
      return (
        <span className="text-[11.5px] text-ink-45 italic">no value needed</span>
      );
    }
    const meta = fieldMeta(filter.field);
    if (MULTI_VALUE_LIST_OPS.includes(filter.op)) {
      return (
        <MultiValueInput
          values={(filter.values ?? []).map(String)}
          options={meta?.values}
          valueLabels={meta?.valueLabels}
          onChange={(values) => update(i, { values })}
        />
      );
    }
    if (meta?.values) {
      return (
        <select
          className="st-input min-w-[160px] flex-1 py-1.5 text-[12.5px]"
          value={String(filter.value ?? "")}
          onChange={(e) => update(i, { value: e.target.value })}
        >
          <option value="">Select value…</option>
          {meta.values.map((v) => (
            <option key={v} value={v}>
              {meta.valueLabels?.[v] ?? v}
            </option>
          ))}
        </select>
      );
    }
    const numeric = meta?.type === "number" || meta?.type === "currency";
    return (
      <input
        className="st-input min-w-[160px] flex-1 py-1.5 text-[12.5px]"
        type={numeric ? "number" : "text"}
        placeholder={
          meta?.type === "date"
            ? "YYYY-MM-DD"
            : filter.op === "contains" || filter.op === "not_contains"
              ? "text…"
              : "value"
        }
        defaultValue={filter.value === null || filter.value === undefined ? "" : String(filter.value)}
        onBlur={(e) =>
          update(i, { value: numeric ? Number(e.target.value) : e.target.value })
        }
      />
    );
  };

  return (
    <div className="border-t border-line-soft bg-[linear-gradient(180deg,#fbfbfa_0%,#f6f6f4_100%)] px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Match records where</div>
          <div className="mt-0.5 text-[11.5px] text-ink-45">
            Conditions are ANDed · applied on the next ask
          </div>
        </div>
      </div>

      {filters.length === 0 && (
        <div className="mb-3 rounded-[10px] border border-dashed border-line bg-surface/70 px-3 py-3 text-[12.5px] text-ink-45">
          No conditions yet — every record matches. Add a condition to narrow the list.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {filters.map((filter, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-1 pl-1">
                <span className="st-chip-mono bg-accent text-white">AND</span>
                <span className="h-px flex-1 bg-line-soft" />
              </div>
            )}
            <div className="flex flex-wrap items-start gap-2 rounded-[12px] border border-line bg-surface px-3 py-2.5 shadow-[0_1px_0_rgba(20,24,40,0.03)]">
              <select
                className="st-input min-w-[140px] max-w-[220px] flex-[1.2] py-1.5 text-[12.5px] font-medium"
                value={filter.field}
                onChange={(e) =>
                  update(i, { field: e.target.value, value: "", values: undefined })
                }
              >
                {describe.fields.map((f) => (
                  <option key={f.api} value={f.api}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="st-input w-[168px] shrink-0 py-1.5 text-[12.5px]"
                value={filter.op}
                onChange={(e) => {
                  const op = e.target.value as CustomListFilter["op"];
                  if (VALUELESS_LIST_OPS.includes(op)) {
                    update(i, { op, value: undefined, values: undefined });
                  } else if (MULTI_VALUE_LIST_OPS.includes(op)) {
                    update(i, { op, value: undefined, values: [] });
                  } else {
                    update(i, { op, values: undefined });
                  }
                }}
              >
                {(["Match", "Text", "Set", "Compare", "Empty"] as const).map((group) => (
                  <optgroup key={group} label={group}>
                    {OPS.filter((op) => op.group === group).map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="min-w-[180px] flex-[1.6]">{valueInput(filter, i)}</div>
              <button
                type="button"
                className="mt-1 rounded-[8px] px-2 py-1 text-[14px] leading-none text-ink-45 hover:bg-drift hover:text-drift-ink"
                aria-label="Remove condition"
                onClick={() => onChange(filters.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-3 rounded-[9px] border border-dashed border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-55 hover:border-accent hover:text-ink"
        onClick={() =>
          onChange([
            ...filters,
            { field: describe.fields[0]!.api, op: "eq", value: "" },
          ])
        }
      >
        + Add condition
      </button>
    </div>
  );
}

/** Chip-based multi-value input for IN / is-any-of (and is-none-of). */
function MultiValueInput({
  values,
  options,
  valueLabels,
  onChange,
}: {
  values: string[];
  options?: string[];
  valueLabels?: Record<string, string>;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const selected = new Set(values);

  const add = (raw: string) => {
    const next = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.length === 0) return;
    const merged = [...values];
    for (const v of next) {
      if (!merged.includes(v)) merged.push(v);
    }
    onChange(merged);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex min-h-[36px] flex-wrap items-center gap-1.5 rounded-[9px] border border-line bg-paper px-2 py-1.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(47,53,80,0.14)]">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11.5px] text-accent"
          >
            <span className="truncate">{valueLabels?.[v] ?? v}</span>
            <button
              type="button"
              className="text-ink-45 hover:text-drift-ink"
              aria-label={`Remove ${valueLabels?.[v] ?? v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
        {!options && (
          <input
            className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[12.5px] outline-none placeholder:text-ink-45"
            placeholder={values.length === 0 ? "Type a value, Enter to add…" : "Add another…"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => add(draft)}
          />
        )}
        {options && values.length === 0 && (
          <span className="text-[11.5px] text-ink-45">Pick values below</span>
        )}
      </div>
      {options && (
        <div className="max-h-[140px] overflow-y-auto rounded-[9px] border border-line-soft bg-surface p-1.5">
          {options.map((v) => {
            const on = selected.has(v);
            return (
              <button
                key={v}
                type="button"
                className={`flex w-full items-center justify-between rounded-[7px] px-2 py-1 text-left text-[11.5px] ${
                  on ? "bg-accent/10 text-accent" : "hover:bg-paper"
                }`}
                onClick={() => {
                  if (on) onChange(values.filter((x) => x !== v));
                  else onChange([...values, v]);
                }}
              >
                <span className="truncate">{valueLabels?.[v] ?? v}</span>
                <span className="font-mono text-[10px] text-ink-45">{on ? "IN" : "+"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
