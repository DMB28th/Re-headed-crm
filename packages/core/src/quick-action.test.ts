/**
 * Quick-action mapping against the REAL NewTask describe captured from the
 * dev org — guards the exact layoutRows/layoutComponents JSON shapes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decodeQuickActionState,
  encodeQuickActionState,
  quickActionMissingRequired,
  quickActionPendingWrite,
  quickActionScreen,
  quickActionSupport,
  type QuickActionDescribeJson,
} from "./quick-action.js";
import { encodeInterviewState, decodeInterviewState } from "./flow-interview.js";

const newTask = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./__fixtures__/quick-action-newtask-describe.json", import.meta.url)),
    "utf8",
  ),
) as QuickActionDescribeJson;

describe("quick action mapping (real NewTask fixture)", () => {
  it("maps the mini-layout to a renderable screen", () => {
    const screen = quickActionScreen(newTask, {}, {});
    expect(screen.label).toBe("New Task");
    const byName = new Map(screen.fields.map((f) => [f.name, f]));
    // Subject is a combobox → free-text input (suggestions later)
    expect(byName.get("Subject")?.kind).toBe("input");
    expect(byName.get("ActivityDate")).toMatchObject({ kind: "input", dataType: "Date" });
    // Status picklist → dropdown with the org's values
    const status = byName.get("Status");
    expect(status?.kind).toBe("choice");
    if (status?.kind === "choice") {
      expect(status.options.map((o) => o.value)).toContain("In Progress");
      // required in layout but defaultedOnCreate → the CRM fills it; not required in form
      expect(status.required).toBe(false);
    }
    // OwnerId: required + defaultedOnCreate reference → omitted (CRM assigns)
    expect(byName.has("OwnerId")).toBe(false);
    // WhoId: optional reference → plain id input with target hint
    const who = byName.get("WhoId");
    if (who?.kind === "input") expect(who.label).toContain("Contact/Lead");
  });

  it("defaults prefill and answers win over defaults", () => {
    const screen = quickActionScreen(
      newTask,
      { Subject: "Call" },
      { Subject: "Follow up on order" },
    );
    const subject = screen.fields.find((f) => f.name === "Subject");
    if (subject?.kind === "input") expect(subject.defaultValue).toBe("Follow up on order");
  });

  it("builds the confirm diff from non-empty answers only", () => {
    const write = quickActionPendingWrite(newTask, {
      Subject: "Call Dan",
      ActivityDate: "2026-08-01",
      WhoId: null,
    });
    expect(write.kind).toBe("create");
    expect(write.object).toBe("Task");
    expect(write.assignments.map((a) => a.field)).toEqual(["Subject", "ActivityDate"]);
  });

  it("required check respects defaults and defaultedOnCreate", () => {
    // NewTask has no hard-required editable fields once defaultedOnCreate is
    // honored — an empty form is submittable (Salesforce defaults the rest).
    expect(quickActionMissingRequired(newTask, {}, {})).toEqual([]);
  });

  it("classifies action types honestly", () => {
    expect(quickActionSupport("Create").level).toBe("full");
    expect(quickActionSupport("LogACall").level).toBe("full");
    expect(quickActionSupport("SendEmail").level).toBe("handoff");
    expect(quickActionSupport("Custom").level).toBe("handoff");
  });

  it("state tokens round-trip and never collide with flow tokens", () => {
    const token = encodeQuickActionState({
      v: 1,
      kind: "quick-action",
      action: "NewTask",
      object: "Account",
      recordId: "001X",
      answers: { Subject: "Call" },
      confirming: false,
    });
    const decoded = decodeQuickActionState(token);
    expect(decoded?.action).toBe("NewTask");
    // A flow-interview token is NOT a quick-action token…
    const flowToken = encodeInterviewState({ v: 2, frames: [] } as never);
    expect(decodeQuickActionState(flowToken)).toBeNull();
    // …and a quick-action token is rejected by the flow decoder.
    expect(() => decodeInterviewState(token)).toThrow(/Unrecognized/);
  });
});
