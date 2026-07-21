import { describe, expect, it } from "vitest";
import { parseLayoutConfig } from "./layout-config.js";

const baseLayout = {
  version: 1,
  tenantId: "t1",
  crm: "salesforce",
  object: "Opportunity",
  audience: "default",
  listView: { columns: ["Name"], rowActions: [] },
  recordCard: {
    header: { title: "Name" },
    sections: [{ label: "Details", columns: 2, fields: [{ api: "Name", editable: false }] }],
    relatedLists: [],
  },
  permissions: { writeEnabled: true, fieldDenylist: [], requireConfirmation: true },
};

describe("screen_flow action inputs", () => {
  it("defaults legacy flow actions to an empty explicit input map", () => {
    const layout = parseLayoutConfig({
      ...baseLayout,
      recordCard: {
        ...baseLayout.recordCard,
        actions: [{ type: "screen_flow", flowApiName: "Renewal_Playbook", label: "Run renewal" }],
      },
    });

    expect(layout.recordCard.actions[0]).toMatchObject({
      type: "screen_flow",
      flowApiName: "Renewal_Playbook",
      embed: "auto",
      inputs: {},
    });
  });

  it("keeps context, field, literal, and ask mappings", () => {
    const layout = parseLayoutConfig({
      ...baseLayout,
      recordCard: {
        ...baseLayout.recordCard,
        actions: [
          {
            type: "screen_flow",
            flowApiName: "Discount_Approval",
            label: "Discount approval",
            inputs: {
              recordId: { source: "context", key: "recordId", valueType: "recordId" },
              amount: { source: "field", field: "Amount", valueType: "number" },
              urgent: { source: "literal", value: true, valueType: "boolean" },
              discountReason: {
                source: "ask",
                prompt: "Why does this need discount approval?",
                valueType: "string",
                required: true,
              },
            },
          },
        ],
      },
    });

    expect(layout.recordCard.actions[0]).toMatchObject({
      type: "screen_flow",
      inputs: {
        recordId: { source: "context", key: "recordId" },
        amount: { source: "field", field: "Amount" },
        urgent: { source: "literal", value: true },
        discountReason: { source: "ask", required: true },
      },
    });
  });
});
