/**
 * M1: one hardcoded demo tenant (Studio replaces this in M3 — the server
 * already reads through the ConfigStore interface, so swapping to Postgres
 * is a store implementation, not a server change).
 */
import {
  parseLayoutConfig,
  ViewExposuresConfig,
  type LayoutConfig,
} from "@cardstack/core";

export const DEMO_TENANT_ID = "t_demo";

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
    // M2: writes on — edit mode, confirmation diff, receipt, partial failure.
    writeEnabled: true,
    fieldDenylist: ["commission"],
    requireConfirmation: true,
  },
});

/**
 * M2.5 demo view exposures. The overlapping "…deals…" aliases are deliberate:
 * a bare "deals" ask matches three views and exercises the ambiguous-ask
 * picker (design 5b). v-04 stays unexposed (private view, toggle off).
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
