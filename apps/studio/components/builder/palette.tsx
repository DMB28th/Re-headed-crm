"use client";
/** Left palette (2a): searchable describe fields, gaps nudge, used-field dimming. */
import { useState } from "react";
import type { ObjectDescribe } from "@cardstack/core";
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
  const { info } = usePortalInfo();
  const crmLabel = crm === "hubspot" ? "HubSpot" : "Salesforce";
  const fields = describe.fields.filter(
    (f) =>
      !query ||
      f.label.toLowerCase().includes(query.toLowerCase()) ||
      f.api.toLowerCase().includes(query.toLowerCase()),
  );
  const missing = describe.fields.filter((f) => !f.description).length;

  return (
    <aside className="w-[264px] shrink-0 overflow-y-auto">
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
      <div className="space-y-1">
        {fields.map((field) => {
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
        })}
      </div>

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
