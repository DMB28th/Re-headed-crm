/**
 * Harness smoke test (task 4b). Proves the vitest+jsdom setup can render a
 * REAL widget component end to end — behavioral action-row coverage is added
 * in the next task, in this same file.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RecordCardPayload } from "@cardstack/core";
import { RecordCard } from "./card.tsx";

// Same object/field shape as the mock HubSpot-style seed
// (packages/crm-adapters/src/mock/fixtures.ts: "deals" / "dealname").
const payload: RecordCardPayload = {
  kind: "record-card",
  layout: {
    version: 1,
    tenantId: "demo",
    crm: "hubspot",
    object: "deals",
    audience: "default",
    revision: 1,
    listView: { columns: ["dealname"], rowActions: [] },
    recordCard: {
      header: { title: "dealname" },
      actions: [],
      sections: [
        {
          label: "Overview",
          columns: 2,
          fields: [{ api: "dealname", editable: false }],
        },
      ],
      relatedLists: [],
    },
    permissions: { writeEnabled: false, fieldDenylist: [], requireConfirmation: true },
  },
  meta: {
    dealname: {
      api: "dealname",
      label: "Deal name",
      type: "string",
      required: true,
      readOnly: false,
    },
  },
  record: {
    id: "d-001",
    fields: { dealname: "Meridian Health — annual renewal" },
  },
  related: {},
  activity: [],
  capabilities: { writeEnabled: false, editableFields: [] },
  provenance: {
    crm: "hubspot",
    crmLabel: "HubSpot",
    layoutRevision: 1,
  },
};

describe("RecordCard", () => {
  it("renders the record's title", () => {
    render(
      <RecordCard payload={payload} setPayload={() => {}} locale="en-US" host={null} />,
    );

    // getByRole throws if no match is found, so a truthy return is proof enough —
    // no jest-dom matcher package is part of this harness (brief step 1's deps only).
    // Scoped to the heading: the same title text also appears in the field
    // section below (dealname is both the header title and a listed field).
    expect(screen.getByRole("heading", { name: "Meridian Health — annual renewal" })).toBeTruthy();
  });
});
