/**
 * Synthetic-definition coverage for the interpreter's element handlers:
 * assignments, formulas, loops, collection processors, record updates/deletes,
 * subflows, custom errors, visibility rules, validation rules, sections,
 * sliders/toggles/composites, and the typed degrade path. Each test builds the
 * smallest flow that exercises the element.
 */
import { describe, expect, it } from "vitest";
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

const screenField = (over: Record<string, unknown>) => ({ isRequired: false, ...over });

function effectsWith(over: Partial<FlowRuntimeEffects> = {}): {
  effects: FlowRuntimeEffects;
  log: string[];
} {
  const log: string[] = [];
  return {
    log,
    effects: {
      queryRecords: async () => [
        { id: "A1", cells: { Name: "Acme", Amount: 300 } },
        { id: "A2", cells: { Name: "Beta", Amount: 100 } },
        { id: "A3", cells: { Name: "Zeta", Amount: 200 } },
      ],
      choiceOptions: async () => [],
      createRecord: async (object) => {
        log.push(`create:${object}`);
        return "NEW1";
      },
      updateRecord: async (object, id) => {
        log.push(`update:${object}:${id}`);
      },
      deleteRecord: async (object, id) => {
        log.push(`delete:${object}:${id}`);
      },
      ...over,
    },
  };
}

const state = (s: FlowStepResult) => {
  if (s.type === "finished" || s.type === "degrade") throw new Error(`no state on ${s.type}`);
  return encodeInterviewState(s.session);
};

const resolverFor = (defs: Record<string, FlowDefinitionJson>): FlowDefResolver =>
  async (name) => defs[name] ?? null;

describe("assignments + formulas + text templates", () => {
  const def: FlowDefinitionJson = {
    label: "Calc",
    start: { connector: { targetReference: "Assign" } },
    variables: [{ name: "Total", dataType: "Number", value: { numberValue: 10 } }],
    formulas: [{ name: "Doubled", expression: "{!Total} * 2" }],
    textTemplates: [{ name: "Msg", text: "Total is {!Doubled}" }],
    assignments: [
      {
        name: "Assign",
        assignmentItems: [
          { assignToReference: "Total", operator: "Add", value: { numberValue: 5 } },
        ],
        connector: { targetReference: "Show" },
      },
    ],
    screens: [
      {
        name: "Show",
        label: "Result",
        fields: [screenField({ name: "Out", fieldType: "DisplayText", fieldText: "<p>{!Msg}</p>" })],
      },
    ],
  };

  it("adds, evaluates the formula, and interpolates the template", async () => {
    const { effects } = effectsWith();
    const step = await startFlowInterview("Calc", resolverFor({ Calc: def }), effects);
    expect(step.type).toBe("screen");
    if (step.type !== "screen") return;
    const display = step.screen.fields[0];
    if (display?.kind === "display") expect(display.html).toContain("Total is 30");
  });
});

describe("loops + collection processors", () => {
  const def: FlowDefinitionJson = {
    label: "Looper",
    start: { connector: { targetReference: "Get_Rows" } },
    variables: [{ name: "Names", dataType: "String", value: { stringValue: "" } }],
    recordLookups: [
      {
        name: "Get_Rows",
        object: "Account",
        getFirstRecordOnly: false,
        connector: { targetReference: "Filter_Big" },
      },
    ],
    collectionProcessors: [
      {
        name: "Filter_Big",
        elementSubtype: "FilterCollectionProcessor",
        collectionReference: "Get_Rows",
        conditions: [
          { leftValueReference: "Get_Rows.Amount", operator: "GreaterThan", rightValue: { numberValue: 150 } },
        ],
        connector: { targetReference: "Sort_Rows" },
      },
      {
        name: "Sort_Rows",
        elementSubtype: "SortCollectionProcessor",
        collectionReference: "Filter_Big",
        sortOptions: [{ sortField: "Amount", sortOrder: "Desc" }],
        connector: { targetReference: "Each" },
      },
    ],
    loops: [
      {
        name: "Each",
        collectionReference: "Sort_Rows",
        nextValueConnector: { targetReference: "Collect" },
        noMoreValuesConnector: { targetReference: "Done" },
      },
    ],
    assignments: [
      {
        name: "Collect",
        assignmentItems: [
          { assignToReference: "Names", operator: "Add", value: { elementReference: "Each.Name" } },
        ],
        connector: { targetReference: "Each" },
      },
    ],
    screens: [
      {
        name: "Done",
        label: "Done",
        fields: [screenField({ name: "Out", fieldType: "DisplayText", fieldText: "<p>{!Names}</p>" })],
      },
    ],
  };

  it("filters, sorts, iterates, and accumulates", async () => {
    const { effects } = effectsWith();
    const step = await startFlowInterview("Looper", resolverFor({ Looper: def }), effects);
    expect(step.type).toBe("screen");
    if (step.type !== "screen") return;
    const display = step.screen.fields[0];
    // Amount > 150 → Acme(300), Zeta(200); sorted Desc → AcmeZeta
    if (display?.kind === "display") expect(display.html).toContain("AcmeZeta");
  });
});

