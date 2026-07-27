"use client";
/**
 * Left palette (2a): searchable describe fields ranked by SIGNAL (not API
 * order — that fronts `Id`/`IsDeleted`/address parts), with address and
 * system plumbing folded into collapsed groups. Gaps nudge, used-field
 * dimming.
 */
import { useState } from "react";
import type { FieldDescribe, ObjectDescribe } from "@cardstack/core";
import { crmDisplayLabel } from "../../lib/crm-label";
import { paletteGroup, paletteRank } from "../../lib/starter-layout";
import { usePortalInfo } from "../use-portal-info";

export function Palette({
  describe,
  crm,
  usedFields,
  onAdd,
}: {
  describe: ObjectDescribe;
  crm: "hubspot" | "salesforce";
  usedFields: Set<string>;
  onAdd: (api: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<{ address: boolean; system: boolean }>({
    address: false,
    system: false,
  });
  const { info } = usePortalInfo();
  const crmLabel = crmDisplayLabel(crm);
  const matches = (f: FieldDescribe) =>
    !query ||
    f.label.toLowerCase().includes(query.toLowerCase()) ||
    f.api.toLowerCase().includes(query.toLowerCase());
  const bySignal = (a: FieldDescribe, b: FieldDescribe) =>
    paletteRank(b) - paletteRank(a) || a.label.localeCompare(b.label);
  const fields = describe.fields.filter(matches).sort(bySignal);
  // Searching flattens the groups — a filtered-out match reads as "missing".
  const grouped = query
    ? { main: fields, address: [], system: [] }
    : {
        main: fields.filter((f) => paletteGroup(f) === "main"),
        address: fields.filter((f) => paletteGroup(f) === "address"),
        system: fields.filter((f) => paletteGroup(f) === "system"),
      };
  const missing = describe.fields.filter((f) => !f.description).length;

  const fieldButton = (field: FieldDescribe) => {
          const used = usedFields.has(field.api);
          return (
            <button
              key={field.api}
              type="button"
              disabled={used}
              onClick={() => onAdd(field.api)}
              className={`group flex w-full items-center justify-between rounded-[8px] border border-line-soft bg-surface px-2.5 py-1.5 text-left transition-colors ${
                used ? "opacity-45" : "hover:border-line hover:bg-paper"
              }`}
              title={used ? "Already on the card" : `Add ${field.label} to the card`}
            >
              <span className="flex items-center gap-1.5 text-[12px]">
                {!field.description && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn-dot"
                    title="No description in the CRM"
                  />
                )}
                {field.label}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="st-chip-mono bg-paper text-ink-45">{field.type}</span>
                {used ? (
                  <span className="text-[10.5px] text-ink-45">On card</span>
                ) : (
                  <span className="text-[12px] text-ink-45 opacity-0 group-hover:opacity-100">+</span>
                )}
              </span>
            </button>
          );
  };

  const collapsedGroup = (key: "address" | "system", label: string, groupFields: FieldDescribe[]) =>
    groupFields.length > 0 && (
      <div className="mt-3">
        <button
          type="button"
          className="st-section-label w-full pb-1.5 text-left text-ink-45 hover:text-ink"
          aria-expanded={openGroups[key]}
          onClick={() => setOpenGroups((g) => ({ ...g, [key]: !g[key] }))}
        >
          {openGroups[key] ? "▾" : "▸"} {label} · {groupFields.length}
        </button>
        {openGroups[key] && <div className="space-y-1">{groupFields.map(fieldButton)}</div>}
      </div>
    );

  return (
    <aside className="max-h-[420px] w-full shrink-0 overflow-y-auto xl:max-h-none xl:w-[240px]">
      <input
        type="search"
        placeholder="Search fields…"
        className="st-input w-full"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="st-section-label mt-4 pb-1.5">
        {describe.label} fields · {describe.fields.length}
      </div>
      <div className="space-y-1">{grouped.main.map(fieldButton)}</div>
      {collapsedGroup("address", "Address fields", grouped.address)}
      {collapsedGroup("system", "System & audit", grouped.system)}

      {missing > 0 && (
        <div className="mt-4 rounded-[10px] bg-crmmeta p-3 text-[11.5px] text-crmmeta-ink">
          <strong>Metadata gaps.</strong> {missing} of {describe.fields.length} fields have no
          description — the model, rep tooltips and coverage all read the same CRM metadata.{" "}
          {crm === "hubspot" && info.portalId ? (
            <a
              href={`https://app.hubspot.com/property-settings/${info.portalId}/properties?type=${describe.api}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Fix in HubSpot ↗
            </a>
          ) : (
            // No portal id (or no deep-link URL for this CRM) — plain text,
            // nothing clickable-but-dead.
            <span>Fix in {crmLabel}.</span>
          )}
        </div>
      )}
    </aside>
  );
}
