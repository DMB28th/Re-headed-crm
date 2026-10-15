import recordAuthoring from '../../force-app/main/default/lwc/cardstackRecordAuthoring/cardstackRecordAuthoring.js';
import { publicView as recordView } from "./record-contract.mjs";
import { checkedFields, validateChanges } from "./fields.mjs";
import { resolveLayout } from "./layout.mjs";
import { renderScreen } from "./view.mjs";
// Bridge-free Studio presentation. No private keys and no execution callbacks.
const root = document.querySelector("#root");
const opportunity = [
  {
    fieldApi: "StageName",
    label: "Stage",
    dataType: "PICKLIST",
    value: "Discovery",
    required: true,
    canClear: false,
    choices: [
      { label: "Discovery", value: "Discovery" },
      { label: "Closed won", value: "Closed Won" },
    ],
  },
  {
    fieldApi: "CloseDate",
    label: "Close date",
    dataType: "DATE",
    value: "2026-11-30",
    required: true,
    canClear: false,
    choices: [],
  },
  {
    fieldApi: "Amount",
    label: "Amount",
    dataType: "CURRENCY",
    value: "10000",
    currencyCode: "USD",
    required: false,
    canClear: true,
    choices: [],
  },
];
const contact = [
  {
    fieldApi: "LastName",
    label: "Last name",
    dataType: "STRING",
    value: "Synthetic Contact",
    required: true,
    canClear: false,
    choices: [],
  },
  {
    fieldApi: "Description",
    label: "Description",
    dataType: "TEXTAREA",
    value: "Synthetic description",
    required: false,
    canClear: true,
    choices: [],
  },
  {
    fieldApi: "HasOptedOutOfEmail",
    label: "Email opt out",
    dataType: "BOOLEAN",
    value: "false",
    required: false,
    canClear: false,
    choices: [],
  },
];
const generic = [
  {
    fieldApi: "Subject",
    label: "Subject",
    dataType: "STRING",
    value: "Synthetic example",
    required: true,
  },
  {
    fieldApi: "Notes",
    label: "Notes",
    dataType: "TEXTAREA",
    value: "First line\nSecond line",
  },
  {
    fieldApi: "Accepted",
    label: "Accepted",
    dataType: "BOOLEAN",
    value: "false",
  },
  {
    fieldApi: "Units",
    label: "Units",
    dataType: "INTEGER",
    value: "9007199254740993",
  },
  { fieldApi: "Ratio", label: "Ratio", dataType: "DECIMAL", value: "0.125" },
  { fieldApi: "Measure", label: "Measure", dataType: "DOUBLE", value: "42.5" },
  {
    fieldApi: "Budget",
    label: "Budget",
    dataType: "CURRENCY",
    value: "0",
    currencyCode: "EUR",
    canClear: true,
  },
  {
    fieldApi: "MeetingDate",
    label: "Meeting date",
    dataType: "DATE",
    value: "2028-02-29",
  },
  {
    fieldApi: "Category",
    label: "Category",
    dataType: "PICKLIST",
    value: "active",
    choices: [
      { label: "Active", value: "active" },
      { label: "Paused", value: "paused" },
    ],
  },
  {
    fieldApi: "Future",
    label: "Future type",
    dataType: "UNSUPPORTED",
    value: "Read-only example",
  },
].map((f) => ({ required: false, canClear: false, choices: [], ...f }));
let fields = checkedFields(opportunity),
  layout = null,
  drafts = {};
let model, workspaceEpoch = 0;
const label =
  "Synthetic Studio preview · shared renderer only · Save disabled · no Salesforce or host bridge";
function render() {
  renderScreen(
    root,
    {
      ...model,
      workspaceKey: workspaceEpoch,
      synthetic: label,
      layout,
      drafts,
      ready: true,
      editable: true,
      saveDisabled: true,
    },
    callbacks,
  );
}
function reset() {
  workspaceEpoch++;
  drafts = {};
  model = {
    status: "Editing",
    recordName: "Synthetic presentation",
    fields,
    errors: [],
  };
  render();
}
const callbacks = {
  review(local) {
    drafts = local;
    const result = validateChanges(fields, drafts);
    if (result.errors.length) {
      model = { ...model, errors: result.errors };
      renderScreen(
        root,
        {
          ...model,
          workspaceKey: workspaceEpoch,
          synthetic: label,
          drafts,
          layout,
          editable: true,
          saveDisabled: true,
          focusError: true,
        },
        callbacks,
      );
      return;
    }
    const diff = result.changes.map((c) => {
      const f = fields.find((f) => f.fieldApi === c.fieldApi);
      return {
        fieldApi: f.fieldApi,
        label: f.label,
        beforeValue: f.value,
        afterValue: c.operation === "clear" ? null : c.value,
      };
    });
    model = {
      fields,
      status: "Review",
      recordName: "Synthetic presentation",
      diff,
      errors: [],
    };
    render();
  },
  back() {
    model = {
      status: "Editing",
      recordName: "Synthetic presentation",
      fields,
      errors: [],
    };
    render();
  },
  cancel: reset,
};
const tools = document.createElement("nav");
tools.className = "preview-tools";
for (const [text, list] of [
  ["Opportunity fields", opportunity],
  ["Contact fields", contact],
  ["All supported controls", generic],
]) {
  const b = document.createElement("button");
  b.textContent = text;
  b.type = "button";
  b.addEventListener("click", () => {
    fields = checkedFields(list);
    layout = null;
    reset();
  });
  tools.append(b);
}
document.body.prepend(tools);
// A sandboxed Studio parent may provide only checked public descriptors/layout.
// event.source must be this frame's immediate parent; no arbitrary origins or APIs are executed.
addEventListener("message", (event) => {
  if (
    window.parent === window ||
    event.source !== window.parent ||
    event.data?.type !== "cardstack-preview/v1"
  )
    return;
  try {
    const message = event.data;
    if (Object.keys(message).some(key => !['type','scenario','objectApiName','nativeKeyPrefix','recordId','mode','fields','layout'].includes(key)) || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(message.objectApiName || '') || message.scenario !== message.objectApiName || message.recordId !== recordAuthoring.syntheticId(message.nativeKeyPrefix)) throw Error('Invalid identity');
    let next;
    if (message.mode === 'opportunity-stage') {
      if (message.objectApiName !== 'Opportunity' || message.nativeKeyPrefix !== '006' || !Array.isArray(message.fields) || message.fields.length !== opportunity.length || message.fields.some((field,index) => Object.keys(field).some(key => !Object.keys(opportunity[index]).includes(key)) || Object.keys(opportunity[index]).some(key => JSON.stringify(field[key]) !== JSON.stringify(opportunity[index][key])))) throw Error('Invalid Stage presentation');
      next = checkedFields(message.fields);
    } else {
      if (message.mode !== 'record-edit') throw Error('Invalid mode');
      const checked = recordAuthoring.checkedPreviewFields(message.fields);
      next = recordView({contractVersion:'record-card/v1',objectApiName:message.objectApiName,recordId:message.recordId,recordName:'Synthetic presentation',fields:checked,actions:[]}).fields;
    }
    const nextLayout = event.data.layout ?? null;
    resolveLayout(next, nextLayout);
    fields = next;
    layout = nextLayout;
    reset();
  } catch {
    root.replaceChildren();
    const p = document.createElement("p");
    p.textContent = "Synthetic preview unavailable: invalid fields or layout.";
    root.append(p);
  }
});
reset();
