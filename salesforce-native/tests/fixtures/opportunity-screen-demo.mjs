import { mountOpportunity } from '../../ui/opportunity-edit/controller.mjs';
// Local test fixture only. Does not enter a package or call Salesforce, SDK, HTTP or storage.
const root = document.querySelector('#root');
const ids = ['006000000000001AAA', '006000000000002AAA'];
const records = new Map(
  ids.map((id, i) => [
    id,
    {
      recordId: id,
      recordName: `Synthetic deal ${i + 1}`,
      values: {
        StageName: 'Discovery',
        CloseDate: '2026-11-30',
        Amount: '10000',
      },
    },
  ]),
);
let current = ids[0],
  session = null,
  drop = false,
  delay = false,
  serverValidation = false,
  effects = 0;
const controls = document.createElement('div');
controls.className = 'preview-tools';
const banner = document.createElement('p');
banner.className = 'synthetic';
banner.textContent =
  'Synthetic transport demo · local renderer evidence only · no Salesforce, host client or CRM writes';
controls.append(banner);
const evidence = document.createElement('p');
evidence.setAttribute('data-demo-evidence', '');
controls.append(evidence);
function report() {
  evidence.textContent = `Synthetic fixture effects: ${effects}. Actual Salesforce writes: none. Actual ChatGPT / Claude evidence: none.`;
}
const nav = document.createElement('nav');
controls.append(nav);
for (const [label, handler] of [
  [
    'Reset synthetic card',
    () => {
      session = null;
      current = ids[0];
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    'Drop next save response',
    () => {
      drop = true;
      report();
      evidence.textContent +=
        ' Next synthetic save commits locally and loses its response.';
    },
  ],
  [
    'Delay next review',
    () => {
      delay = true;
      evidence.textContent +=
        ' Next review delayed 2 seconds; switch record now.';
    },
  ],
  [
    'Switch synthetic record',
    () => {
      current = current === ids[0] ? ids[1] : ids[0];
      session = null;
      app.ontoolinput({ arguments: { recordId: current } });
      app.ontoolresult(card());
    },
  ],
  [
    'Reject next review value',
    () => {
      serverValidation = true;
      evidence.textContent += ' Next synthetic review returns a field error.';
    },
  ],
]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', handler);
  nav.append(b);
}
document.body.prepend(controls);
const descriptors = (record) => [
  {
    fieldApi: 'StageName',
    label: 'Stage',
    value: record.values.StageName,
    dataType: 'PICKLIST',
    required: true,
    canClear: false,
    choices: [
      { label: 'Discovery', value: 'Discovery' },
      { label: 'Closed won', value: 'Closed Won' },
    ],
  },
  {
    fieldApi: 'CloseDate',
    label: 'Close date',
    value: record.values.CloseDate,
    dataType: 'DATE',
    required: true,
    canClear: false,
    choices: [],
  },
  {
    fieldApi: 'Amount',
    label: 'Amount',
    value: record.values.Amount,
    dataType: 'CURRENCY',
    currencyCode: 'USD',
    required: false,
    canClear: true,
    choices: [],
  },
];
function card() {
  const r = records.get(current);
  return {
    content: [],
    structuredContent: {
      contractVersion: 'opportunity-card/v1',
      recordId: r.recordId,
      recordName: r.recordName,
      fields: descriptors(r),
      actions: [
        {
          name: 'editDeal',
          label: 'Edit synthetic opportunity',
          type: 'record-edit',
        },
      ],
    },
  };
}
function stamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function result(s) {
  const r = records.get(s.recordId);
  return {
    content: [],
    structuredContent: {
      contractVersion: 'opportunity-edit/v1',
      status: s.status,
      recordId: r.recordId,
      recordName: r.recordName,
      revision: s.revision,
      reviewRevision: s.reviewRevision,
      expiresAt: s.expiresAt,
      fields:
        s.status === 'Editing' ? descriptors({ ...r, values: s.answers }) : [],
      diff: s.status === 'Review' ? s.diff : [],
      errors: s.errors || [],
      receipt: s.receipt || null,
    },
    _meta: {
      'cardstack/opportunityEdit': {
        interactionKey: s.key,
        reviewGrant: s.status === 'Review' ? s.grant : null,
      },
    },
  };
}
function receipt(s, status) {
  s.status = 'Completed';
  s.revision++;
  s.receipt = {
    reference: 'receipt-' + crypto.randomUUID().replaceAll('-', ''),
    actorDisplayName: 'Synthetic actor',
    completedAt: stamp(),
    status,
    diff: status === 'saved' ? structuredClone(s.diff) : [],
  };
}
const app = {
  connect: () => Promise.resolve(),
  callServerTool: async ({ name, arguments: args }) => {
    if (name === 'cardstack_opportunity_refresh') return card();
    if (name === 'cardstack_opportunity_edit_start') {
      const r = records.get(current);
      session = {
        key:
          crypto.randomUUID().replaceAll('-', '') +
          crypto.randomUUID().replaceAll('-', ''),
        recordId: current,
        revision: 1,
        reviewRevision: 0,
        status: 'Editing',
        expiresAt: new Date(Date.now() + 900000)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z'),
        answers: { ...r.values },
        diff: [],
      };
      return result(session);
    }
    const s = session;
    if (!s || args.interactionKey !== s.key)
      throw Error('Synthetic context missing');
    s.errors = [];
    if (args.operation === 'review') {
      if (serverValidation) {
        serverValidation = false;
        s.errors = [
          {
            fieldApi: 'Amount',
            code: 'INVALID_VALUE',
            message:
              'Synthetic server rule rejected this Amount. Change it and review again.',
          },
        ];
        return result(s);
      }
      s.diff = [];
      const r = records.get(s.recordId);
      for (const c of args.changes) {
        const value = c.operation === 'clear' ? null : c.value;
        s.answers[c.fieldApi] = value;
        if (value !== r.values[c.fieldApi])
          s.diff.push({
            fieldApi: c.fieldApi,
            label: descriptors(r).find((f) => f.fieldApi === c.fieldApi).label,
            beforeValue: r.values[c.fieldApi],
            afterValue: value,
          });
      }
      if (!s.diff.length) receipt(s, 'noChanges');
      else {
        s.status = 'Review';
        s.revision++;
        s.reviewRevision++;
        s.grant =
          crypto.randomUUID().replaceAll('-', '') +
          crypto.randomUUID().replaceAll('-', '');
      }
      const response = result(s);
      if (delay) {
        delay = false;
        await new Promise((r) => setTimeout(r, 2000));
      }
      return response;
    }
    if (args.operation === 'confirm') {
      records.get(s.recordId).values = { ...s.answers };
      effects++;
      receipt(s, 'saved');
      report();
      if (drop) {
        drop = false;
        throw Error('Synthetic response dropped after fixture commit');
      }
      return result(s);
    }
    if (args.operation === 'back') {
      s.status = 'Editing';
      s.revision++;
      s.diff = [];
    }
    if (args.operation === 'cancel') {
      s.status = 'Cancelled';
      s.revision++;
      s.diff = [];
    }
    if (args.operation === 'resume' && s.status === 'Review') {
      s.revision++;
      s.reviewRevision++;
      s.grant =
        crypto.randomUUID().replaceAll('-', '') +
        crypto.randomUUID().replaceAll('-', '');
    }
    return result(s);
  },
};
const controller = mountOpportunity(app, document);
app.ontoolresult(card());
report();
addEventListener('pagehide', () => controller.disconnect(), { once: true });
