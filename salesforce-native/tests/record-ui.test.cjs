"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const req = createRequire(
  path.resolve(process.env.CARDSTACK_UI_DEPENDENCIES, "../package.json"),
);
const { JSDOM } = req("jsdom");
const tick = () => new Promise((r) => setImmediate(r));
const id = "003000000000001AAA";
const fields = () => [
  {
    fieldApi: "LastName",
    label: "Last name",
    value: "Before",
    dataType: "STRING",
    required: true,
    canClear: false,
    choices: [],
  },
  {
    fieldApi: "Description",
    label: "Description",
    value: "Notes",
    dataType: "TEXTAREA",
    required: false,
    canClear: true,
    choices: [],
  },
  {
    fieldApi: "HasOptedOutOfEmail",
    label: "Email opt out",
    value: "false",
    dataType: "BOOLEAN",
    required: false,
    canClear: false,
    choices: [],
  },
];
const diff = () => [
  {
    fieldApi: "LastName",
    label: "Last name",
    beforeValue: "Before",
    afterValue: "After",
  },
];
function result(status = "Card", recordId = id) {
  const raw = {
    contractVersion: status === "Card" ? "record-card/v1" : "record-edit/v1",
    objectApiName: "Contact",
    recordId,
    recordName: "Synthetic Contact",
    fields: fields(),
    status,
    errors: [],
    diff: [],
    revision: 1,
    expiresAt: "2026-10-12T12:15:00Z",
  };
  if (status === "Card")
    raw.actions = [
      { name: "editContact", label: "Edit Contact", type: "record-edit" },
    ];
  if (status === "Review")
    Object.assign(raw, { revision: 2, reviewRevision: 1, diff: diff() });
  if (status === "Completed")
    Object.assign(raw, {
      revision: 3,
      receipt: {
        reference: "receipt-" + "c".repeat(32),
        actorDisplayName: "Synthetic actor",
        completedAt: "2026-10-12T12:00:03Z",
        status: "saved",
        diff: diff(),
      },
    });
  return {
    structuredContent: raw,
    _meta: {
      "cardstack/recordEdit": {
        interactionKey: "a".repeat(64),
        reviewGrant: status === "Review" ? "b".repeat(64) : null,
      },
    },
  };
}
async function harness(options = {}) {
  const { mountRecordEdit } =
    await import("../ui/opportunity-edit/controller.mjs");
  assert.equal(
    typeof mountRecordEdit,
    "function",
    "generic compatibility mount is available",
  );
  const dom = new JSDOM('<main id="root"></main>'),
    pending = [],
    calls = [];
  const app = {
    connect() {
      assert.equal(typeof this.ontoolresult, "function");
      return Promise.resolve();
    },
    callServerTool(input) {
      calls.push(input);
      return new Promise((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    },
  };
  mountRecordEdit(app, dom.window.document, {
    now: () => Date.parse("2026-10-12T12:00:00Z"),
    setInterval: () => 1,
    clearInterval: () => {},
    deliveryQaEnabled: options.deliveryQaEnabled === true,
  });
  await tick();
  const doc = dom.window.document;
  return {
    app,
    doc,
    calls,
    open: (r) => app.ontoolresult(r),
    click: (a) => doc.querySelector(`[data-action=${a}]`).click(),
    reply: (r) => pending.shift().resolve(r),
    fail: () => pending.shift().reject(Error("read failed")),
    state: () => doc.querySelector("[data-state]")?.dataset.state,
  };
}
async function editing() {
  const h = await harness();
  h.open(result());
  h.doc.querySelector("[data-action=start]").click();
  h.reply(result("Editing"));
  await tick();
  return h;
}

test("Contact mount initializes all descriptors and uses fixed generic start tool", async () => {
  const h = await editing();
  assert.equal(h.doc.querySelector("[data-field=LastName]").value, "Before");
  assert.equal(h.doc.querySelector("[data-field=Description]").value, "Notes");
  assert.equal(
    h.doc.querySelector("[data-field=HasOptedOutOfEmail]").checked,
    false,
  );
  assert.equal(h.calls[0].name, "cardstack_record_edit_start");
});
test("Contact exact multi-field patch reviews, confirms, retains receipt on read failure and refreshes", async () => {
  const h = await editing();
  h.doc.querySelector("[data-field=LastName]").value = "After";
  h.doc.querySelector("[data-clear=Description]").checked = true;
  h.doc.querySelector("[data-field=HasOptedOutOfEmail]").checked = true;
  h.click("review");
  assert.deepEqual(h.calls.at(-1), {
    name: "cardstack_record_edit_transition",
    arguments: {
      interactionKey: "a".repeat(64),
      operation: "review",
      expectedRevision: 1,
      changes: [
        { fieldApi: "LastName", operation: "set", value: "After" },
        { fieldApi: "Description", operation: "clear" },
        { fieldApi: "HasOptedOutOfEmail", operation: "set", value: "true" },
      ],
    },
  });
  h.reply(result("Review"));
  await tick();
  h.click("confirm");
  assert.deepEqual(h.calls.at(-1).arguments, {
    interactionKey: "a".repeat(64),
    operation: "confirm",
    expectedRevision: 2,
    reviewRevision: 1,
    reviewGrant: "b".repeat(64),
  });
  h.reply(result("Completed"));
  await tick();
  const receipt = h.doc.querySelector("[data-receipt]").textContent;
  h.click("refresh");
  h.fail();
  await tick();
  assert.equal(h.doc.querySelector("[data-receipt]").textContent, receipt);
  h.click("refresh");
  assert.equal(h.calls.at(-1).name, "cardstack_record_refresh");
  h.reply(result());
  await tick();
  assert.ok(h.doc.querySelector("[data-current-card]"));
});
test("Contact untouched values submit an empty patch and noChanges receipt", async () => {
  const h = await editing();
  h.click("review");
  assert.deepEqual(h.calls.at(-1).arguments.changes, []);
  const r = result("Completed");
  r.structuredContent.receipt.status = "noChanges";
  r.structuredContent.receipt.diff = [];
  h.reply(r);
  await tick();
  assert.ok(h.doc.querySelector("[data-receipt]"));
});
test("Contact record switch drops delayed response and old authority", async () => {
  const h = await editing();
  h.click("review");
  h.app.ontoolinput({ arguments: { recordId: "003000000000002AAA" } });
  h.open(result("Card", "003000000000002AAA"));
  h.reply(result("Review"));
  await tick();
  assert.equal(h.state(), "Card");
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
});
test("generic private envelope rejects wrong-family keys and private public leaks", async () => {
  for (const mutation of [
    (r) => {
      r._meta = {
        "cardstack/opportunityEdit": r._meta["cardstack/recordEdit"],
      };
    },
    (r) => {
      r.structuredContent.recordName = "a".repeat(64);
    },
  ]) {
    const h = await harness();
    const r = result("Review");
    mutation(r);
    h.open(r);
    assert.equal(h.state(), "Unavailable");
    assert.doesNotMatch(h.doc.body.textContent, /a{64}/);
  }
});
test("generic contract rejects malformed identity, object, family, fields, diff and revisions", async () => {
  const module = await import("../ui/opportunity-edit/record-contract.mjs");
  for (const mutation of [
    (r) => (r.recordId = "003000000000001AAB"),
    (r) => (r.recordId = "001000000000001"),
    (r) => (r.objectApiName = "Account FROM User"),
    (r) => (r.contractVersion = "opportunity-edit/v1"),
    (r) => (r.fields = []),
    (r) =>
      (r.fields = Array.from({ length: 21 }, (_, i) => ({
        ...fields()[0],
        fieldApi: "Field" + i,
      }))),
    (r) => r.fields.push({ ...r.fields[0] }),
    (r) => (r.fields[0].required = "true"),
    (r) => (r.fields[2].value = "False"),
    (r) => (r.fields[0].value = "x".repeat(4097)),
    (r) => (r.revision = 0),
    (r) => (r.reviewRevision = 1.5),
    (r) => (r.diff[0].fieldApi = "Unknown"),
  ]) {
    const raw = result("Review").structuredContent;
    mutation(raw);
    assert.throws(() => module.publicView(raw));
  }
  const raw = result("Review").structuredContent;
  const projected = module.publicView(raw);
  assert.equal(projected.objectApiName, "Contact");
  assert.equal(projected.fields.length, 3);
  assert.notEqual(projected.fields, raw.fields);
  raw.fields[0].label = "Mutation";
  assert.equal(projected.fields[0].label, "Last name");
});

function accountResult(status = "Card") {
  const r = result(status, "001000000000001AAA");
  Object.assign(r.structuredContent, {
    objectApiName: "Account",
    recordName: "Configured Account",
    fields: [
      {
        fieldApi: "NumberOfEmployees",
        label: "Employees",
        value: "5",
        dataType: "INTEGER",
        required: false,
        canClear: true,
        choices: [],
        precision: 10,
        scale: 0,
      },
      {
        fieldApi: "Name",
        label: "Account name",
        value: "Configured Account",
        dataType: "STRING",
        required: true,
        canClear: false,
        choices: [],
        length: 255,
      },
      {
        fieldApi: "Description",
        label: "Notes",
        value: "Before",
        dataType: "TEXTAREA",
        required: false,
        canClear: true,
        choices: [],
        length: 32000,
      },
    ],
    layout: {
      version: 1,
      sections: [
        {
          id: "identity",
          label: "Configured details",
          columns: 1,
          fields: ["Name", "NumberOfEmployees", "Description"],
        },
      ],
    },
  });
  if (status === "Card")
    r.structuredContent.actions = [
      {
        name: "configured",
        label: "Edit configured details",
        type: "record-edit",
      },
    ];
  if (status === "Review")
    r.structuredContent.diff = [
      {
        fieldApi: "NumberOfEmployees",
        label: "Employees",
        beforeValue: "5",
        afterValue: "0",
      },
    ];
  return r;
}
test("configuration-only Account uses the generic renderer and exact integer patch", async () => {
  const h = await harness();
  h.open(accountResult());
  assert.equal(h.state(), "Card");
  h.click("start");
  assert.deepEqual(h.calls.at(-1), {
    name: "cardstack_record_edit_start",
    arguments: { recordId: "001000000000001AAA", actionName: "configured" },
  });
  h.reply(accountResult("Editing"));
  await tick();
  assert.deepEqual(
    [...h.doc.querySelectorAll("[data-field]")].map((f) => f.dataset.field),
    ["Name", "NumberOfEmployees", "Description"],
  );
  h.doc.querySelector("[data-field=NumberOfEmployees]").value = "0";
  h.click("review");
  assert.deepEqual(h.calls.at(-1).arguments.changes, [
    { fieldApi: "NumberOfEmployees", operation: "set", value: "0" },
  ]);
  h.reply(accountResult("Review"));
  await tick();
  assert.equal(h.state(), "Review");
  h.click("confirm");
  assert.deepEqual(Object.keys(h.calls.at(-1).arguments).sort(), [
    "expectedRevision",
    "interactionKey",
    "operation",
    "reviewGrant",
    "reviewRevision",
  ]);
});
test("qualified Account integer cards preserve signed-int32 endpoints and reject unqualified metadata", async () => {
  const { publicView } =
    await import("../ui/opportunity-edit/record-contract.mjs");
  for (const value of ["2147483647", "-2147483648", "0"]) {
    const raw = accountResult().structuredContent;
    raw.fields[0].value = value;
    assert.equal(publicView(raw).fields[0].value, value);
  }
  for (const value of ["2147483648", "-2147483649", "1.5", "1e3"]) {
    const raw = accountResult().structuredContent;
    raw.fields[0].value = value;
    assert.throws(() => publicView(raw));
  }
  const unqualified = accountResult().structuredContent;
  unqualified.fields[0].precision = 0;
  assert.throws(
    () => publicView(unqualified),
    "native precision0 must be qualified by the server codec before rendering",
  );
});
test("generic contract supports canonical custom objects with native numeric and date descriptors", async () => {
  const { publicView } =
    await import("../ui/opportunity-edit/record-contract.mjs");
  const r = accountResult("Editing").structuredContent;
  r.objectApiName = "sales__Project__c";
  r.recordId = "a01000000000001AAA";
  r.fields = [
    {
      fieldApi: "Budget__c",
      label: "Budget",
      dataType: "CURRENCY",
      value: "9007199254740993.25",
      required: false,
      canClear: true,
      precision: 18,
      scale: 2,
      currencyCode: "USD",
    },
    {
      fieldApi: "Due__c",
      label: "Due",
      dataType: "DATE",
      value: "2028-02-29",
      required: false,
      canClear: true,
    },
  ];
  delete r.layout;
  assert.equal(publicView(r).fields[0].value, "9007199254740993.25");
  for (const mutation of [
    (x) => (x.fields[0].scale = -1),
    (x) => (x.fields[0].precision = 0),
    (x) => (x.fields[0].value = "1e3"),
    (x) => (x.fields[1].value = "2027-02-29"),
    (x) => (x.fields[0].dataType = "REFERENCE"),
    (x) => (x.fields[0].currencyCode = null),
  ]) {
    const malformed = structuredClone(r);
    mutation(malformed);
    assert.throws(() => publicView(malformed));
  }
});
test("cross-object host switch discards delayed review and private authority", async () => {
  const h = await editing();
  h.click("review");
  h.app.ontoolinput({ arguments: { recordId: "001000000000001AAA" } });
  h.open(accountResult());
  h.reply(result("Review"));
  await tick();
  assert.equal(h.state(), "Card");
  assert.equal(h.doc.querySelector("h1").textContent, "Configured Account");
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
});
test("generic scalar validation respects native integer range and decimal scale without floating-point loss", async () => {
  const { validateChanges } = await import("../ui/opportunity-edit/fields.mjs");
  const integer = {
    ...accountResult("Editing").structuredContent.fields[0],
    precision: 10,
    scale: 0,
  };
  for (const value of ["0.5", "1e3", "2147483648", "-2147483649"]) {
    const parsed = validateChanges([integer], {
      NumberOfEmployees: { operation: "set", value },
    });
    assert.equal(parsed.changes.length, 0);
    assert.equal(parsed.errors.length, 1);
  }
  for (const value of ["2147483647", "-2147483648", "0"])
    assert.equal(
      validateChanges([integer], {
        NumberOfEmployees: { operation: "set", value },
      }).changes[0].value,
      value,
    );
  const currency = {
    fieldApi: "Budget__c",
    dataType: "CURRENCY",
    precision: 18,
    scale: 2,
  };
  assert.equal(
    validateChanges([currency], {
      Budget__c: { operation: "set", value: "9007199254740993.25" },
    }).changes[0].value,
    "9007199254740993.25",
  );
  for (const value of ["1.234", "10000000000000000.00", "1e2"])
    assert.equal(
      validateChanges([currency], { Budget__c: { operation: "set", value } })
        .changes.length,
      0,
    );
});
test("leading-dot and grouped qualified decimals submit exact native-accepted scalar strings", async () => {
  const { validateChanges, canonicalNumericValue } =
    await import("../ui/opportunity-edit/fields.mjs");
  const field = {
    fieldApi: "Amount",
    dataType: "CURRENCY",
    precision: 18,
    scale: 2,
    required: false,
    canClear: true,
  };
  for (const [input, value] of [
    [".50", "0.50"],
    ["-.50", "-0.50"],
    ["12,345.50", "12345.50"],
    ["-9,007,199,254,740,993.25", "-9007199254740993.25"],
  ]) {
    const parsed = validateChanges([field], {
      Amount: { operation: "set", value: input },
    });
    assert.deepEqual(parsed, {
      changes: [{ fieldApi: "Amount", operation: "set", value }],
      errors: [],
    });
    assert.match(parsed.changes[0].value, /^-?[0-9]+(?:\.[0-9]+)?$/);
    assert.equal(canonicalNumericValue(input, "CURRENCY"), value);
  }
  for (const input of [
    ".5e2",
    "-.50e1",
    "1,23.50",
    ".501",
    "10000000000000000.50",
  ])
    assert.equal(
      validateChanges([field], { Amount: { operation: "set", value: input } })
        .changes.length,
      0,
    );
});
test("same-ID cross-object awaited response cannot install review authority", async () => {
  const h = await editing();
  h.click("review");
  const r = result("Review");
  r.structuredContent.objectApiName = "Account";
  h.reply(r);
  await tick();
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
  assert.equal(h.state(), "Unknown");
});
test("generic terminal denial permits omitted identity", async () => {
  const { publicView } =
    await import("../ui/opportunity-edit/record-contract.mjs");
  assert.equal(
    publicView({
      contractVersion: "record-edit/v1",
      status: "Rejected",
      errors: [{ code: "FORBIDDEN", message: "Unavailable" }],
    }).status,
    "Rejected",
  );
});
test("generic awaited wrong interview cannot install review authority", async () => {
  const h = await editing();
  h.click("review");
  const r = result("Review");
  r._meta["cardstack/recordEdit"].interactionKey = "d".repeat(64);
  h.reply(r);
  await tick();
  assert.equal(h.state(), "Unknown");
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
});
test("generic receipt diffs must belong to retained descriptors", async () => {
  const { publicView } =
    await import("../ui/opportunity-edit/record-contract.mjs");
  const raw = result("Completed").structuredContent;
  raw.receipt.diff[0].fieldApi = "Amount";
  assert.throws(() => publicView(raw));
});
test("Opportunity mount rejects generic family and Contact mount rejects Opportunity", async () => {
  const { mountOpportunity } =
    await import("../ui/opportunity-edit/controller.mjs");
  const dom = new JSDOM('<main id="root"></main>');
  const app = { connect: () => Promise.resolve() };
  mountOpportunity(app, dom.window.document, {
    setInterval: () => 1,
    clearInterval: () => {},
  });
  await tick();
  app.ontoolresult(result());
  assert.equal(
    dom.window.document.querySelector("[data-state]").dataset.state,
    "Unavailable",
  );
  const h = await harness();
  const r = result();
  r.structuredContent.contractVersion = "opportunity-card/v1";
  h.open(r);
  assert.equal(h.state(), "Unavailable");
});
test("built Contact preview uses shared controls and keeps Save disabled", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(
    path.resolve(
      __dirname,
      "../force-app/main/default/staticresources/CardstackOpportunityPreviewUi.resource",
    ),
    "utf8",
  );
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const button = [...dom.window.document.querySelectorAll("nav button")].find(
    (b) => b.textContent === "Contact fields",
  );
  assert.ok(button, "Contact scenario exists");
  button.click();
  assert.equal(
    dom.window.document.querySelector("[data-field=LastName]").value,
    "Synthetic Contact",
  );
  dom.window.document.querySelector("[data-field=LastName]").value = "After";
  dom.window.document.querySelector("[data-action=review]").click();
  assert.equal(
    dom.window.document.querySelector("[data-action=confirm]").disabled,
    true,
  );
  dom.window.close();
});
test("built Contact synthetic fixture saves exact values then reads same mock record", async () => {
  const fs = require("node:fs");
  const file = path.resolve(__dirname, "fixtures/record-screen-demo.html");
  assert.ok(fs.existsSync(file), "Contact fixture exists");
  const dom = new JSDOM(fs.readFileSync(file, "utf8"), {
    runScripts: "dangerously",
    beforeParse(w) {
      w.structuredClone = global.structuredClone;
    },
  });
  await tick();
  const doc = dom.window.document;
  doc.querySelector("[data-action=start]").click();
  await tick();
  doc.querySelector("[data-field=LastName]").value = "After";
  doc.querySelector("[data-clear=Description]").checked = true;
  doc.querySelector("[data-field=HasOptedOutOfEmail]").checked = true;
  doc.querySelector("[data-action=review]").click();
  await tick();
  doc.querySelector("[data-action=confirm]").click();
  await tick();
  assert.ok(
    doc.querySelector("[data-receipt]"),
    doc.querySelector("#root").textContent,
  );
  assert.match(doc.querySelector("[data-receipt]").textContent, /After/);
  doc.querySelector("[data-action=refresh]").click();
  await tick();
  assert.match(doc.querySelector("[data-current-card]").textContent, /After/);
  assert.match(doc.querySelector("[data-current-card]").textContent, /true/);
  assert.match(doc.body.textContent, /Actual Salesforce writes: none/);
  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  dom.window.close();
});
test("generic record heading retains canonical object instead of Opportunity", async () => {
  const h = await harness();
  h.open(result());
  assert.equal(h.doc.querySelector("h2").textContent, "Contact");
});
test("generic Boolean review values use exact native grammar", async () => {
  const { publicView } =
    await import("../ui/opportunity-edit/record-contract.mjs");
  for (const value of ["False", "1", null]) {
    const raw = result("Review").structuredContent;
    raw.diff = [
      {
        fieldApi: "HasOptedOutOfEmail",
        label: "Email opt out",
        beforeValue: "false",
        afterValue: value,
      },
    ];
    assert.throws(() => publicView(raw));
  }
});

const configuredLayout = () => ({
  version: 1,
  sections: [
    {
      id: "identity",
      label: "Published identity",
      columns: 1,
      fields: ["LastName"],
    },
    {
      id: "preferences",
      label: "Published preferences",
      columns: 2,
      fields: ["Description", "HasOptedOutOfEmail"],
    },
  ],
});
test("generic controller retains checked published sections and columns", async () => {
  const h = await harness();
  h.open(result());
  h.click("start");
  const r = result("Editing");
  r.structuredContent.layout = configuredLayout();
  h.reply(r);
  await tick();
  assert.deepEqual(
    [...h.doc.querySelectorAll("legend")].map((e) => e.textContent),
    ["Published identity", "Published preferences"],
  );
  assert.deepEqual(
    [...h.doc.querySelectorAll("fieldset .field-grid")].map((e) => e.className),
    ["field-grid columns-1", "field-grid columns-2"],
  );
});
test("generic layout projection rejects unknown, duplicate, missing and executable references", async () => {
  const { publicView } =
    await import("../ui/opportunity-edit/record-contract.mjs");
  for (const mutate of [
    (l) => l.sections[0].fields.push("Unknown"),
    (l) => l.sections[1].fields.push("LastName"),
    (l) => l.sections.pop(),
    (l) => (l.sections[0].style = "x"),
  ]) {
    const r = result("Editing").structuredContent;
    r.layout = configuredLayout();
    mutate(r.layout);
    assert.throws(() => publicView(r), /INVALID_LAYOUT/);
  }
  const r = result("Review").structuredContent;
  r.layout = configuredLayout();
  const v = publicView(r);
  r.layout.sections[0].label = "Mutation";
  assert.equal(v.layout.sections[0].label, "Published identity");
});

test("generic Lead renderer uses independent selects and literal native string controls", async () => {
  const h = await harness();
  const rating = {
    fieldApi: "Rating",
    label: "Rating",
    dataType: "PICKLIST",
    value: "Retired_API",
    required: false,
    canClear: true,
    length: 40,
    choices: [{ label: "Hot <literal>", value: "Hot_API" }],
  };
  const source = {
    ...rating,
    fieldApi: "LeadSource",
    label: "Lead source",
    value: null,
    choices: [{ label: "Web display", value: "Web_API" }],
  };
  const typed = ["EMAIL", "PHONE", "URL"].map((dataType, index) => ({
    fieldApi: ["Email", "Phone", "Website"][index],
    label: dataType,
    dataType,
    value: index === 2 ? "javascript:alert(1)" : null,
    required: false,
    canClear: true,
    length: 255,
    choices: [],
  }));
  function lead(status) {
    const r = result(status);
    Object.assign(r.structuredContent, {
      objectApiName: "Lead",
      recordId: "00Q000000000001EAA",
      fields: [rating, source, ...typed],
    });
    return r;
  }
  h.open(lead("Card"));
  assert.equal(h.doc.querySelector("a"), null);
  h.click("start");
  h.reply(lead("Editing"));
  await tick();
  const left = h.doc.querySelector("[data-field=Rating]"),
    right = h.doc.querySelector("[data-field=LeadSource]");
  assert.equal(left.tagName, "SELECT");
  assert.deepEqual(
    [...left.options].filter((o) => !o.disabled).map((o) => o.value),
    ["", "Hot_API"],
  );
  assert.deepEqual(
    [...right.options].map((o) => o.value),
    ["", "Web_API"],
  );
  assert.equal(right.value, "", "Existing null receives no default choice.");
  assert.equal(
    [...left.options].find((o) => o.value === "Retired_API").disabled,
    true,
  );
  assert.equal(h.doc.querySelector("[data-field=Website]").type, "text");
  assert.equal(h.doc.querySelector("a"), null);
  const literal = "  Exact <x>  ";
  h.doc.querySelector("[data-field=Email]").value = literal;
  left.value = "Hot_API";
  right.value = "Web_API";
  h.click("review");
  const changes = h.calls.at(-1).arguments.changes;
  assert.ok(changes.some((c) => c.fieldApi === "Email" && c.value === literal));
  assert.ok(
    changes.some((c) => c.fieldApi === "Rating" && c.value === "Hot_API"),
  );
  assert.ok(
    changes.some((c) => c.fieldApi === "LeadSource" && c.value === "Web_API"),
  );
  assert.equal(
    h.doc.querySelector("x"),
    null,
    "Labels and values never become markup.",
  );
});
test("completed generic receipt renders historical picklist outcome without an editable selector", async () => {
  const h = await harness();
  const r = result("Completed");
  r.structuredContent.fields = [
    {
      fieldApi: "Rating",
      label: "Rating",
      dataType: "PICKLIST",
      value: "Current_API",
      required: false,
      canClear: true,
      length: 40,
      choices: [],
    },
  ];
  r.structuredContent.receipt.diff = [
    {
      fieldApi: "Rating",
      label: "Rating",
      beforeValue: "Retired_API",
      afterValue: "Saved_API",
    },
  ];
  h.open(r);
  assert.equal(h.state(), "Completed");
  assert.match(h.doc.querySelector("[data-receipt]").textContent, /Saved_API/);
  assert.equal(h.doc.querySelector("select[data-field]"), null);
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
  assert.ok(
    h.doc.querySelector("[data-action=refresh]"),
    "Fresh choices require an explicit current-record refresh.",
  );
});

test("built ten-field Lead fixture obeys checked descriptor metadata and configured section review order", async (t) => {
  const fs = require("node:fs");
  const html = fs.readFileSync(
    path.resolve(__dirname, "fixtures/record-screen-demo.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://synthetic.test/",
    beforeParse(w) {
      w.structuredClone = global.structuredClone;
    },
  });
  t.after(() => {
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom.window.close();
  });
  await tick();
  const doc = dom.window.document;
  [...doc.querySelectorAll("nav button")]
    .find((button) => button.textContent === "Open ten-field synthetic Lead")
    .click();
  assert.match(doc.querySelector("h1").textContent, /Synthetic Lead/);
  doc.querySelector("[data-action=start]").click();
  await tick();
  assert.equal(doc.querySelectorAll("[data-field]").length, 10);
  const title = doc.querySelector("[data-field=Title]");
  title.value = "Exact unsaved title";
  title.focus();
  title.setSelectionRange(1, 4);
  const clear = doc.querySelector("[data-clear=Description]");
  clear.click();
  [...doc.querySelectorAll("nav button")]
    .find((button) => button.textContent === "Rerender Editing in 1 second")
    .click();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(doc.querySelector("[data-field=Title]"), title);
  assert.equal(doc.activeElement, title);
  assert.equal(title.selectionStart, 1);
  assert.equal(title.selectionEnd, 4);
  assert.equal(clear.checked, true);
  doc.querySelector("[data-action=review]").click();
  await tick();
  assert.equal(doc.querySelector("[role=status]").dataset.state, "Review");
  assert.deepEqual(
    [...doc.querySelectorAll(".workspace-content h3")].map(
      (node) => node.textContent,
    ),
    ["Identity", "Notes"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll("tbody th")].map((node) => node.textContent),
    ["Title", "Description"],
  );
  dom.window.close();
});

function discovery(
  candidates = [
    {
      recordId: id,
      objectApiName: "Contact",
      objectLabel: "Contact",
      recordName: "Same name",
      context: [],
    },
  ],
) {
  return {
    structuredContent: {
      contractVersion: "record-discovery/v1",
      status: candidates.length ? "Matches" : "Empty",
      candidates,
      hasMore: false,
      needsSelection: candidates.length > 1,
      searchIndexMayLag: true,
      searchedObjects: ["Contact"],
      unavailableObjects: [],
    },
  };
}
test("discovery requires an explicit choice and opens only the selected full ID", async () => {
  const h = await harness();
  h.open(discovery());
  assert.equal(h.state(), "Discovery");
  assert.equal(h.calls.length, 0);
  h.doc.querySelector("[data-candidate]").click();
  assert.deepEqual(h.calls[0], {
    name: "cardstack_record_open",
    arguments: { recordId: id },
  });
  h.reply(result());
  await tick();
  assert.equal(h.state(), "Card");
});
test("search input retires a reviewed interaction and ignores its delayed response", async () => {
  const h = await editing();
  h.click("cancel");
  h.app.ontoolinput({ arguments: { query: "Same" } });
  h.open(discovery());
  h.reply(result("Completed"));
  await tick();
  assert.equal(h.state(), "Discovery");
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
});
test("invalid discovery identity fails closed without an Open call", async () => {
  const h = await harness();
  const bad = discovery();
  bad.structuredContent.candidates[0].recordId = id.slice(0, 15);
  h.open(bad);
  assert.equal(h.state(), "Unavailable");
  assert.equal(h.calls.length, 0);
});
test("Case auto-number header and configured scalar fields use the existing editor", async () => {
  const h = await harness();
  const card = result();
  Object.assign(card.structuredContent, {
    objectApiName: "Case",
    recordId: "500000000000001AAA",
    recordName: "00001001",
    fields: [
      {
        fieldApi: "Subject",
        label: "Subject",
        value: "Original",
        dataType: "STRING",
        required: true,
        canClear: false,
        choices: [],
      },
    ],
    actions: [
      {
        name: "case_details",
        label: "Update case details",
        type: "record-edit",
      },
    ],
  });
  h.open(card);
  assert.equal(h.doc.querySelector("h1").textContent, "00001001");
  h.click("start");
  assert.deepEqual(h.calls[0], {
    name: "cardstack_record_edit_start",
    arguments: { recordId: "500000000000001AAA", actionName: "case_details" },
  });
});
test("selected Open denial retains candidates for another checked choice", async () => {
  const h = await harness();
  h.open(discovery());
  h.doc.querySelector("[data-candidate]").click();
  h.reply({
    isError: true,
    structuredContent: {
      contractVersion: "record-edit/v1",
      status: "Rejected",
      errors: [{ code: "RECORD_UNAVAILABLE", message: "Unavailable" }],
    },
  });
  await tick();
  assert.equal(h.state(), "Discovery");
  assert.match(
    h.doc.querySelector("[role=status]").textContent,
    /could not be opened/,
  );
  h.doc.querySelector("[data-candidate]").click();
  assert.equal(h.calls.length, 2);
});
test("refining discovery dispatches read-only search without preserving record authority", async () => {
  const h = await harness();
  h.open(discovery());
  const query = h.doc.querySelector("[data-search-query]");
  query.value = "New name";
  query.form.dispatchEvent(
    new h.doc.defaultView.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.deepEqual(h.calls[0], {
    name: "cardstack_record_search",
    arguments: { query: "New name" },
  });
  h.reply(discovery([]));
  await tick();
  assert.equal(h.state(), "Discovery");
  assert.equal(h.doc.querySelector("[data-candidate]"), null);
});
test("candidate text is rendered literally and duplicate IDs are rejected", async () => {
  const h = await harness();
  const d = discovery();
  d.structuredContent.candidates[0].recordName = "<img src=x onerror=alert(1)>";
  h.open(d);
  assert.equal(h.doc.querySelector("img"), null);
  assert.match(h.doc.querySelector("h3").textContent, /<img/);
  h.app.ontoolinput({ arguments: { query: "duplicate" } });
  h.open(
    discovery([
      d.structuredContent.candidates[0],
      d.structuredContent.candidates[0],
    ]),
  );
  assert.equal(h.state(), "Unavailable");
});
test("record card can request related definitions without starting an edit", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  assert.deepEqual(h.calls[0], {
    name: "cardstack_record_related_definitions",
    arguments: { parentId: id },
  });
});
const fingerprint = "d".repeat(64);
function relatedDefinitions() {
  return {
    structuredContent: {
      contractVersion: "record-related-definitions/v1",
      parent: {
        recordId: id,
        objectApiName: "Contact",
        recordName: "Synthetic Contact",
      },
      lists: [
        {
          listKey: "cases",
          relationship: "Cases",
          childObjectApiName: "Case",
          label: "Cases",
          definitionFingerprint: fingerprint,
          columns: [
            { fieldApi: "Subject", label: "Subject", dataType: "STRING" },
          ],
          pageSize: 10,
        },
      ],
    },
  };
}
function relatedPage(hasMore = false) {
  return {
    structuredContent: {
      contractVersion: "record-related-page/v1",
      parent: {
        recordId: id,
        objectApiName: "Contact",
        recordName: "Synthetic Contact",
      },
      listKey: "cases",
      relationship: "Cases",
      childObjectApiName: "Case",
      label: "Cases",
      definitionFingerprint: fingerprint,
      columns: [{ fieldApi: "Subject", label: "Subject", dataType: "STRING" }],
      rows: [
        {
          recordId: "500000000000001AAA",
          recordName: "00001001",
          cells: [{ fieldApi: "Subject", value: "Help" }],
        },
      ],
      hasMore,
    },
    _meta: {
      "cardstack/related": {
        parentId: id,
        listKey: "cases",
        definitionFingerprint: fingerprint,
        ...(hasMore ? { nextCursor: "private-position" } : {}),
      },
    },
  };
}
test("related list reads rows then opens child through membership-check tool", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  h.reply(relatedDefinitions());
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  assert.deepEqual(h.calls[1], {
    name: "cardstack_record_related_page",
    arguments: { parentId: id, listKey: "cases" },
  });
  h.reply(relatedPage());
  await tick();
  assert.match(h.doc.querySelector("[data-related-rows]").textContent, /Help/);
  h.doc.querySelector("[data-related-child]").click();
  assert.deepEqual(h.calls[2], {
    name: "cardstack_record_related_open_child",
    arguments: {
      parentId: id,
      listKey: "cases",
      childId: "500000000000001AAA",
    },
  });
});
test("related private cursor stays outside public presentation and binds the next page", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  h.reply(relatedDefinitions());
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  h.reply(relatedPage(true));
  await tick();
  assert.equal(h.doc.body.textContent.includes("private-position"), false);
  h.doc.querySelector("[data-related-next]").click();
  assert.deepEqual(h.calls[2].arguments, {
    parentId: id,
    listKey: "cases",
    cursor: "private-position",
  });
});
test("host record boundary discards delayed related page and parent breadcrumbs", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  h.reply(relatedDefinitions());
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  h.app.ontoolinput({ arguments: { recordId: "003000000000002AAA" } });
  h.open(result("Card", "003000000000002AAA"));
  h.reply(relatedPage());
  await tick();
  assert.equal(h.doc.querySelector("[data-related-rows]"), null);
  assert.equal(h.doc.querySelector("[data-parent-record]"), null);
});
test("related page metadata mismatch clears stale rows and requires retry", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  h.reply(relatedDefinitions());
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  h.reply(relatedPage());
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  const bad = relatedPage(true);
  bad._meta["cardstack/related"].parentId = "003000000000002AAA";
  h.reply(bad);
  await tick();
  assert.equal(h.doc.querySelector("[data-related-rows]"), null);
  assert.match(
    h.doc.querySelector("[data-related]").textContent,
    /unavailable/,
  );
});
test("checked related child keeps parent breadcrumb which returns via fresh Open", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  h.reply(relatedDefinitions());
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  h.reply(relatedPage());
  await tick();
  h.doc.querySelector("[data-related-child]").click();
  const child = result("Card", "500000000000001AAA");
  child.structuredContent.objectApiName = "Case";
  child.structuredContent.recordName = "00001001";
  h.reply(child);
  await tick();
  assert.equal(
    h.doc.querySelector("[data-parent-record]").dataset.parentRecord,
    id,
  );
  h.click("parent");
  assert.deepEqual(h.calls[3], {
    name: "cardstack_record_open",
    arguments: { recordId: id },
  });
  h.reply(result());
  await tick();
  assert.equal(h.doc.querySelector("[data-parent-record]"), null);
});
function flowResult(status = "Editing") {
  const base = result(status);
  base.structuredContent.contractVersion = "screen-flow/v1";
  base.structuredContent.screen = {
    label: status === "Review" ? "Review changes" : "First screen",
    inputs:
      status === "Editing"
        ? [
            {
              inputId: "NameInput",
              label: "Last name",
              type: "String",
              value: "Before",
              required: true,
              allowClear: false,
              scale: 0,
              choices: [],
              sectionId: null,
            },
          ]
        : [],
    sections: [],
    plainTextBlocks: ["<b>Literal instruction</b>"],
    canNext: status === "Editing",
    canBack: status === "Review",
    canCancel: ["Editing", "Review"].includes(status),
  };
  base._meta = {
    "cardstack/flowEdit": {
      interactionKey: "a".repeat(64),
      reviewGrant: status === "Review" ? "b".repeat(64) : null,
    },
  };
  return base;
}
async function flowEditing() {
  const h = await harness();
  const card = result();
  card.structuredContent.actions = [
    { name: "update_flow", label: "Update via flow", type: "screen-flow" },
  ];
  h.open(card);
  h.click("start");
  h.reply(flowResult());
  await tick();
  return h;
}
test("Flow action uses distinct native family and Next submits only projected input IDs", async () => {
  const h = await flowEditing();
  assert.equal(h.calls[0].name, "cardstack_record_flow_start");
  assert.equal(h.doc.querySelector("[data-action=review]").textContent, "Next");
  assert.equal(h.doc.querySelector("b"), null);
  const input = h.doc.querySelector("[data-field=NameInput]");
  input.value = "After";
  input.dispatchEvent(new h.doc.defaultView.Event("input", { bubbles: true }));
  h.click("review");
  assert.equal(h.calls[1].name, "cardstack_record_flow_transition");
  assert.equal(h.calls[1].arguments.operation, "next");
  assert.deepEqual(h.calls[1].arguments.answers, [
    { inputId: "NameInput", operation: "set", value: "After" },
  ]);
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
  h.reply(flowResult("Review"));
  await tick();
  assert.equal(h.state(), "Review");
  assert.equal(h.doc.querySelector("[data-action=confirm]").disabled, false);
});
test("interrupted Flow Confirm revokes grant and status recovery uses only Flow resume", async () => {
  const h = await flowEditing();
  h.click("review");
  h.reply(flowResult("Review"));
  await tick();
  h.click("confirm");
  assert.equal(h.calls[2].name, "cardstack_record_flow_transition");
  assert.equal(h.calls[2].arguments.operation, "confirm");
  h.fail();
  await tick();
  assert.equal(h.state(), "Unknown");
  h.click("resume");
  assert.equal(h.calls[3].name, "cardstack_record_flow_transition");
  assert.equal(h.calls[3].arguments.operation, "resume");
  assert.equal(h.calls[3].arguments.expectedRevision, 2);
  assert.equal(h.calls[3].arguments.reviewGrant, undefined);
  h.reply(flowResult("Completed"));
  await tick();
  assert.equal(h.state(), "Completed");
});
test("Flow Review cannot acquire authority from generic record private metadata", async () => {
  const h = await flowEditing();
  h.click("review");
  const bad = flowResult("Review");
  bad._meta = result("Review")._meta;
  h.reply(bad);
  await tick();
  assert.equal(h.state(), "Unknown");
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
});
test("Flow conditional visibility reprojects on field blur without a navigation or write", async () => {
  const h = await harness();
  const card = result();
  card.structuredContent.actions = [
    { name: "conditional", label: "Conditional flow", type: "screen-flow" },
  ];
  h.open(card);
  h.click("start");
  const first = flowResult();
  first.structuredContent.screen.needsAnswerRefresh = true;
  h.reply(first);
  await tick();
  const input = h.doc.querySelector("[data-field=NameInput]");
  input.value = "Reveal";
  input.dispatchEvent(new h.doc.defaultView.Event("input", { bubbles: true }));
  input.dispatchEvent(
    new h.doc.defaultView.Event("focusout", { bubbles: true }),
  );
  await tick();
  assert.equal(h.calls[1].arguments.operation, "answer");
  assert.deepEqual(h.calls[1].arguments.answers, [
    { inputId: "NameInput", operation: "set", value: "Reveal" },
  ]);
  const projected = flowResult();
  projected.structuredContent.revision = 2;
  projected.structuredContent.screen.inputs[0].value = "Reveal";
  projected.structuredContent.screen.needsAnswerRefresh = true;
  projected.structuredContent.screen.inputs.push({
    inputId: "RevealedInput",
    label: "Required detail",
    type: "String",
    value: null,
    required: true,
    allowClear: false,
    scale: 0,
    choices: [],
    sectionId: null,
  });
  h.reply(projected);
  await tick();
  assert.equal(h.state(), "Editing");
  assert.ok(h.doc.querySelector("[data-field=RevealedInput]"));
  assert.equal(h.doc.querySelector("[data-action=confirm]"), null);
  const unchanged = h.doc.querySelector("[data-field=NameInput]");
  unchanged.dispatchEvent(
    new h.doc.defaultView.Event("focusout", { bubbles: true }),
  );
  await tick();
  assert.equal(h.calls.length, 2);
});
test("Flow blur submits only that input while retaining other visible local drafts", async () => {
  const h = await harness();
  const card = result();
  card.structuredContent.actions = [
    { name: "conditional", label: "Conditional", type: "screen-flow" },
  ];
  h.open(card);
  h.click("start");
  const first = flowResult();
  first.structuredContent.screen.needsAnswerRefresh = true;
  const extra = {
    inputId: "DetailInput",
    label: "Detail",
    type: "String",
    value: "Original detail",
    required: false,
    allowClear: true,
    scale: 0,
    choices: [],
    sectionId: null,
  };
  first.structuredContent.screen.inputs.push(extra);
  h.reply(first);
  await tick();
  const detail = h.doc.querySelector("[data-field=DetailInput]");
  detail.value = "Unsaved local detail";
  detail.dispatchEvent(new h.doc.defaultView.Event("input", { bubbles: true }));
  const driver = h.doc.querySelector("[data-field=NameInput]");
  driver.value = "Reveal";
  driver.dispatchEvent(new h.doc.defaultView.Event("input", { bubbles: true }));
  driver.dispatchEvent(
    new h.doc.defaultView.Event("focusout", { bubbles: true }),
  );
  await tick();
  assert.deepEqual(h.calls[1].arguments.answers, [
    { inputId: "NameInput", operation: "set", value: "Reveal" },
  ]);
  const projected = flowResult();
  projected.structuredContent.revision = 2;
  projected.structuredContent.screen.needsAnswerRefresh = true;
  projected.structuredContent.screen.inputs[0].value = "Reveal";
  projected.structuredContent.screen.inputs.push(extra);
  h.reply(projected);
  await tick();
  assert.equal(
    h.doc.querySelector("[data-field=DetailInput]").value,
    "Unsaved local detail",
  );
});
const opportunityId = "006000000000001AAA";
function opportunityResult(status = "Card") {
  const fields = [
    {
      fieldApi: "StageName",
      label: "Stage",
      value: "Qualification",
      dataType: "PICKLIST",
      required: true,
      canClear: false,
      choices: [
        { value: "Qualification", label: "Qualification" },
        { value: "Negotiation", label: "Negotiation" },
      ],
    },
    {
      fieldApi: "CloseDate",
      label: "Close date",
      value: "2026-11-30",
      dataType: "DATE",
      required: true,
      canClear: false,
      choices: [],
    },
    {
      fieldApi: "Amount",
      label: "Amount",
      value: "10000",
      dataType: "CURRENCY",
      currencyCode: "USD",
      required: false,
      canClear: true,
      choices: [],
    },
  ];
  return {
    structuredContent: {
      contractVersion:
        status === "Card" ? "opportunity-card/v1" : "opportunity-edit/v1",
      status,
      recordId: opportunityId,
      recordName: "Related deal",
      fields,
      actions: [
        {
          name: "edit_opportunity",
          label: "Update forecast",
          type: "record-edit",
        },
      ],
      revision: 1,
      expiresAt: "2026-10-12T12:15:00Z",
      errors: [],
      diff: [],
    },
    _meta: {
      "cardstack/opportunityEdit": {
        interactionKey: "f".repeat(64),
        reviewGrant: null,
      },
    },
  };
}
async function relatedOpportunity() {
  const h = await harness();
  h.open(result());
  h.click("related");
  const definitions = relatedDefinitions();
  Object.assign(definitions.structuredContent.lists[0], {
    relationship: "Opportunities",
    childObjectApiName: "Opportunity",
    label: "Opportunities",
  });
  h.reply(definitions);
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  const page = relatedPage();
  Object.assign(page.structuredContent, {
    relationship: "Opportunities",
    childObjectApiName: "Opportunity",
    label: "Opportunities",
  });
  Object.assign(page.structuredContent.rows[0], {
    recordId: opportunityId,
    recordName: "Related deal",
  });
  h.reply(page);
  await tick();
  h.doc.querySelector("[data-related-child]").click();
  h.reply(opportunityResult());
  await tick();
  return h;
}
test("checked related Opportunity adopts its existing family tools and preserves parent navigation", async () => {
  const h = await relatedOpportunity();
  assert.equal(h.state(), "Card");
  assert.equal(h.doc.querySelector(".object-label").textContent, "Opportunity");
  h.click("start");
  assert.equal(h.calls[3].name, "cardstack_opportunity_edit_start");
  h.reply(opportunityResult("Editing"));
  await tick();
  assert.equal(h.doc.querySelector("[data-field=StageName]").tagName, "SELECT");
  h.click("cancel");
  assert.equal(h.calls[4].name, "cardstack_opportunity_edit_transition");
  assert.equal(h.calls[4].arguments.interactionKey, "f".repeat(64));
});
test("checked Opportunity breadcrumb returns through original generic parent adapter", async () => {
  const h = await relatedOpportunity();
  h.click("parent");
  assert.deepEqual(h.calls[3], {
    name: "cardstack_record_open",
    arguments: { recordId: id },
  });
  h.reply(result());
  await tick();
  assert.equal(h.state(), "Card");
  h.click("start");
  assert.equal(h.calls[4].name, "cardstack_record_edit_start");
});
test("delayed checked Opportunity response cannot adopt a family after a host record switch", async () => {
  const h = await harness();
  h.open(result());
  h.click("related");
  const definitions = relatedDefinitions();
  Object.assign(definitions.structuredContent.lists[0], {
    relationship: "Opportunities",
    childObjectApiName: "Opportunity",
    label: "Opportunities",
  });
  h.reply(definitions);
  await tick();
  h.doc.querySelector("[data-related-list]").click();
  const page = relatedPage();
  Object.assign(page.structuredContent, {
    relationship: "Opportunities",
    childObjectApiName: "Opportunity",
    label: "Opportunities",
  });
  Object.assign(page.structuredContent.rows[0], {
    recordId: opportunityId,
    recordName: "Related deal",
  });
  h.reply(page);
  await tick();
  h.doc.querySelector("[data-related-child]").click();
  h.app.ontoolinput({ arguments: { recordId: "003000000000002AAA" } });
  h.open(result("Card", "003000000000002AAA"));
  h.reply(opportunityResult());
  await tick();
  assert.equal(h.doc.querySelector(".object-label").textContent, "Contact");
  assert.equal(h.doc.querySelector("[data-parent-record]"), null);
  h.click("start");
  assert.equal(h.calls[3].name, "cardstack_record_edit_start");
});
test('normal controller exposes no delivery QA controls even when host context asks',async()=>{
 const h=await harness();h.open(result());h.app.onhostcontextchanged({deliveryQaEnabled:true});assert.equal(h.doc.querySelector('[data-delivery-qa]'),null);
});
test('QA discarded real Confirm reply enters Unknown and resumes without a second Confirm',async()=>{
 const h=await harness({deliveryQaEnabled:true});h.open(result());h.click('start');h.reply(result('Editing'));await tick();h.click('review');h.reply(result('Review'));await tick();
 h.click('qa-discard');assert.match(h.doc.querySelector('[data-delivery-qa]').textContent,/Discard armed/);h.click('confirm');
 h.app.ontoolresult(result('Completed'));assert.equal(h.state(),'Saving');h.reply(result('Completed'));await tick();assert.equal(h.state(),'Unknown');h.app.ontoolresult(result('Completed'));assert.equal(h.state(),'Unknown');
 h.click('resume');assert.equal(h.calls[3].arguments.operation,'resume');assert.equal(h.calls[3].arguments.reviewGrant,undefined);assert.equal(h.calls.filter(call=>call.arguments.operation==='confirm').length,1);h.reply(result('Completed'));await tick();assert.equal(h.state(),'Completed');assert.equal(h.doc.querySelector('[data-delivery-qa]').textContent.includes('a'.repeat(64)),false);
});
async function heldRelatedQa(reply=relatedPage()) {
 const h=await harness({deliveryQaEnabled:true});h.open(result());h.click('related');h.reply(relatedDefinitions());await tick();h.click('qa-hold');h.doc.querySelector('[data-related-list]').click();h.reply(reply);await tick();return h;
}
function qaOpen(h,recordId=id) {
 const field=h.doc.querySelector('[data-qa-record-id]');field.value=recordId;field.form.dispatchEvent(new h.doc.defaultView.Event('submit',{bubbles:true,cancelable:true}));
}
test('QA held native page permits real checked Open and late success cannot replace current Case',async()=>{
 const h=await heldRelatedQa();assert.equal(h.state(),'Card');assert.match(h.doc.querySelector('[data-delivery-qa]').textContent,/Reply held/);h.app.ontoolresult(relatedPage());assert.equal(h.state(),'Card');assert.equal(h.doc.querySelector('[data-related-rows]'),null);
 qaOpen(h,'500000000000001AAA');assert.deepEqual(h.calls[2],{name:'cardstack_record_open',arguments:{recordId:'500000000000001AAA'}});const current=result('Card','500000000000001AAA');current.structuredContent.objectApiName='Case';current.structuredContent.recordName='00001001';h.reply(current);await tick();h.click('qa-release');await tick();assert.equal(h.doc.querySelector('h1').textContent,'00001001');assert.equal(h.doc.querySelector('[data-related-rows]'),null);
});
test('QA held native rejection is ignored after a fresh same-record context',async()=>{
 const h=await heldRelatedQa({isError:true,structuredContent:{contractVersion:'record-related-error/v1',code:'RELATED_UNAVAILABLE'}});qaOpen(h);h.reply(result());await tick();h.click('qa-release');await tick();assert.equal(h.state(),'Card');assert.equal(h.doc.querySelector('[data-related]'),null);h.click('start');assert.equal(h.calls[3].name,'cardstack_record_edit_start');
});
