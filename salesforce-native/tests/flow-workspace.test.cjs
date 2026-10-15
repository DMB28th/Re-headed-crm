"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const base = () => ({
  contractVersion: "screen-flow/v1",
  status: "Editing",
  recordId: "003000000000001AAA",
  objectApiName: "Contact",
  recordName: "Flow contact",
  revision: 1,
  expiresAt: "2026-10-14T12:15:00Z",
  errors: [],
  diff: [],
  screen: {
    label: "Contact details",
    canNext: true,
    canBack: false,
    canCancel: true,
    inputs: [
      {
        inputId: "EmailInput",
        label: "Email",
        type: "String",
        required: true,
        allowClear: false,
        scale: 0,
        value: "before@example.test",
        choices: [],
        sectionId: "Details",
      },
    ],
    sections: [
      {
        sectionId: "Details",
        label: "Details",
        parentId: null,
        depth: 1,
        columns: 1,
      },
    ],
    plainTextBlocks: ["<b>Literal help</b>"],
  },
});
test("Flow screen projection reuses bounded controls and preserves input IDs without carrying plan authority", async () => {
  const { publicFlowView } =
    await import("../ui/opportunity-edit/flow-contract.mjs");
  const raw = base();
  raw.plan = { secret: "never project" };
  const view = publicFlowView(raw);
  assert.equal(view.status, "Editing");
  assert.equal(view.flow, true);
  assert.equal(view.fields[0].fieldApi, "EmailInput");
  assert.equal(view.fields[0].dataType, "STRING");
  assert.deepEqual(view.layout.sections[0].fields, ["EmailInput"]);
  assert.equal(JSON.stringify(view).includes("never project"), false);
});
test("Flow Boolean absence stays explicit and answers use typed booleans", async () => {
  const { publicFlowView, flowAnswers } =
    await import("../ui/opportunity-edit/flow-contract.mjs");
  const raw = base();
  raw.screen.inputs[0] = {
    ...raw.screen.inputs[0],
    type: "Boolean",
    value: null,
    required: false,
    allowClear: true,
  };
  const view = publicFlowView(raw);
  assert.equal(view.fields[0].value, null);
  assert.deepEqual(
    flowAnswers(view, [
      { fieldApi: "EmailInput", operation: "set", value: "false" },
    ]),
    [{ inputId: "EmailInput", operation: "set", value: false }],
  );
  assert.throws(() =>
    flowAnswers(view, [
      { fieldApi: "HiddenInput", operation: "set", value: "true" },
    ]),
  );
});
test("Flow projection rejects unsupported types and invalid region structure", async () => {
  const { publicFlowView } =
    await import("../ui/opportunity-edit/flow-contract.mjs");
  const raw = base();
  raw.screen.inputs[0].type = "Reference";
  assert.throws(() => publicFlowView(raw));
  const invalid = base();
  invalid.screen.sections[0].parentId = "Missing";
  assert.throws(() => publicFlowView(invalid));
});
module.exports = { base };
