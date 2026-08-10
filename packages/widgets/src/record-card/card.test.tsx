/**
 * Harness smoke test (task 4b) plus the action-row behavioral coverage
 * (task 5). `selectRenderableActions`'s own filtering logic is already fully
 * tested in `packages/core` — these tests only prove the card wires it up:
 * order, primary-button placement, disabled-action omission, label sourcing,
 * and the host handoff for flow/quick actions.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CardAction, RecordCardPayload } from "@cardstack/core";
import { RecordCard, type WidgetHost } from "./card.tsx";

// This harness doesn't set vitest's `test.globals`, so @testing-library/react's
// auto-cleanup (which detects a global `afterEach`) never registers itself —
// without this, each test's render would pile up in the same jsdom document
// and later `getByRole` queries would match footers from earlier tests too.
afterEach(cleanup);

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

// --- Configured action row (task 5) ---------------------------------------

/** Distinct title/field text from the button labels below, per the smoke
 * test author's note: the same string must never appear in two places an
 * assertion could accidentally match. */
function actionsPayload(actions: CardAction[], canEdit: boolean): RecordCardPayload {
  return {
    ...payload,
    layout: {
      ...payload.layout,
      recordCard: {
        ...payload.layout.recordCard,
        actions,
      },
    },
    capabilities: canEdit
      ? { writeEnabled: true, editableFields: ["dealname"] }
      : { writeEnabled: false, editableFields: [] },
  };
}

function footer() {
  return screen.getByRole("contentinfo");
}

const updateAction: CardAction = {
  type: "update_record",
  label: "Save changes",
  enabled: true,
};
const createAction: CardAction = {
  type: "create_related",
  object: "task",
  label: "Log a task",
  enabled: true,
};
const quickAction: CardAction = {
  type: "quick_action",
  actionApiName: "Send_Quote",
  label: "Send quote",
  enabled: true,
};
const flowAction: CardAction = {
  type: "screen_flow",
  flowApiName: "Renewal_Flow",
  label: "Start renewal",
  embed: "auto",
  inputs: {},
  enabled: true,
};

describe("RecordCard action row", () => {
  it("renders actions in configured array order, not grouped by type", () => {
    render(
      <RecordCard
        payload={actionsPayload([createAction, flowAction, quickAction, updateAction], true)}
        setPayload={() => {}}
        locale="en-US"
        host={null}
      />,
    );
    const buttons = within(footer()).getAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toEqual(["Log a task", "Start renewal", "Send quote", "Save changes"]);
  });

  it("gives the first rendered button the primary class and no others", () => {
    render(
      <RecordCard
        payload={actionsPayload([createAction, flowAction, quickAction], true)}
        setPayload={() => {}}
        locale="en-US"
        host={null}
      />,
    );
    const buttons = within(footer()).getAllByRole("button");
    expect(buttons[0]?.className).toContain("cs-btn--primary");
    expect(buttons[1]?.className).not.toContain("cs-btn--primary");
    expect(buttons[2]?.className).not.toContain("cs-btn--primary");
  });

  it("renders no button for a disabled action", () => {
    render(
      <RecordCard
        payload={actionsPayload(
          [createAction, { ...quickAction, enabled: false }],
          true,
        )}
        setPayload={() => {}}
        locale="en-US"
        host={null}
      />,
    );
    expect(within(footer()).queryByText("Send quote")).toBeNull();
    expect(within(footer()).getByText("Log a task")).toBeTruthy();
  });

  it("uses the configured update_record label instead of 'Edit fields'", () => {
    render(
      <RecordCard
        payload={actionsPayload([updateAction], true)}
        setPayload={() => {}}
        locale="en-US"
        host={null}
      />,
    );
    expect(within(footer()).getByText("Save changes")).toBeTruthy();
    expect(within(footer()).queryByText("Edit fields")).toBeNull();
  });

  it("hands a screen_flow click to the host's sendFollowup, naming the action", () => {
    const sendFollowup = vi.fn();
    const host: WidgetHost = {
      callTool: vi.fn(),
      updateModelContext: vi.fn(),
      sendFollowup,
    };
    render(
      <RecordCard
        payload={actionsPayload([flowAction], true)}
        setPayload={() => {}}
        locale="en-US"
        host={host}
      />,
    );
    fireEvent.click(within(footer()).getByText("Start renewal"));
    expect(sendFollowup).toHaveBeenCalledTimes(1);
    const [text] = sendFollowup.mock.calls[0] as [string];
    expect(text).toContain("Start renewal");
  });

  it("drops update_record and promotes the next action to primary when canEdit is false", () => {
    render(
      <RecordCard
        payload={actionsPayload([updateAction, createAction], false)}
        setPayload={() => {}}
        locale="en-US"
        host={null}
      />,
    );
    expect(within(footer()).queryByText("Save changes")).toBeNull();
    const buttons = within(footer()).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe("Log a task");
    expect(buttons[0]?.className).toContain("cs-btn--primary");
  });

  it("back-compat: an empty actions array with canEdit true still renders 'Edit fields'", () => {
    render(
      <RecordCard
        payload={actionsPayload([], true)}
        setPayload={() => {}}
        locale="en-US"
        host={null}
      />,
    );
    expect(within(footer()).getByText("Edit fields")).toBeTruthy();
  });
});
