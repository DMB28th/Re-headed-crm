"use client";
/**
 * Permissions (design 2e): writes toggle, field denylist, and the locked-ON
 * confirmation row. Edits save to the DRAFT — publish from the builder.
 */
import { useCallback, useEffect, useState } from "react";
import { StatusChip, STATUS_FLASH_MS } from "./ui/status-chip";
import type { LayoutConfig, ObjectDescribe } from "@cardstack/core";
import type { LayoutRecord } from "@cardstack/config-store";

export function PermissionsEditor({ object }: { object: string }) {
  const [config, setConfig] = useState<LayoutConfig | null>(null);
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/layout/${object}`);
      const data = (await res.json()) as { record: LayoutRecord; describe: ObjectDescribe };
      setConfig(data.record.draft ?? data.record.published);
      setDescribe(data.describe);
    })();
  }, [object]);

  const save = useCallback(
    async (next: LayoutConfig) => {
      setConfig(next);
      await fetch(`/api/layout/${object}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), STATUS_FLASH_MS);
    },
    [object],
  );

  if (!config || !describe) return <div className="text-[12.5px] text-ink-45">Loading…</div>;
  const permissions = config.permissions;

  return (
    <div className="max-w-[620px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold capitalize">{object} · Permissions</h1>
        <StatusChip status={saved ? "staged" : "clean"} />
      </div>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Changes here land in the draft and go live with the next publish. The CRM&apos;s own
        permissions (FLS, scopes) always win — Cardstack only ever narrows.
      </p>

      <div className="st-card mt-5 divide-y divide-line-soft">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-[13px] font-medium">Allow writes from chat</div>
            <div className="text-[11.5px] text-ink-55">
              Off = every card renders read-only, no edit affordances anywhere.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={permissions.writeEnabled}
            onClick={() =>
              save({
                ...config,
                permissions: { ...permissions, writeEnabled: !permissions.writeEnabled },
              })
            }
            className={`h-5 w-9 rounded-full transition-colors ${permissions.writeEnabled ? "bg-accent" : "bg-line"}`}
          >
            <span
              className={`block h-4 w-4 rounded-full bg-white transition-transform ${permissions.writeEnabled ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-[13px] font-medium">Require confirmation on every write</div>
            <div className="text-[11.5px] text-ink-55">
              The before/after diff reps sign. It&apos;s the product&apos;s spine, not a setting.
            </div>
          </div>
          <span className="st-chip-mono bg-paper text-ink-45">🔒 locked on</span>
        </div>

        <div className="px-4 py-3">
          <div className="text-[13px] font-medium">Field denylist</div>
          <div className="text-[11.5px] text-ink-55">
            Never exposed in chat — enforced server-side, stripped before anything reaches the
            widget. Even the field names stay invisible.
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {permissions.fieldDenylist.map((field) => (
              <span
                key={field}
                className="flex items-center gap-1.5 rounded-full bg-drift px-2.5 py-0.5 text-[11.5px] text-drift-ink"
              >
                {describe.fields.find((f) => f.api === field)?.label ?? field}
                <button
                  type="button"
                  aria-label={`Remove ${field} from denylist`}
                  onClick={() =>
                    save({
                      ...config,
                      permissions: {
                        ...permissions,
                        fieldDenylist: permissions.fieldDenylist.filter((f) => f !== field),
                      },
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <select
              className="st-input py-1 text-[11.5px]"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                save({
                  ...config,
                  permissions: {
                    ...permissions,
                    fieldDenylist: [...permissions.fieldDenylist, e.target.value],
                  },
                });
              }}
            >
              <option value="">+ Deny a field…</option>
              {describe.fields
                .filter((f) => !permissions.fieldDenylist.includes(f.api))
                .map((f) => (
                  <option key={f.api} value={f.api}>
                    {f.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
