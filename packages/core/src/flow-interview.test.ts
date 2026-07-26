/**
 * Interpreter walk of the REAL Test_Screen_Flow definition (fixture captured
 * from the dev org's Tooling API — 5 screens, decision, lookup-fed data table,
 * record create). Effects are stubbed; the interpreter must render every field
 * type, branch the decision, gate the write behind confirmation, and
 * round-trip its (signed) state token.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  continueFlowInterview,
  decodeInterviewState,
  encodeInterviewState,
  startFlowInterview,
  type FlowDefinitionJson,
  type FlowDefResolver,
  type FlowRuntimeEffects,
  type FlowStepResult,
} from "./flow-interview.js";

const def = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/test-screen-flow.json", import.meta.url)), "utf8"),
) as FlowDefinitionJson;

const resolver: FlowDefResolver = async (name) => (name === "Test_Screen_Flow" ? def : null);

function stubEffects(): {
  effects: FlowRuntimeEffects;
  created: { object: string; fields: Record<string, unknown> }[];
} {
  const created: { object: string; fields: Record<string, unknown> }[] = [];
  const effects: FlowRuntimeEffects = {
    queryRecords: async (_object, fields) => [
      { id: "001A", cells: Object.fromEntries(fields.map((f) => [f, `${f}-a`])) },
      { id: "001B", cells: Object.fromEntries(fields.map((f) => [f, `${f}-b`])) },
    ],
    choiceOptions: async () => [
      { value: "001A", label: "Acme" },
      { value: "001B", label: "Globex" },
    ],
    createRecord: async (object, fields) => {
      created.push({ object, fields });
      return "00T_NEW";
    },
  };
  return { effects, created };
}

function stateOf(step: FlowStepResult): string {
  if (step.type === "finished" || step.type === "degrade") throw new Error("no state");
  return encodeInterviewState(step.session);
}

describe("flow interview interpreter (real fixture)", () => {
  it("walks start → lookup → first screen with every field kind rendered", async () => {
    const { effects } = stubEffects();
    const step = await startFlowInterview("Test_Screen_Flow", resolver, effects);
    expect(step.type).toBe("screen");
    if (step.type !== "screen") return;
    expect(step.screen.name).toBe("Intake_Screen");
    const kinds = new Map(step.screen.fields.map((f) => [f.name, f.kind]));
    expect(kinds.get("IntroText")).toBe("display");
    expect(kinds.get("CustomerName")).toBe("input");
    expect(kinds.get("Priority")).toBe("choice");
    expect(kinds.get("Addons")).toBe("choice");
    expect(kinds.get("Notes")).toBe("textarea");
    const dropdown = step.screen.fields.find((f) => f.name === "AccountPick");
    if (dropdown?.kind === "choice") expect(dropdown.options.some((o) => o.label === "Acme")).toBe(true);
  });

  it("re-renders the screen when required answers are missing", async () => {
    const { effects } = stubEffects();
    const start = await startFlowInterview("Test_Screen_Flow", resolver, effects);
    const step = await continueFlowInterview(resolver, stateOf(start), { Quantity: 2 }, {}, effects);
    expect(step.type).toBe("screen");
    if (step.type === "screen") expect(step.screen.name).toBe("Intake_Screen");
  });

  async function driveToDecision(rush: boolean) {
    const { effects, created } = stubEffects();
    const s1 = await startFlowInterview("Test_Screen_Flow", resolver, effects);
    const s2 = await continueFlowInterview(
      resolver,
      stateOf(s1),
      { CustomerName: "Jane", Quantity: 3, RushOrder: rush, Priority: "High", Notes: "note!" },
      {},
      effects,
    );
    const s3 = await continueFlowInterview(resolver, stateOf(s2), { Account_Table: ["001A"] }, {}, effects);
    return { s3, effects, created };
  }

  it("advances to the data table screen with rows from the eager lookup", async () => {
    const { effects } = stubEffects();
    const s1 = await startFlowInterview("Test_Screen_Flow", resolver, effects);
    const s2 = await continueFlowInterview(
      resolver,
      stateOf(s1),
      { CustomerName: "Jane", Quantity: 3, RushOrder: false, Priority: "High" },
      {},
      effects,
    );
    expect(s2.type).toBe("screen");
    if (s2.type !== "screen") return;
    const table = s2.screen.fields.find((f) => f.kind === "datatable");
    if (table?.kind === "datatable") {
      expect(table.columns.map((c) => c.api)).toEqual(["Name", "Industry", "AnnualRevenue"]);
      expect(table.rows).toHaveLength(2);
      expect(table.selectionMode).toBe("multi");
    } else {
      throw new Error("datatable not rendered");
    }
  });

  it("branches the decision on RushOrder and interpolates merge fields", async () => {
    const rush = await driveToDecision(true);
    expect(rush.s3.type).toBe("screen");
    if (rush.s3.type === "screen") {
      expect(rush.s3.screen.name).toBe("Rush_Confirm");
      const display = rush.s3.screen.fields[0];
      if (display?.kind === "display") expect(display.html).toContain("Jane");
    }
    const standard = await driveToDecision(false);
    if (standard.s3.type === "screen") expect(standard.s3.screen.name).toBe("Standard_Confirm");
  });

  it("gates the record create behind confirmation and only writes on confirmWrite", async () => {
    const { s3, effects, created } = await driveToDecision(true);
    const s4 = await continueFlowInterview(resolver, stateOf(s3), {}, {}, effects);
    expect(s4.type).toBe("confirm-write");
    expect(created).toHaveLength(0);
    if (s4.type !== "confirm-write") return;
    expect(s4.write.kind).toBe("create");
    expect(s4.write.object).toBe("Task");
    expect(s4.write.assignments.find((a) => a.field === "Subject")?.value).toBe("Jane");

    const s5 = await continueFlowInterview(resolver, stateOf(s4), {}, { confirmWrite: true }, effects);
    expect(created).toHaveLength(1);
    expect(s5.type).toBe("screen");
    if (s5.type === "screen") {
      const display = s5.screen.fields[0];
      if (display?.kind === "display") expect(display.html).toContain("00T_NEW");
    }
    const s6 = await continueFlowInterview(resolver, stateOf(s5), {}, {}, effects);
    expect(s6.type).toBe("finished");
  });

  it("declining the write cancels without writing", async () => {
    const { s3, effects, created } = await driveToDecision(false);
    const s4 = await continueFlowInterview(resolver, stateOf(s3), {}, {}, effects);
    const s5 = await continueFlowInterview(resolver, stateOf(s4), {}, { confirmWrite: false }, effects);
    expect(s5.type).toBe("finished");
    if (s5.type === "finished") expect(s5.summary).toContain("cancelled");
    expect(created).toHaveLength(0);
  });

  it("back returns to the previous screen with answers intact", async () => {
    const { effects } = stubEffects();
    const s1 = await startFlowInterview("Test_Screen_Flow", resolver, effects);
    const s2 = await continueFlowInterview(
      resolver,
      stateOf(s1),
      { CustomerName: "Jane", Quantity: 3, RushOrder: false, Priority: "Low" },
      {},
      effects,
    );
    const s3 = await continueFlowInterview(resolver, stateOf(s2), {}, { back: true }, effects);
    expect(s3.type).toBe("screen");
    if (s3.type !== "screen") return;
    expect(s3.screen.name).toBe("Intake_Screen");
    const name = s3.screen.fields.find((f) => f.name === "CustomerName");
    if (name?.kind === "input") expect(name.defaultValue).toBe("Jane");
  });

  it("round-trips state tokens and rejects garbage", async () => {
    const { effects } = stubEffects();
    const step = await startFlowInterview("Test_Screen_Flow", resolver, effects);
    if (step.type !== "screen") throw new Error("expected screen");
    const token = encodeInterviewState(step.session);
    expect(decodeInterviewState(token).v).toBe(2);
    expect(() => decodeInterviewState(Buffer.from("{}").toString("base64url"))).toThrow(
      /Unrecognized/,
    );
  });
});