describe("record updates and deletes (confirm-gated)", () => {
  const updateDef: FlowDefinitionJson = {
    label: "Updater",
    start: { connector: { targetReference: "Get_One" } },
    recordLookups: [
      {
        name: "Get_One",
        object: "Account",
        getFirstRecordOnly: true,
        connector: { targetReference: "Upd" },
      },
    ],
    recordUpdates: [
      {
        name: "Upd",
        inputReference: "Get_One",
        inputAssignments: [{ field: "Name", value: { stringValue: "Renamed" } }],
        connector: { targetReference: null },
      },
    ],
  };

  it("pauses at confirm and updates only on confirmWrite", async () => {
    const { effects, log } = effectsWith();
    const resolver = resolverFor({ Updater: updateDef });
    const s1 = await startFlowInterview("Updater", resolver, effects);
    expect(s1.type).toBe("confirm-write");
    if (s1.type !== "confirm-write") return;
    expect(s1.write.kind).toBe("update");
    expect(s1.write.targetIds).toEqual(["A1"]);
    expect(log).toHaveLength(0);
    const s2 = await continueFlowInterview(resolver, state(s1), {}, { confirmWrite: true }, effects);
    expect(log).toEqual(["update:Account:A1"]);
    expect(s2.type).toBe("finished");
  });

  it("mass updates without id targeting degrade instead of executing", async () => {
    const massDef: FlowDefinitionJson = {
      label: "Mass",
      start: { connector: { targetReference: "Upd" } },
      recordUpdates: [
        {
          name: "Upd",
          object: "Account",
          filters: [{ field: "Industry", operator: "EqualTo", value: { stringValue: "Tech" } }],
          inputAssignments: [{ field: "Name", value: { stringValue: "X" } }],
        },
      ],
    };
    const { effects, log } = effectsWith();
    const step = await startFlowInterview("Mass", resolverFor({ Mass: massDef }), effects);
    expect(step.type).toBe("degrade");
    expect(log).toHaveLength(0);
  });
});

describe("subflows", () => {
  const parent: FlowDefinitionJson = {
    label: "Parent",
    start: { connector: { targetReference: "Call_Sub" } },
    variables: [{ name: "FromSub", dataType: "String" }],
    subflows: [
      {
        name: "Call_Sub",
        flowName: "Child",
        inputAssignments: [{ name: "Greeting", value: { stringValue: "hello" } }],
        outputAssignments: [{ name: "Result", assignToReference: "FromSub" }],
        connector: { targetReference: "After" },
      },
    ],
    screens: [
      {
        name: "After",
        label: "After",
        fields: [
          screenField({ name: "Out", fieldType: "DisplayText", fieldText: "<p>{!FromSub}</p>" }),
        ],
      },
    ],
  };
  const child: FlowDefinitionJson = {
    label: "Child",
    start: { connector: { targetReference: "Make" } },
    variables: [
      { name: "Greeting", dataType: "String", isInput: true },
      { name: "Result", dataType: "String" },
    ],
    assignments: [
      {
        name: "Make",
        assignmentItems: [
          { assignToReference: "Result", operator: "Assign", value: { elementReference: "Upper" } },
        ],
      },
    ],
    formulas: [{ name: "Upper", expression: "UPPER({!Greeting}) & '!'" }],
  };

  it("runs the child flow and maps outputs back", async () => {
    const { effects } = effectsWith();
    const step = await startFlowInterview("Parent", resolverFor({ Parent: parent, Child: child }), effects);
    expect(step.type).toBe("screen");
    if (step.type !== "screen") return;
    const display = step.screen.fields[0];
    if (display?.kind === "display") expect(display.html).toContain("HELLO!");
  });
});

