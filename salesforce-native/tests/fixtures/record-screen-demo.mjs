import { applyWorkspaceContext } from "../../ui/opportunity-edit/workspace.mjs";
import { mountRecordEdit } from "../../ui/opportunity-edit/controller.mjs";
// Local test fixture only. Does not enter a package or call Salesforce, SDK, HTTP or storage.
const root = document.querySelector("#root");
let scenario = "Contact",
  manyActions = false;
const ids = ["003000000000001AAA", "003000000000002AAA"];
const records = new Map(
  ids.map((id, i) => [
    id,
    {
      recordId: id,
      recordName: `Synthetic Contact ${i + 1}`,
      values: {
        LastName: "Synthetic Contact",
        Description: "Synthetic description",
        HasOptedOutOfEmail: "false",
      },
    },
  ]),
);
const leadIds = ["00Q000000000001EAA", "00Q000000000002EAA"];
const leadFields = [
  ["LastName", "Last name", "STRING", "Synthetic Lead"],
  ["Company", "Company", "STRING", "Synthetic company"],
  ["Title", "Title", "STRING", "Operations manager"],
  ["Email", "Email", "EMAIL", "synthetic@example.test"],
  ["Phone", "Phone", "PHONE", "+1 555 0100"],
  ["Website", "Website", "URL", "https://example.test"],
  ["Status", "Status", "PICKLIST", "New"],
  ["Rating", "Rating", "PICKLIST", "Warm"],
  ["AnnualRevenue", "Annual revenue", "CURRENCY", "12345.00"],
  ["Description", "Description", "TEXTAREA", "Synthetic notes"],
];
const leadLayout = {
  version: 1,
  sections: [
    {
      id: "identity",
      label: "Identity",
      columns: 2,
      fields: ["LastName", "Company", "Title"],
    },
    {
      id: "contact",
      label: "Contact",
      columns: 2,
      fields: ["Email", "Phone", "Website"],
    },
    {
      id: "qualification",
      label: "Qualification",
      columns: 2,
      fields: ["Status", "Rating", "AnnualRevenue"],
    },
    { id: "notes", label: "Notes", columns: 1, fields: ["Description"] },
  ],
};
for (const [i, id] of leadIds.entries())
  records.set(id, {
    recordId: id,
    recordName: `Synthetic Lead ${i + 1}`,
    values: Object.fromEntries(
      leadFields.map(([api, , , value]) => [api, value]),
    ),
  });
let current = ids[0],
  session = null,
  drop = false,
  delay = false,
  serverValidation = false,
  effects = 0;
const controls = document.createElement("div");
controls.className = "preview-tools";
const banner = document.createElement("p");
banner.className = "synthetic";
banner.textContent =
  "Synthetic renderer · local effects only · no Salesforce writes or host proof";
