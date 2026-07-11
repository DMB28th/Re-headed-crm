/**
 * Demo tenant seed — the M1/M2 hardcoded config, now the initial state of any
 * fresh config store. Studio edits from here; nothing is hardcoded at render
 * time anymore (Golden Path 3).
 */
import {
  HomeCardConfig,
  parseLayoutConfig,
  ViewExposuresConfig,
  type LayoutConfig,
} from "@cardstack/core";
import type { ConnectionState } from "./types.js";

export const DEMO_TENANT_ID = "t_demo";

/**
 * Default connection for stores with no stored state: the mock portal,
 * connected. Pre-dates the connections feature, so absence = connected keeps
 * existing config files and databases working unchanged.
 */
export function defaultConnection(tenantId: string): ConnectionState {
  return {
    tenantId,
    status: "connected",
    crm: "hubspot",
    label: "mock portal",
    changedAt: "2026-07-11T00:00:00.000Z",
  };
}

export const demoDealsLayout: LayoutConfig = parseLayoutConfig({
  version: 1,
  tenantId: DEMO_TENANT_ID,
  crm: "hubspot",
  object: "deals",
  audience: "default",
  name: "AE deal card",
  revision: 4,
  listView: {
    columns: ["dealname", "dealstage", "amount", "closedate", "deal_owner"],
    defaultSort: { field: "closedate", dir: "asc" },
    rowActions: ["open_record"],
  },
  recordCard: {
    header: { title: "dealname", subtitle: "company", badge: "dealstage" },
    sections: [
      {
        label: "Deal details",
        columns: 2,
        fields: [
          { api: "amount", editable: true },
          { api: "closedate", editable: true },
          { api: "dealstage", editable: true, control: "picklist" },
          { api: "deal_owner" },
          { api: "renewal_date", editable: true },
          { api: "next_step", editable: true, control: "textarea" },
        ],
      },
    ],
    relatedLists: [
      {
        object: "contacts",
        relationship: "deal_contacts",
        columns: ["name", "role", "jobtitle"],
        limit: 5,
      },
    ],
    actions: [{ type: "update_record", label: "Save changes" }],
  },
  permissions: {
    writeEnabled: true,
    fieldDenylist: ["commission"],
    requireConfirmation: true,
  },
});

/**
 * Demo view exposures. The overlapping "…deals…" aliases are deliberate: a
 * bare "deals" ask matches three views and exercises the ambiguous-ask picker
 * (design 5b). v-04 stays unexposed (private view, toggle off).
 */
export const demoViewExposures: ViewExposuresConfig = ViewExposuresConfig.parse({
  version: 1,
  tenantId: DEMO_TENANT_ID,
  object: "deals",
  views: [
    { viewId: "v-01", exposed: true, aliases: ["my deals", "my open deals"], isDefault: true },
    { viewId: "v-02", exposed: true, aliases: ["deals closing this quarter", "closing soon"] },
    { viewId: "v-03", exposed: true, aliases: ["renewal deals", "renewals"] },
    { viewId: "v-04", exposed: false, aliases: [] },
  ],
});

/** Default home card (7a): launcher blocks only — no dashboard blocks exist. */
export const demoHomeCard: HomeCardConfig = HomeCardConfig.parse({
  version: 1,
  tenantId: DEMO_TENANT_ID,
  audience: "default",
  revision: 1,
  blocks: [
    { type: "lists", source: "all", maxTiles: 4, viewIds: [] },
    { type: "recent", limit: 3 },
    { type: "followups", limit: 5 },
  ],
});
