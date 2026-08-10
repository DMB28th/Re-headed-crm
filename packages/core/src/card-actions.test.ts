import { describe, expect, it } from "vitest";
import type { CardAction } from "./layout-config.js";
import {
  actionRef,
  findAction,
  removeAction,
  reorderActions,
  selectRenderableActions,
  setActionEnabled,
  upsertAction,
} from "./card-actions.js";

const edit: CardAction = { type: "update_record", label: "Edit fields", enabled: true };
const flow: CardAction = {
  type: "screen_flow",
  flowApiName: "Renewal",
  label: "Run renewal",
  embed: "auto",
  enabled: true,
  inputs: { renewalDate: { source: "field", field: "Renewal_Date__c" } },
};
const task: CardAction = {
  type: "create_related",
  object: "tasks",
  label: "Log a task",
  enabled: true,
};

describe("actionRef / findAction", () => {
  it("identifies an action independently of its position", () => {
    const found = findAction([edit, task, flow], actionRef(flow));
    expect(found).toEqual(flow);
  });

  it("does not confuse two create_related actions on different objects", () => {
    const notes: CardAction = {
      type: "create_related",
      object: "notes",
      label: "Log a note",
      enabled: true,
    };
    expect(findAction([task, notes], actionRef(notes))?.label).toBe("Log a note");
  });
});

describe("upsertAction", () => {
  it("appends an action that is not present", () => {
    expect(upsertAction([edit], task)).toEqual([edit, task]);
  });

  it("preserves hand-mapped inputs when the action already exists", () => {
    const rebuilt: CardAction = { ...flow, label: "Renewal", inputs: {} };
    const [result] = upsertAction([flow], rebuilt).filter((a) => a.type === "screen_flow");
    expect(result).toMatchObject({ inputs: flow.type === "screen_flow" ? flow.inputs : {} });
  });

  it("keeps the existing label when the incoming one is a bare api name", () => {
    const rebuilt: CardAction = { ...flow, label: "Renewal", inputs: {} };
    const [result] = upsertAction([flow], rebuilt).filter((a) => a.type === "screen_flow");
    expect(result.label).toBe("Run renewal");
  });

  it("keeps an admin-renamed QUICK ACTION label too", () => {
    const renamed: CardAction = {
      type: "quick_action",
      actionApiName: "NewTask",
      label: "Book a follow-up",
      enabled: true,
    };
    const rebuilt: CardAction = { ...renamed, label: "NewTask" };
    const [result] = upsertAction([renamed], rebuilt);
    expect(result.label).toBe("Book a follow-up");
  });

  it("accepts a genuinely new label for any type", () => {
    const renamed: CardAction = {
      type: "quick_action",
      actionApiName: "NewTask",
      label: "Book a follow-up",
      enabled: true,
    };
    const [result] = upsertAction([renamed], { ...renamed, label: "New task" });
    expect(result.label).toBe("New task");
  });

  it("replaces inputs when overwriteInputs is set", () => {
    const rebuilt: CardAction = { ...flow, inputs: {} };
    const [result] = upsertAction([flow], rebuilt, { overwriteInputs: true }).filter(
      (a) => a.type === "screen_flow",
    );
    expect(result.type === "screen_flow" && result.inputs).toEqual({});
  });

  it("does not change position when updating in place", () => {
    const result = upsertAction([edit, flow, task], { ...flow, label: "x" });
    expect(result.map((a) => a.type)).toEqual(["update_record", "screen_flow", "create_related"]);
  });
});

describe("setActionEnabled", () => {
  it("flips the flag without removing or moving the action", () => {
    const result = setActionEnabled([edit, flow, task], actionRef(flow), false);
    expect(result).toHaveLength(3);
    expect(result[1].enabled).toBe(false);
    expect(result[1].type).toBe("screen_flow");
  });

  it("preserves input mappings on a disabled action", () => {
    const [, disabled] = setActionEnabled([edit, flow], actionRef(flow), false);
    expect(disabled.type === "screen_flow" && Object.keys(disabled.inputs)).toEqual([
      "renewalDate",
    ]);
  });

  it("is a no-op when the ref matches nothing", () => {
    expect(setActionEnabled([edit], actionRef(flow), false)).toEqual([edit]);
  });
});

describe("removeAction", () => {
  it("drops only the referenced action", () => {
    expect(removeAction([edit, flow, task], actionRef(flow))).toEqual([edit, task]);
  });
});

describe("reorderActions", () => {
  it("moves an action and preserves the relative order of the rest", () => {
    expect(reorderActions([edit, flow, task], 2, 0).map((a) => a.type)).toEqual([
      "create_related",
      "update_record",
      "screen_flow",
    ]);
  });

  it("returns the list unchanged for out-of-range indices", () => {
    expect(reorderActions([edit, flow], 5, 0)).toEqual([edit, flow]);
  });
});

describe("selectRenderableActions", () => {
  it("preserves configured order rather than grouping by type", () => {
    const result = selectRenderableActions([task, edit, flow], { canEdit: true });
    expect(result.map((a) => a.type)).toEqual([
      "create_related",
      "update_record",
      "screen_flow",
    ]);
  });

  it("drops disabled actions", () => {
    const result = selectRenderableActions([edit, { ...flow, enabled: false }, task], {
      canEdit: true,
    });
    expect(result.map((a) => a.type)).toEqual(["update_record", "create_related"]);
  });

  it("skips update_record when editing is not permitted, promoting the next action", () => {
    const result = selectRenderableActions([edit, flow], { canEdit: false });
    expect(result.map((a) => a.type)).toEqual(["screen_flow"]);
  });

  it("returns an empty list when every action is disabled", () => {
    const result = selectRenderableActions(
      [
        { ...edit, enabled: false },
        { ...flow, enabled: false },
      ],
      { canEdit: true },
    );
    expect(result).toEqual([]);
  });

  it("returns an empty list for an empty configuration", () => {
    expect(selectRenderableActions([], { canEdit: true })).toEqual([]);
  });
});