describe("custom errors, visibility, validation, sections, components", () => {
  it("custom error ends the interview as failed", async () => {
    const def: FlowDefinitionJson = {
      label: "Err",
      start: { connector: { targetReference: "Boom" } },
      customErrors: [
        { name: "Boom", customErrorMessages: [{ errorMessage: "Nope: {!Why}" }] },
      ],
      variables: [{ name: "Why", dataType: "String", value: { stringValue: "reasons" } }],
    };
    const { effects } = effectsWith();
    const step = await startFlowInterview("Err", resolverFor({ Err: def }), effects);
    expect(step.type).toBe("finished");
    if (step.type === "finished") {
      expect(step.failed).toBe(true);
      expect(step.summary).toBe("Nope: reasons");
    }
  });

  const screenDef: FlowDefinitionJson = {
    label: "ScreenKit",
    start: { connector: { targetReference: "S1" } },
    screens: [
      {
        name: "S1",
        label: "Kit",
        connector: { targetReference: null },
        fields: [
          screenField({
            name: "Section1",
            fieldType: "RegionContainer",
            fieldText: "Details",
            fields: [
              screenField({ name: "Toggle1", fieldType: "ComponentInstance", extensionName: "flowruntime:toggle", inputParameters: [{ name: "label", value: { stringValue: "Enabled?" } }] }),
              screenField({ name: "Slide1", fieldType: "ComponentInstance", extensionName: "flowruntime:slider", inputParameters: [{ name: "max", value: { numberValue: 10 } }] }),
              screenField({ name: "Mail1", fieldType: "ComponentInstance", extensionName: "flowruntime:email", inputParameters: [{ name: "label", value: { stringValue: "Email" } }] }),
              screenField({ name: "Name1", fieldType: "ComponentInstance", extensionName: "flowruntime:name" }),
            ],
          }),
          screenField({
            name: "MaybeShown",
            fieldType: "InputField",
            dataType: "String",
            fieldText: "Conditional",
            visibilityRule: {
              conditionLogic: "and",
              conditions: [
                { leftValueReference: "Toggle1", operator: "EqualTo", rightValue: { booleanValue: true } },
              ],
            },
          }),
          screenField({
            name: "Amount",
            fieldType: "InputField",
            dataType: "Number",
            fieldText: "Amount",
            validationRule: {
              formulaExpression: "{!Amount} > 0",
              errorMessage: "Amount must be positive.",
            },
          }),
          screenField({ name: "Upload", fieldType: "ComponentInstance", extensionName: "forceContent:fileUpload" }),
        ],
      },
    ],
  };

  it("renders sections, components, ships same-screen visibility, flags unsupported", async () => {
    const { effects } = effectsWith();
    const step = await startFlowInterview("ScreenKit", resolverFor({ ScreenKit: screenDef }), effects);
    expect(step.type).toBe("screen");
    if (step.type !== "screen") return;
    const section = step.screen.fields.find((f) => f.kind === "section");
    expect(section?.kind).toBe("section");
    if (section?.kind === "section") {
      const kinds = section.fields.map((f) => f.kind);
      expect(kinds).toContain("slider");
      expect(kinds).toContain("composite");
      const toggle = section.fields.find((f) => f.name === "Toggle1");
      if (toggle?.kind === "input") expect(toggle.inputStyle).toBe("toggle");
    }
    const conditional = step.screen.fields.find((f) => f.name === "MaybeShown");
    expect(conditional?.visibility?.conditions[0]?.ref).toBe("Toggle1");
    const upload = step.screen.fields.find((f) => f.name === "Upload");
    expect(upload?.kind).toBe("unsupported");
  });

  it("validation failures re-render the screen with the error message", async () => {
    const { effects } = effectsWith();
    const resolver = resolverFor({ ScreenKit: screenDef });
    const s1 = await startFlowInterview("ScreenKit", resolver, effects);
    const s2 = await continueFlowInterview(resolver, state(s1), { Amount: -5 }, {}, effects);
    expect(s2.type).toBe("screen");
    if (s2.type !== "screen") return;
    const amount = s2.screen.fields.find((f) => f.name === "Amount");
    expect(amount?.error).toBe("Amount must be positive.");
    const s3 = await continueFlowInterview(resolver, state(s2), { Amount: 5 }, {}, effects);
    expect(s3.type).toBe("finished");
  });
});

describe("degrade + analysis", () => {
  const withAction: FlowDefinitionJson = {
    label: "HasAction",
    start: { connector: { targetReference: "S1" } },
    screens: [
      {
        name: "S1",
        label: "One",
        connector: { targetReference: "SendMail" },
        fields: [screenField({ name: "T", fieldType: "InputField", dataType: "String", fieldText: "T" })],
      },
    ],
    actionCalls: [{ name: "SendMail", actionType: "emailSimple" }],
  } as FlowDefinitionJson;

  it("interview degrades with a typed reason at the unsupported element", async () => {
    const { effects } = effectsWith();
    const resolver = resolverFor({ HasAction: withAction });
    const s1 = await startFlowInterview("HasAction", resolver, effects);
    expect(s1.type).toBe("screen"); // renders up TO the blocked element
    const s2 = await continueFlowInterview(resolver, state(s1), { T: "x" }, {}, effects);
    expect(s2.type).toBe("degrade");
    if (s2.type === "degrade") expect(s2.element).toBe("SendMail");
  });

  it("analysis reports partial with the blocker listed", () => {
    const report = analyzeFlowSupport(withAction);
    expect(report.level).toBe("partial");
    expect(report.blockers.some((b) => b.name === "SendMail")).toBe(true);
    expect(report.screenCount).toBe(1);
  });

  it("analysis reports full for the clean kitchen", () => {
    const report = analyzeFlowSupport({
      label: "Clean",
      start: { connector: { targetReference: "S" } },
      screens: [{ name: "S", label: "S", fields: [] }],
      formulas: [{ name: "F", expression: "1 + 1" }],
    });
    expect(report.level).toBe("full");
  });

  it("analysis flags unevaluable formulas", () => {
    const report = analyzeFlowSupport({
      label: "BadFormula",
      screens: [{ name: "S", label: "S", fields: [] }],
      formulas: [{ name: "F", expression: "VLOOKUP({!X})" }],
    });
    expect(report.level).toBe("partial");
    expect(report.blockers[0]?.location).toBe("formulas");
  });
});
