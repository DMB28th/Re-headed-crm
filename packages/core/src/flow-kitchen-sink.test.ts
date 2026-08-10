/**
 * Real-metadata regression: the kitchen-sink flow captured from the dev org
 * (sections/toggle/slider, visibility rule, validation rule, formula,
 * assignment, subflow, id-targeted record update). Guards the exact JSON
 * shapes Salesforce's Tooling API emits.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  continueFlowInterview,
  encodeInterviewState,
  startFlowInterview,
  type FlowDefinitionJson,
  type FlowDefResolver,
  type FlowRuntimeEffects,
  type FlowStepResult,
} from "./flow-interview.js";
import { analyzeFlowSupport } from "./flow-analysis.js";

const load = (file: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./__fixtures__/${file}`, import.meta.url)), "utf8"),
  ) as FlowDefinitionJson;

const kitchen = load("test-kitchen-sink.json");
const sub = load("test-sub-flow.json");

const resolver: FlowDefResolver = async (name) =>
  name === "Test_Kitchen_Sink" ? kitchen : name === "Test_Sub_Flow" ? sub : null;

function stubEffects() {
  const updates: string[] = [];
  const effects: FlowRuntimeEffects = {
    queryRecords: async () => [{ id: "001X", cells: { Name: "Burlington" } }],
    choiceOptions: async () => [],
    createRecord: async () => "NEW",
    updateRecord: async (object, id) => {
      updates.push(`${object}:${id}`);
    },
  };
  return { effects, updates };
}

const st = (s: FlowStepResult) => {
  if (s.type === "finished" || s.type === "degrade") throw new Error(`no state on ${s.type}`);
  return encodeInterviewState(s.session);
};

describe("kitchen-sink real fixture", () => {
  it("analysis reports full support", () => {
    const report = analyzeFlowSupport(kitchen);
    expect(report.blockers).toEqual([]);
    expect(report.level).toBe("full");
    expect(report.screenCount).toBe(2);
  });

  it("renders sections with toggle+slider and ships the visibility rule", async () => {
    const { effects } = stubEffects();
    const s1 = await startFlowInterview("Test_Kitchen_Sink", resolver, effects);
    expect(s1.type).toBe("screen");
    if (s1.type !== "screen") return;
    const section = s1.screen.fields.find((f) => f.kind === "section");
    expect(section?.kind).toBe("section");
    if (section?.kind === "section") {
      const column = section.fields[0];
      expect(column?.kind).toBe("section");
      if (column?.kind === "section") {
        const kinds = new Map(column.fields.map((f) => [f.name, f.kind]));
        expect(kinds.get("RushToggle")).toBe("input");
        expect(kinds.get("Urgency")).toBe("slider");
      }
    }
    const conditional = s1.screen.fields.find((f) => f.name === "RushReason");
    expect(conditional?.visibility?.conditions[0]?.ref).toBe("RushToggle.value");
  });

  it("validation blocks, then formula/assignment/subflow run and the update confirms", async () => {
    const { effects, updates } = stubEffects();
    const s1 = await startFlowInterview("Test_Kitchen_Sink", resolver, effects);
    const bad = await continueFlowInterview(
      resolver,
      st(s1),
      { QtyInput: 99, RushToggle: true, Urgency: 7 },
      {},
      effects,
    );
    expect(bad.type).toBe("screen");
    if (bad.type === "screen") {
      expect(bad.screen.fields.find((f) => f.name === "QtyInput")?.error).toContain("between 1 and 50");
    }
    const s2 = await continueFlowInterview(
      resolver,
      st(bad),
      { QtyInput: 4, RushToggle: true, Urgency: 7 },
      {},
      effects,
    );
    expect(s2.type).toBe("confirm-write");
    if (s2.type !== "confirm-write") return;
    expect(s2.write.kind).toBe("update");
    expect(s2.write.targetIds).toEqual(["001X"]);
    // Component output {!Urgency.value} resolves inside the text template
    expect(s2.write.assignments[0]?.value).toBe("order x4 at urgency 7");
    expect(updates).toHaveLength(0);

    const s3 = await continueFlowInterview(resolver, st(s2), {}, { confirmWrite: true }, effects);
    expect(updates).toEqual(["Account:001X"]);
    expect(s3.type).toBe("screen");
    if (s3.type === "screen") {
      const display = s3.screen.fields[0];
      if (display?.kind === "display") {
        expect(display.html).toContain("Total 8"); // formula {!QtyInput}*2 via assignment
        expect(display.html).toContain("ORDER X4 AT URGENCY 7!"); // subflow UPPER + auto-stored output
        expect(display.html).toContain("Burlington"); // lookup field ref
      }
    }
  });
});
