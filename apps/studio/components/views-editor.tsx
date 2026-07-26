"use client";
/**
 * Lists (design 5a + feedback 2026-07-11): two sources, one exposure model.
 * - CRM saved views sync read-only — filters are managed in the CRM.
 * - Cardstack lists are admin-defined HERE (name + filters) and run through
 *   the adapter's search. Both expose/alias/default the same way.
 */
import { useEffect, useState } from "react";
import {
  summarizeCustomFilters,
  VALUELESS_LIST_OPS,
  MULTI_VALUE_LIST_OPS,
  type CustomList,
  type CustomListFilter,
  type FilterLabels,
  type ObjectDescribe,
  type SavedView,
  type UserContext,
  type ViewExposure,
  type ViewExposuresConfig,
} from "@cardstack/core";
import { LoadFailed } from "./load-failed";

const OPS: { value: CustomListFilter["op"]; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "in", label: "is any of" },
  { value: "not_in", label: "is none of" },
  { value: "is_empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
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
  const [currentUser, setCurrentUser] = useState<UserContext | null>(null);
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
          currentUser: UserContext;
          error?: string;
        };
        if (!res.ok || data.error) {
          setLoadError(data.error ?? `Request failed (${res.status}).`);
          return;
        }
        setSavedViews(data.savedViews);
        setExposures(data.exposures);
        setDescribe(data.describe);
        setCurrentUser(data.currentUser);
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
    const now = new Date().toISOString();
    const list: CustomList = {
      id,
      name: "New list",
      filters: [],
      filterSummary: "All records",
      visibility: "private",
      ...(currentUser
        ? {
            createdByUserId: currentUser.userId,
            createdByName: currentUser.name,
            ...(currentUser.email ? { createdByEmail: currentUser.email } : {}),
          }
        : {}),
      createdAt: now,
      updatedAt: now,
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
    const now = new Date().toISOString();
    const list: CustomList = {
      id,
      name: t.name,
      filters: t.filters,
      filterSummary: t.summary,
      visibility: "private",
      ...(currentUser
        ? {
            createdByUserId: currentUser.userId,
            createdByName: currentUser.name,
            ...(currentUser.email ? { createdByEmail: currentUser.email } : {}),
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    };
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
          className="st-input w-full min-w-0 text-[11.5px]"
          placeholder={
            describe
              ? `my ${describe.labelPlural.toLowerCase()}, open ${describe.labelPlural.toLowerCase()}…`
              : "my records, open records…"
          }
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
          className={`h-5 w-9 shrink-0 rounded-full transition-colors ${exposure.exposed ? "bg-accent" : "bg-line"}`}
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

      <h2 className="st-section-label mt-6">Synced CRM components</h2>
      <div className="mt-2 grid grid-cols-1 gap-2.5">
        {savedViews.length === 0 && (
          <div className="st-card px-4 py-3 text-[12.5px] text-ink-45">
            No CRM lists for this object. HubSpot <strong>Lists</strong> (Contacts ▸ Lists, plus
            company/deal lists) import here automatically when the token has the{" "}
            <code className="st-chip-mono bg-paper">crm.lists.read</code> scope — Connections shows a
            note if it's missing. The object-table “saved views” aren't in HubSpot's public API;
            recreate those as Cardstack lists below.
          </div>
        )}
        {savedViews.map((view) => {
          const { aliasInput, toggle, defaultChip, exposure } = exposureRowControls(view.id);
          const primaryPhrase = exposure.aliases[0] ?? view.name.toLowerCase();
          return (
            <div key={view.id} className="st-card min-w-0 overflow-hidden p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="break-words text-[13px] font-semibold">{view.name}</span>
                    <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">CRM list</span>
                    {view.visibility === "private" && (
                      <span className="st-chip-mono bg-paper text-ink-45">private</span>
                    )}
                    {defaultChip}
                  </div>
                  <div className="mt-1 text-[11.5px] text-ink-55">{view.filterSummary}</div>
                </div>
                <label className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-55">
                  {exposure.exposed ? "Available in chat" : "Hidden from chat"}
                  {toggle}
                </label>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.3fr]">
                <div className="min-w-0 rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase text-ink-55">Ask</div>
                  <div className="mt-1 break-words text-[12px] text-ink-55">
                    Chat resolves <span className="font-medium text-ink">"{primaryPhrase}"</span> to this
                    CRM-managed list.
                  </div>
                </div>
                <label className="text-[11.5px] text-ink-55">
                  aliases
                  <div className="mt-1">{aliasInput}</div>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="st-section-label">Cardstack lists</h2>
        <button type="button" className="st-btn" onClick={addCustomList}>
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
              Starter components — one-click lists built from this object's fields (edit or delete after):
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

      <div className="mt-2 grid grid-cols-1 gap-2.5">
        {exposures.customLists.length === 0 && (
          <div className="st-card px-4 py-3 text-[12.5px] text-ink-45">
            None yet — Cardstack lists are filters you define here, without touching the CRM.
          </div>
        )}
        {exposures.customLists.map((list) => {
          const { aliasInput, toggle, defaultChip, exposure } = exposureRowControls(list.id);
          const isEditing = editing === list.id;
          const primaryPhrase = exposure.aliases[0] ?? list.name.toLowerCase();
          const summary = summarize(list);
          return (
            <div key={list.id} className="st-card min-w-0 overflow-hidden">
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        className="st-input w-full py-1 text-[13px] font-semibold"
                        value={list.name}
                        onChange={(e) => updateCustomList(list.id, { name: e.target.value })}
                      />
                    ) : (
                      <span className="break-words text-[13px] font-semibold">{list.name}</span>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">Cardstack list</span>
                      <button
                        type="button"
                        className="st-chip-mono bg-paper text-ink-45"
                        title={
                          list.visibility === "private"
                            ? "Only you can see this list in Studio and chat"
                            : "Everyone in the workspace can see this list"
                        }
                        onClick={() =>
                          updateCustomList(list.id, {
                            visibility: list.visibility === "private" ? "workspace" : "private",
                          })
                        }
                      >
                        {list.visibility === "private" ? "Only me" : "Workspace"}
                      </button>
                      {list.createdByName && (
                        <span className="st-chip-mono bg-paper text-ink-45">
                          by {list.createdByName}
                        </span>
                      )}
                      {defaultChip}
                    </div>
                  </div>
                  <label className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-55">
                    {exposure.exposed ? "Available in chat" : "Hidden from chat"}
                    {toggle}
                  </label>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.3fr]">
                  <div className="min-w-0 rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase text-ink-55">Ask</div>
                    <div className="mt-1 break-words text-[12px] text-ink-55">
                      Chat resolves <span className="font-medium text-ink">"{primaryPhrase}"</span> to this
                      list component.
                    </div>
                  </div>
                  <div className="min-w-0 rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase text-ink-55">Filter</div>
                    <div className="mt-1 break-words text-[12px] text-ink-55">{summary}</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                  <label className="text-[11.5px] text-ink-55">
                    aliases
                    <div className="mt-1">{aliasInput}</div>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-[10.5px] text-ink-45 underline"
                      onClick={() => setEditing(isEditing ? null : list.id)}
                    >
                      {isEditing ? "done" : "edit filters"}
                    </button>
                    {deleteConfirm === list.id ? (
                      <>
                        <button
                          type="button"
                          className="text-[10.5px] text-drift-ink underline"
                          onClick={() => {
                            deleteCustomList(list.id);
                            setDeleteConfirm(null);
                          }}
                        >
                          {(() => {
                            const ex = exposureFor(list.id);
                            return ex.isDefault
                              ? "delete - default ask breaks"
                              : ex.aliases.length > 0
                                ? `delete - "${ex.aliases[0]}" stops resolving`
                                : "confirm delete";
                          })()}
                        </button>
                        <button
                          type="button"
                          className="text-[10.5px] text-ink-45 underline"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="text-[10.5px] text-drift-ink underline"
                        onClick={() => setDeleteConfirm(list.id)}
                      >
                        delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {isEditing && (
                <FilterEditor
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

/** Filter rows: field / op / value. Values type by the field's describe. */
function FilterEditor({
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
    // is_empty / not_empty take no operand.
    if (VALUELESS_LIST_OPS.includes(filter.op)) return null;
    const meta = fieldMeta(filter.field);
    // in / not_in: pick a SET of values (a scrollable checkbox list for
    // picklists; comma-separated text otherwise).
    if (MULTI_VALUE_LIST_OPS.includes(filter.op)) {
      const selected = new Set((filter.values ?? []).map(String));
      if (meta?.values) {
        return (
          <div className="max-h-[132px] w-[220px] shrink-0 overflow-y-auto rounded-[8px] border border-line bg-surface p-1.5">
            {meta.values.map((v) => (
              <label key={v} className="flex items-center gap-1.5 px-1 py-0.5 text-[11.5px]">
                <input
                  type="checkbox"
                  checked={selected.has(v)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(v);
                    else next.delete(v);
                    update(i, { values: [...next] });
                  }}
                />
                <span className="truncate" title={meta.valueLabels?.[v] ?? v}>
                  {meta.valueLabels?.[v] ?? v}
                </span>
              </label>
            ))}
          </div>
        );
      }
      return (
        <input
          className="st-input w-[200px] shrink-0 py-1 text-[11.5px]"
          placeholder="value1, value2, …"
          defaultValue={(filter.values ?? []).join(", ")}
          onBlur={(e) =>
            update(i, {
              values: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      );
    }
    if (meta?.values) {
      return (
        <select
          className="st-input w-[180px] shrink-0 py-1 text-[11.5px]"
          value={String(filter.value ?? "")}
          onChange={(e) => update(i, { value: e.target.value })}
        >
          <option value="">—</option>
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
        className="st-input w-[140px] shrink-0 py-1 text-[11.5px]"
        type={numeric ? "number" : "text"}
        placeholder={meta?.type === "date" ? "YYYY-MM-DD" : "value"}
        defaultValue={filter.value === null ? "" : String(filter.value)}
        onBlur={(e) =>
          update(i, { value: numeric ? Number(e.target.value) : e.target.value })
        }
      />
    );
  };

  return (
    <div className="space-y-2 border-t border-line-soft bg-paper px-4 py-3">
      {filters.map((filter, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            className="st-input min-w-0 max-w-[220px] flex-1 py-1 text-[11.5px]"
            value={filter.field}
            onChange={(e) => update(i, { field: e.target.value, value: "" })}
          >
            {describe.fields.map((f) => (
              <option key={f.api} value={f.api}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="st-input w-[130px] shrink-0 py-1 text-[11.5px]"
            value={filter.op}
            onChange={(e) => {
              const op = e.target.value as CustomListFilter["op"];
              // Reset the operand to the shape the new op expects: none for
              // empties, a set for in/not_in, a single value otherwise.
              if (VALUELESS_LIST_OPS.includes(op)) update(i, { op, value: undefined, values: undefined });
              else if (MULTI_VALUE_LIST_OPS.includes(op)) update(i, { op, value: undefined, values: [] });
              else update(i, { op, values: undefined });
            }}
          >
            {OPS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          {valueInput(filter, i)}
          <button
            type="button"
            className="text-ink-45 hover:text-drift-ink"
            aria-label="Remove filter"
            onClick={() => onChange(filters.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink"
        onClick={() =>
          onChange([
            ...filters,
            { field: describe.fields[0]!.api, op: "eq", value: "" },
          ])
        }
      >
        + Add filter
      </button>
      <span className="ml-3 text-[11px] text-ink-45">Filters are ANDed · applied on the next ask</span>
    </div>
  );
}
