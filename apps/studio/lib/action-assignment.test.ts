import { describe, expect, it } from "vitest";
import type { CardAction } from "@cardstack/core";
import { planActionAssignment } from "./action-assignment";

const renewal: CardAction = {
  type: "screen_flow",
  flowApiName: "Renewal",
  label: "Run renewal",
  embed: "auto",
  enabled: true,
  inputs: { renewalDate: { source: "field", field: "Custom__c" } },
};

describe("planActionAssignment", () => {
  it("disabling preserves the action and marks it disabled", () => {
    const next = planActionAssignment({
      actions: [renewal],
      kind: "screen_flow",
      apiName: "Renewal",
      enabled: false,
      autoMappedInputs: {},
      discoveredLabel: "Renewal",
    });
    expect(next.actions).toHaveLength(1);
    const action = next.actions[0]!;
    expect(action.enabled).toBe(false);
    expect(action.type).toBe("screen_flow");
  });

  it("re-enabling preserves hand-mapped inputs", () => {
    const next = planActionAssignment({
      actions: [{ ...renewal, enabled: false }],
      kind: "screen_flow",
      apiName: "Renewal",
      enabled: true,
      // the name-convention auto-mapper would produce this
      autoMappedInputs: { renewalDate: { source: "field", field: "Renewal_Date__c" } },
      discoveredLabel: "Renewal",
    });
    const action = next.actions[0]!;
    expect(action.type === "screen_flow" && action.inputs.renewalDate).toEqual({
      source: "field",
      field: "Custom__c",
    });
  });

  it("keeps the admin's label when the discovered one is the bare api name", () => {
    const next = planActionAssignment({
      actions: [renewal],
      kind: "screen_flow",
      apiName: "Renewal",
      enabled: true,
      autoMappedInputs: {},
      discoveredLabel: "Renewal",
    });
    const action = next.actions[0]!;
    expect(action.label).toBe("Run renewal");
  });

  it("auto-maps inputs for a genuinely new action", () => {
    const next = planActionAssignment({
      actions: [],
      kind: "screen_flow",
      apiName: "Onboarding",
      enabled: true,
      autoMappedInputs: { owner: { source: "field", field: "OwnerId" } },
      discoveredLabel: "Onboarding flow",
    });
    const action = next.actions[0]!;
    expect(action.type === "screen_flow" && action.inputs.owner).toEqual({
      source: "field",
      field: "OwnerId",
    });
    expect(action.label).toBe("Onboarding flow");
  });

  it("disabling an action that was never configured is a no-op", () => {
    const next = planActionAssignment({
      actions: [],
      kind: "screen_flow",
      apiName: "Ghost",
      enabled: false,
      autoMappedInputs: {},
      discoveredLabel: "Ghost",
    });
    expect(next.actions).toEqual([]);
  });

  it("adds a quick action without inputs", () => {
    const next = planActionAssignment({
      actions: [],
      kind: "quick_action",
      apiName: "NewTask",
      enabled: true,
      autoMappedInputs: {},
      discoveredLabel: "New task",
    });
    const action = next.actions[0]!;
    expect(action).toEqual({
      type: "quick_action",
      actionApiName: "NewTask",
      label: "New task",
      enabled: true,
    });
  });
});