controls.append(banner);
const evidence = document.createElement("p");
evidence.setAttribute("data-demo-evidence", "");
controls.append(evidence);
function report() {
  evidence.textContent = `Synthetic fixture effects: ${effects}. Actual Salesforce writes: none. Host proof: none.`;
}
const nav = document.createElement("nav");
const toolDetails = document.createElement("details");
const toolSummary = document.createElement("summary");
toolSummary.textContent = "Synthetic test controls";
toolDetails.append(toolSummary, nav);
controls.append(toolDetails);
for (const [label, handler] of [
  [
    "Fifty-action synthetic Card",
    () => {
      toolDetails.open = false;
      scenario = "Lead";
      current = leadIds[1];
      session = null;
      manyActions = true;
      app.onhostcontextchanged({
        containerDimensions: { height: 604, width: 320 },
        safeAreaInsets: { top: 12, right: 12, bottom: 12, left: 12 },
      });
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    "Long-name small workspace",
    () => {
      toolDetails.open = false;
      scenario = "Lead";
      current = leadIds[0];
      session = null;
      manyActions = false;
      records.get(current).recordName =
        "Synthetic long-name Lead with permitted public identifying context "
          .repeat(4)
          .slice(0, 256);
      app.onhostcontextchanged({
        containerDimensions: { height: 288, width: 320 },
        safeAreaInsets: { top: 12, right: 12, bottom: 12, left: 12 },
      });
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    "Open ten-field synthetic Lead",
    () => {
      toolDetails.open = false;
      scenario = "Lead";
      current = leadIds[0];
      session = null;
      manyActions = false;
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    "Rerender Editing in 1 second",
    () => {
      toolDetails.open = false;
      setTimeout(() => app.onhostcontextchanged({}), 1000);
    },
  ],
  [
    "Reset synthetic card",
    () => {
      session = null;
      scenario = "Contact";
      manyActions = false;
      current = ids[0];
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    "Drop next save response",
    () => {
      drop = true;
      report();
      evidence.textContent +=
        " Next synthetic save commits locally and loses its response.";
    },
  ],
  [
    "Delay next review",
    () => {
      delay = true;
      evidence.textContent +=
        " Next review delayed 2 seconds; switch record now.";
    },
  ],
  [
    "Switch synthetic record",
    () => {
      const choices = scenario === "Lead" ? leadIds : ids;
      current = current === choices[0] ? choices[1] : choices[0];
      session = null;
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    "Reject next review value",
    () => {
      serverValidation = true;
      evidence.textContent += " Next synthetic review returns a field error.";
    },
  ],
]) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", handler);
  nav.append(b);
}
document.body.prepend(controls);
const descriptors = (record) =>
  scenario === "Lead"
    ? leadFields.map(([fieldApi, label, dataType]) => ({
        fieldApi,
        label,
        dataType,
        value: record.values[fieldApi],
        required: ["LastName", "Company", "Status"].includes(fieldApi),
        canClear: !["LastName", "Company", "Status"].includes(fieldApi),
        choices:
          fieldApi === "Status"
            ? [
                { label: "New", value: "New" },
                { label: "Working", value: "Working" },
              ]
            : fieldApi === "Rating"
              ? [
                  { label: "Warm", value: "Warm" },
                  { label: "Hot", value: "Hot" },
                ]
              : [],
        ...(["EMAIL", "PHONE", "URL", "PICKLIST"].includes(dataType)
          ? { length: 255 }
          : {}),
        ...(dataType === "CURRENCY"
          ? { currencyCode: "USD", precision: 18, scale: 2 }
          : {}),
      }))
    : [
        {
          fieldApi: "LastName",
          label: "Last name",
          dataType: "STRING",
          value: record.values.LastName,
          required: true,
          canClear: false,
          choices: [],
        },
        {
          fieldApi: "Description",
          label: "Description",
          dataType: "TEXTAREA",
          value: record.values.Description,
          required: false,
          canClear: true,
          choices: [],
        },
        {
          fieldApi: "HasOptedOutOfEmail",
          label: "Email opt out",
          dataType: "BOOLEAN",
          value: record.values.HasOptedOutOfEmail,
          required: false,
          canClear: false,
          choices: [],
        },
      ];
function card() {
  const r = records.get(current);
  return {
    content: [],
    structuredContent: {
      contractVersion: "record-card/v1",
      objectApiName: scenario,
      ...(scenario === "Lead" ? { layout: leadLayout } : {}),
      recordId: r.recordId,
      recordName: r.recordName,
      fields: descriptors(r),
      actions: manyActions
        ? Array.from({ length: 50 }, (_, index) => ({
            name: `syntheticTask${index + 1}`,
            label: `Synthetic task ${index + 1}`,
            type: "record-edit",
          }))
        : [
            {
              name: scenario === "Lead" ? "editLead" : "editContact",
              label: `Edit synthetic ${scenario}`,
              type: "record-edit",
            },
          ],
    },
  };
}
function stamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
function result(s) {
  const r = records.get(s.recordId);
  return {
    content: [],
    structuredContent: {
      contractVersion: "record-edit/v1",
      objectApiName: scenario,
      ...(scenario === "Lead" ? { layout: leadLayout } : {}),
      status: s.status,
      recordId: r.recordId,
      recordName: r.recordName,
      revision: s.revision,
      reviewRevision: s.reviewRevision,
      expiresAt: s.expiresAt,
      fields: descriptors({ ...r, values: s.answers }),
      diff: s.status === "Review" ? s.diff : [],
      errors: s.errors || [],
      receipt: s.receipt || null,
    },
    _meta: {
      "cardstack/recordEdit": {
        interactionKey: s.key,
        reviewGrant: s.status === "Review" ? s.grant : null,
      },
    },
  };
}
function receipt(s, status) {
  s.status = "Completed";
  s.revision++;
  s.receipt = {
    reference: "receipt-" + crypto.randomUUID().replaceAll("-", ""),
    actorDisplayName: "Synthetic actor",
    completedAt: stamp(),
    status,
    diff: status === "saved" ? structuredClone(s.diff) : [],
  };
}
const app = {
  connect: () => Promise.resolve(),
  callServerTool: async ({ name, arguments: args }) => {
    if (name === "cardstack_record_refresh") return card();
    if (name === "cardstack_record_edit_start") {
      const r = records.get(current);
      session = {
        key:
          crypto.randomUUID().replaceAll("-", "") +
          crypto.randomUUID().replaceAll("-", ""),
        recordId: current,
        revision: 1,
        reviewRevision: 0,
        status: "Editing",
        expiresAt: new Date(Date.now() + 900000)
          .toISOString()
          .replace(/\.\d{3}Z$/, "Z"),
        answers: { ...r.values },
        diff: [],
      };
      return result(session);
    }
    const s = session;
    if (!s || args.interactionKey !== s.key)
      throw Error("Synthetic context missing");
    s.errors = [];
    if (args.operation === "review") {
      if (serverValidation) {
        serverValidation = false;
        s.errors = [
          {
            fieldApi: "LastName",
            code: "INVALID_VALUE",
            message:
              "Synthetic server rule rejected this LastName. Change it and review again.",
          },
        ];
        return result(s);
      }
      s.diff = [];
      const r = records.get(s.recordId);
      for (const c of args.changes) {
        const value = c.operation === "clear" ? null : c.value;
        s.answers[c.fieldApi] = value;
        if (value !== r.values[c.fieldApi])
          s.diff.push({
            fieldApi: c.fieldApi,
            label: descriptors(r).find((f) => f.fieldApi === c.fieldApi).label,
            beforeValue: r.values[c.fieldApi],
            afterValue: value,
          });
      }
      if (!s.diff.length) receipt(s, "noChanges");
      else {
        s.status = "Review";
        s.revision++;
        s.reviewRevision++;
        s.grant =
          crypto.randomUUID().replaceAll("-", "") +
          crypto.randomUUID().replaceAll("-", "");
      }
      const response = result(s);
      if (delay) {
        delay = false;
        await new Promise((r) => setTimeout(r, 2000));
      }
      return response;
    }
    if (args.operation === "confirm") {
      records.get(s.recordId).values = { ...s.answers };
      effects++;
      receipt(s, "saved");
      report();
      if (drop) {
        drop = false;
        throw Error("Synthetic response dropped after fixture commit");
      }
      return result(s);
    }
    if (args.operation === "back") {
      s.status = "Editing";
      s.revision++;
      s.diff = [];
    }
    if (args.operation === "cancel") {
      s.status = "Cancelled";
      s.revision++;
      s.diff = [];
    }
    if (args.operation === "resume" && s.status === "Review") {
      s.revision++;
      s.reviewRevision++;
      s.grant =
        crypto.randomUUID().replaceAll("-", "") +
        crypto.randomUUID().replaceAll("-", "");
    }
    return result(s);
  },
};
const controller = mountRecordEdit(app, document, {
  hostStyles: (context) => applyWorkspaceContext(document, context),
});
app.ontoolresult(card());
report();
addEventListener("pagehide", () => controller.disconnect(), { once: true });
