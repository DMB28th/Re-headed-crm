'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const deps = process.env.CARDSTACK_UI_DEPENDENCIES;
const localRequire = deps ? createRequire(path.resolve(deps, '../package.json')) : require;
const { JSDOM } = localRequire('jsdom');
const tick = () => new Promise((r) => setImmediate(r));
const id = '006000000000001AAA',
  otherId = '006000000000002AAA';
const start = Date.parse('2026-10-12T12:00:00Z');
const fields = () => [
  {
    fieldApi: 'StageName',
    label: 'Stage',
    value: 'Inactive',
    dataType: 'PICKLIST',
    required: true,
    canClear: false,
    choices: [
      { label: 'Discovery', value: 'Discovery' },
      { label: 'Won', value: 'Closed Won' },
    ],
  },
  {
    fieldApi: 'CloseDate',
    label: 'Close date',
    value: '2026-11-30',
    dataType: 'DATE',
    required: true,
    canClear: false,
    choices: [],
  },
  {
    fieldApi: 'Amount',
    label: 'Amount',
    value: '10000',
    dataType: 'CURRENCY',
    currencyCode: 'USD',
    required: false,
    canClear: true,
    choices: [],
  },
];
function card(recordId = id) {
  return {
    structuredContent: {
      contractVersion: 'opportunity-card/v1',
      recordId,
      recordName: 'Synthetic deal',
      fields: fields(),
      actions: [{ name: 'editDeal', label: 'Edit opportunity', type: 'record-edit' }],
    },
  };
}
function edit(status = 'Editing', revision = 1, key = 'a', recordId = id) {
  return {
    structuredContent: {
      contractVersion: 'opportunity-edit/v1',
      status,
      recordId,
      recordName: 'Synthetic deal',
      revision,
      reviewRevision: status === 'Review' ? 1 : 0,
      expiresAt: '2026-10-12T12:15:00Z',
      fields: status === 'Editing' ? fields() : [],
      diff:
        status === 'Review'
          ? [
              {
                fieldApi: 'Amount',
                label: 'Amount',
                beforeValue: '10000',
                afterValue: '9007199254740993.01',
              },
            ]
          : [],
      errors: [],
      receipt:
        status === 'Completed'
          ? {
              reference: 'receipt-' + 'c'.repeat(32),
              actorDisplayName: 'Synthetic actor',
              completedAt: '2026-10-12T12:00:03Z',
              status: 'saved',
              diff: [
                {
                  fieldApi: 'Amount',
                  label: 'Amount',
                  beforeValue: '10000',
                  afterValue: '9007199254740993.01',
                },
              ],
            }
          : null,
    },
    _meta: {
      'cardstack/opportunityEdit': {
        interactionKey: key.repeat(64),
        reviewGrant: status === 'Review' ? 'b'.repeat(64) : null,
      },
    },
  };
}
async function harness({ lateConnect = false } = {}) {
  const { mountOpportunity } = await import('../ui/opportunity-edit/controller.mjs');
  const dom = new JSDOM('<main id="root"></main>');
  let now = start,
    timer,
    resolveConnect;
  const calls = [],
    pending = [];
  const app = {
    connect() {
      assert.equal(typeof this.ontoolresult, 'function');
      assert.equal(typeof this.ontoolinput, 'function');
      assert.equal(typeof this.onteardown, 'function');
      return lateConnect ? new Promise((r) => (resolveConnect = r)) : Promise.resolve();
    },
    callServerTool(input) {
      calls.push(structuredClone(input));
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
  const controller = mountOpportunity(app, dom.window.document, {
    now: () => now,
    setInterval: (fn) => ((timer = fn), 1),
    clearInterval: () => (timer = null),
  });
  await tick();
  const doc = dom.window.document;
  return {
    app,
    controller,
    doc,
    calls,
    pending,
    open: (r) => app.ontoolresult(r || card()),
    reply: (r) => pending.shift().resolve(r),
    fail: () => pending.shift().reject(Error('secret')),
    connected: async () => {
      resolveConnect();
      await tick();
    },
    advance: (ms) => {
      now += ms;
      timer?.();
    },
    state: () => doc.querySelector('[role=status]').dataset.state,
    button: (a) => doc.querySelector(`[data-action="${a}"]`),
    click(a) {
      const b = this.button(a);
      assert.ok(b, `missing ${a}`);
      b.click();
    },
    input(api, value) {
      doc.querySelector(`[data-field="${api}"]`).value = value;
    },
    review() {
      doc.querySelector('[data-action=review]').click();
    },
  };
}
async function editing() {
  const h = await harness();
  h.open(card());
  h.click('start');
  h.reply(edit());
  await tick();
  return h;
}
test('bridge handshake and card both required before launch; no secrets or raw content render', async () => {
  const h = await harness({ lateConnect: true });
  h.open(card());
  assert.equal(h.button('start').disabled, true);
  await h.connected();
  assert.equal(h.button('start').disabled, false);
  h.click('start');
  h.reply({ ...edit(), content: [{ type: 'text', text: 'private-text' }] });
  await tick();
  assert.equal(h.state(), 'Editing');
  assert.doesNotMatch(h.doc.body.innerHTML, /a{64}|private-text/);
});
test('all three literals stay exact; confirm contains only pinned server authority; duplicate clicks suppressed', async () => {
  const h = await editing();
  h.input('StageName', 'Closed Won');
  h.input('CloseDate', '2026-12-15');
  h.input('Amount', '9007199254740993.01');
  const reviewButton = h.button('review');
  reviewButton.click();
  reviewButton.click();
  assert.deepEqual(h.calls[1].arguments.changes, [
    { fieldApi: 'StageName', operation: 'set', value: 'Closed Won' },
    { fieldApi: 'CloseDate', operation: 'set', value: '2026-12-15' },
    { fieldApi: 'Amount', operation: 'set', value: '9007199254740993.01' },
  ]);
  h.reply(edit('Review', 2));
  await tick();
  assert.equal(h.doc.activeElement.tagName, 'H2');
  const confirm = h.button('confirm');
  confirm.click();
  confirm.click();
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.calls[2], {
    name: 'cardstack_opportunity_edit_transition',
    arguments: {
      interactionKey: 'a'.repeat(64),
      operation: 'confirm',
      expectedRevision: 2,
      reviewRevision: 1,
      reviewGrant: 'b'.repeat(64),
    },
  });
  h.reply(edit('Completed', 3));
  await tick();
  assert.equal(h.state(), 'Completed');
  assert.match(h.doc.body.textContent, /9,007,199,254,740,993\.01/);
  assert.doesNotMatch(h.doc.body.innerHTML, /a{64}|b{64}/);
});
test('inactive picklist keep-current is omission, explicit clearing differs from blank', async () => {
  const h = await editing();
  h.input('Amount', '');
  h.review();
  assert.equal(h.calls.length, 1);
  assert.equal(h.doc.activeElement.dataset.field, 'Amount');
  h.doc.querySelector('[data-clear="Amount"]').click();
  h.review();
  assert.deepEqual(h.calls[1].arguments.changes, [{ fieldApi: 'Amount', operation: 'clear' }]);
});
test('zero is a literal and invalid calendar does not dispatch', async () => {
  const h = await editing();
  h.input('Amount', '0');
  h.input('CloseDate', '2026-02-30');
  assert.equal(h.doc.querySelector('[data-field=CloseDate]').value, '');
  h.review();
  assert.equal(h.calls.length, 1);
  h.input('CloseDate', '2028-02-29');
  h.review();
  assert.equal(h.calls[1].arguments.changes[1].value, '0');
});
test('server validation returns editing with field errors and retained drafts', async () => {
  const h = await editing();
  h.input('Amount', '15');
  h.review();
  const r = edit('Editing', 2);
  r.structuredContent.errors = [
    {
      fieldApi: 'Amount',
      code: 'INVALID_VALUE',
      message: 'Amount exceeds the allowed limit.',
    },
  ];
  h.reply(r);
  await tick();
  assert.match(h.doc.body.textContent, /allowed limit/);
  assert.equal(h.doc.querySelector('[data-field="Amount"]').value, '15');
  assert.equal(h.doc.activeElement.dataset.field, 'Amount');
});
test('Back invalidates grant; Cancel has no patch/grant and stops editing', async () => {
  const h = await editing();
  h.input('Amount', '15');
  h.review();
  h.reply(edit('Review', 2));
  await tick();
  h.click('back');
  assert.deepEqual(h.calls[2].arguments, {
    interactionKey: 'a'.repeat(64),
    expectedRevision: 2,
    operation: 'back',
  });
  h.reply(edit('Editing', 3));
  await tick();
  assert.equal(h.doc.querySelector('[data-field="Amount"]').value, '15');
  h.click('cancel');
  assert.deepEqual(h.calls[3].arguments, {
    interactionKey: 'a'.repeat(64),
    expectedRevision: 3,
    operation: 'cancel',
  });
  h.reply(edit('Cancelled', 4));
  await tick();
  assert.equal(h.state(), 'Cancelled');
  assert.equal(h.button('confirm'), null);
});
test('known completion survives failed refresh; fresh card is separate from immutable receipt', async () => {
  const h = await editing();
  h.review();
  const r = edit('Completed', 2);
  r.structuredContent.receipt.status = 'noChanges';
  r.structuredContent.receipt.diff = [];
  h.reply(r);
  await tick();
  const historicalReceipt = h.doc.querySelector('[data-receipt]').textContent;
  h.click('refresh');
  h.fail();
  await tick();
  assert.equal(h.state(), 'Completed');
  assert.match(h.doc.body.textContent, /No changes/);
  h.click('refresh');
  const c = card();
  c.structuredContent.fields[2].value = '999';
  c.structuredContent.recordName = 'Checked renamed deal';
  h.reply(c);
  await tick();
  assert.equal(h.state(), 'Completed');
  assert.match(h.doc.querySelector('[data-current-card]').textContent, /999/);
  assert.equal(h.doc.querySelector('h1').textContent, 'Checked renamed deal');
  assert.equal(h.doc.querySelector('[data-receipt]').textContent, historicalReceipt);
  h.click('refresh'); h.fail(); await tick();
  assert.equal(h.doc.querySelector('h1').textContent, 'Checked renamed deal');
  assert.equal(h.doc.querySelector('[data-receipt]').textContent, historicalReceipt);
});
test('lost save response offers status recovery only; Resume recovers receipt without repeating confirm', async () => {
  const h = await editing();
  h.input('Amount', '15');
  h.review();
  h.reply(edit('Review', 2));
  await tick();
  h.click('confirm');
  h.fail();
  await tick();
  assert.equal(h.state(), 'Unknown');
  assert.equal(h.button('confirm'), null);
  assert.equal(h.button('cancel'), null);
  h.click('resume');
  assert.deepEqual(h.calls[3].arguments, {
    interactionKey: 'a'.repeat(64),
    operation: 'resume',
  });
  h.reply(edit('Completed', 3));
  await tick();
  assert.equal(h.state(), 'Completed');
  assert.equal(h.calls.filter((c) => c.arguments.operation === 'confirm').length, 1);
});
test('OUTCOME_UNAVAILABLE is unknown while explicit denial removes historical answers and grant', async () => {
  for (const code of ['OUTCOME_UNAVAILABLE', 'RECORD_UNAVAILABLE']) {
    const h = await editing();
    h.review();
    h.reply({
      isError: true,
      structuredContent: {
        contractVersion: 'opportunity-edit/v1',
        status: 'Rejected',
        errors: [{ code, message: 'Check latest server state.' }],
      },
    });
    await tick();
    assert.equal(h.state(), code === 'OUTCOME_UNAVAILABLE' ? 'Unknown' : 'Rejected');
    assert.equal(h.button('confirm'), null);
    if (code !== 'OUTCOME_UNAVAILABLE') assert.equal(h.doc.querySelector('[data-field]'), null);
  }
});
test('record input switch and late response cannot replace new card or enable old confirmation', async () => {
  const h = await editing();
  h.review();
  h.app.ontoolinput({ arguments: { recordId: otherId } });
  h.open(card(otherId));
  h.reply(edit('Review', 2));
  await tick();
  assert.equal(h.state(), 'Card');
  assert.equal(h.button('confirm'), null);
  h.open(edit('Review', 2));
  assert.equal(h.state(), 'Card');
});
test('expiry prevents Confirm; in-flight save still recovers with Resume past expiry', async () => {
  const h = await editing();
  h.review();
  h.reply(edit('Review', 2));
  await tick();
  h.advance(900000);
  assert.equal(h.button('confirm'), null);
  assert.equal(h.state(), 'Expired');
  const save = await editing();
  save.review();
  save.reply(edit('Review', 2));
  await tick();
  save.click('confirm');
  save.advance(900000);
  save.fail();
  await tick();
  assert.equal(save.state(), 'Unknown');
  save.click('resume');
  save.reply(edit('Completed', 3));
  await tick();
  assert.equal(save.state(), 'Completed');
});
test('reload only resumes from host-supplied private metadata; absent key truthfully unavailable', async () => {
  for (const key of [true, false]) {
    const h = await harness();
    const r = edit('Review', 2);
    if (!key) delete r._meta;
    h.open(r);
    assert.equal(h.button('confirm'), null);
    assert.equal(h.state(), key ? 'Recoverable' : 'Unavailable');
    if (key) {
      h.click('resume');
      h.reply(edit('Review', 2));
      await tick();
      assert.equal(h.button('confirm').disabled, false);
    }
  }
});
test('teardown/close invalidates replies; malformed contract and checksum rejected', async () => {
  const h = await editing();
  h.review();
  await h.app.onteardown();
  h.reply(edit('Review', 2));
  h.open(card());
  await tick();
  assert.equal(h.state(), 'Disconnected');
  const bad = await harness();
  const r = card();
  r.structuredContent.recordId = '006000000000001AAZ';
  bad.open(r);
  assert.equal(bad.state(), 'Unavailable');
});
test('unsafe labels are text, unknown type read-only, generic layout supports all declared types', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>');
  const rows = [
    'STRING',
    'TEXTAREA',
    'BOOLEAN',
    'INTEGER',
    'DECIMAL',
    'DOUBLE',
    'CURRENCY',
    'DATE',
    'PICKLIST',
    'FUTURE',
  ].map((dataType, i) => ({
    fieldApi: 'Generic' + i,
    label: '<img src=x onerror=alert(1)>',
    value: dataType === 'BOOLEAN' ? 'false' : null,
    dataType,
    required: false,
    canClear: true,
    choices: dataType === 'PICKLIST' ? [{ label: 'One', value: 'one' }] : [],
  }));
  renderScreen(
    dom.window.document.querySelector('main'),
    {
      status: 'Editing',
      recordName: 'Generic fixture',
      fields: rows,
      layout: {
        version: 1,
        sections: [
          {
            id: 'general',
            label: 'General',
            columns: 2,
            fields: rows.map((f) => f.fieldApi),
          },
        ],
      },
      editable: true,
    },
    {},
  );
  assert.equal(dom.window.document.querySelector('img'), null);
  assert.equal(dom.window.document.querySelectorAll('[data-field]').length, 9);
  assert.match(dom.window.document.body.textContent, /unavailable/);
});
test('generic validation preserves exact strings and distinguishes blank, clear, false, zero, inactive', async () => {
  const { validateChanges } = await import('../ui/opportunity-edit/fields.mjs');
  const f = (type, value, extra = {}) => ({
    fieldApi: 'Value',
    label: 'Value',
    value,
    dataType: type,
    required: false,
    canClear: true,
    choices: [],
    ...extra,
  });
  for (const [type, value] of [
    ['STRING', ''],
    ['TEXTAREA', 'one\ntwo'],
    ['BOOLEAN', 'false'],
    ['INTEGER', '9007199254740993'],
    ['DECIMAL', '9007199254740993.010'],
    ['DOUBLE', '0'],
    ['CURRENCY', '0'],
    ['DATE', '2028-02-29'],
  ]) {
    const result = validateChanges([f(type, null)], {
      Value: { operation: 'set', value },
    });
    assert.deepEqual(result.changes, [{ fieldApi: 'Value', operation: 'set', value }]);
    assert.equal(result.errors.length, 0);
  }
  for (const [type, value] of [
    ['INTEGER', '1.1'],
    ['DECIMAL', '1e2'],
    ['DOUBLE', 'NaN'],
    ['DATE', '2026-02-29'],
    ['BOOLEAN', '0'],
    ['CURRENCY', ''],
  ])
    assert.equal(validateChanges([f(type, null)], { Value: { operation: 'set', value } }).errors.length, 1);
  assert.deepEqual(validateChanges([f('PICKLIST', 'old')], {}).changes, []);
  assert.equal(
    validateChanges([f('PICKLIST', 'old')], {
      Value: { operation: 'set', value: 'old' },
    }).errors.length,
    1,
  );
  assert.equal(
    validateChanges([f('DATE', null, { required: true })], {
      Value: { operation: 'clear' },
    }).errors.length,
    1,
  );
});
test('checked layout rejects dangerous metadata, duplicate and unknown references', async () => {
  const { resolveLayout } = await import('../ui/opportunity-edit/layout.mjs');
  for (const layout of [
    { version: 1, html: '<script>', sections: [] },
    {
      version: 1,
      sections: [{ id: 'one', label: 'One', fields: ['Amount', 'Amount'], columns: 1 }],
    },
    {
      version: 1,
      sections: [{ id: 'one', label: 'One', fields: ['Other'], columns: 2 }],
    },
    {
      version: 1,
      sections: [{ id: 'one', label: 'One', fields: ['Amount'], columns: 3 }],
    },
  ])
    assert.throws(() => resolveLayout(fields(), layout));
  assert.equal(resolveLayout(fields()).length, 1);
});
test('known access denial after completion hides receipt and drafts', async () => {
  const h = await editing();
  h.review();
  h.reply(edit('Completed', 2));
  await tick();
  h.click('refresh');
  h.reply({
    isError: true,
    structuredContent: {
      contractVersion: 'opportunity-edit/v1',
      status: 'Rejected',
      errors: [{ code: 'RECORD_UNAVAILABLE', message: 'Record unavailable.' }],
    },
  });
  await tick();
  assert.equal(h.state(), 'Rejected');
  assert.equal(h.doc.querySelector('[data-receipt]'), null);
});
test('Saving replaces cancel with disabled status control until pending response resolves', async () => {
  const h = await editing();
  h.review();
  h.reply(edit('Review', 2));
  await tick();
  h.click('confirm');
  assert.equal(h.state(), 'Saving');
  assert.equal(h.button('cancel'), null);
  assert.equal(h.button('resume').disabled, true);
});
test('generic nullable Boolean can explicitly set false without Number coercion', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>');
  let draft;
  renderScreen(
    dom.window.document.querySelector('main'),
    {
      status: 'Editing',
      editable: true,
      fields: [
        {
          fieldApi: 'Flag',
          label: 'Flag',
          dataType: 'BOOLEAN',
          value: null,
          required: false,
          canClear: true,
          choices: [],
        },
      ],
    },
    { review: (d) => (draft = d) },
  );
  const checkbox = dom.window.document.querySelector('[data-field]');
  checkbox.click();
  checkbox.click();
  dom.window.document.querySelector('[data-action=review]').click();
  assert.deepEqual(draft.Flag, { operation: 'set', value: 'false' });
});
test('field descriptor metadata rejects executable additions', async () => {
  const { checkedFields } = await import('../ui/opportunity-edit/fields.mjs');
  for (const extra of [
    { html: '<script>' },
    { script: 'alert(1)' },
    { style: 'color:red' },
    { expression: 'arbitrary' },
  ])
    assert.throws(() => checkedFields([{ ...fields()[0], ...extra }]));
});
test('delayed response for same record but wrong interview cannot grant confirmation', async () => {
  const h = await editing();
  h.review();
  h.reply(edit('Review', 2, 'd'));
  await tick();
  assert.equal(h.state(), 'Unknown');
  assert.equal(h.button('confirm'), null);
  h.click('resume');
  assert.equal(h.calls.at(-1).arguments.interactionKey, 'a'.repeat(64));
});
test('generated pinned SDK runtime initializes and executes review/confirm through real JSON-RPC messages', async () => {
  const outgoing = [],
    logs = [];
  let win,
    interviewRevision = 0;
  const dom = new JSDOM(
    fs.readFileSync(
      path.join(__dirname, '../force-app/main/default/staticresources/CardstackOpportunityEditUi.resource'),
      'utf8',
    ),
    {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(w) {
        win = w;
        w.ResizeObserver = class {
          observe() {}
          disconnect() {}
        };
        w.fetch = () => {
          throw Error('HTTP forbidden');
        };
        for (const level of ['log', 'debug', 'info', 'warn', 'error']) w.console[level] = (...args) => logs.push(args);
        w.postMessage = (message) => {
          outgoing.push(message);
          let response;
          if (message.method === 'ui/initialize')
            response = {
              protocolVersion: message.params.protocolVersion,
              hostInfo: { name: 'Synthetic SDK host', version: '1' },
              hostCapabilities: { serverTools: {} },
              hostContext: { theme: 'light' },
            };
          if (message.method === 'tools/call') {
            const operation = message.params.arguments.operation;
            response = edit(
              operation === 'review' ? 'Review' : operation === 'confirm' ? 'Completed' : 'Editing',
              ++interviewRevision,
            );
            response.content = [];
            response.structuredContent.expiresAt = new Date(Date.now() + 600000)
              .toISOString()
              .replace(/\.\d{3}Z$/, 'Z');
          }
          if (response)
            queueMicrotask(() =>
              w.dispatchEvent(
                new w.MessageEvent('message', {
                  source: w,
                  data: { jsonrpc: '2.0', id: message.id, result: response },
                }),
              ),
            );
        };
      },
    },
  );
  try {
    await tick();
    await tick();
    assert.ok(outgoing.some((m) => m.method === 'ui/initialize'));
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source: win,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: { ...card(), content: [] },
        },
      }),
    );
    await tick();
    win.document.querySelector('[data-action=start]').click();
    await tick();
    win.document.querySelector('[data-field=Amount]').value = '9007199254740993.01';
    win.document.querySelector('[data-action=review]').click();
    await tick();
    win.document.querySelector('[data-action=confirm]').click();
    await tick();
    assert.equal(win.document.querySelector('[role=status]').dataset.state, 'Completed');
    assert.equal(outgoing.filter((m) => m.method === 'tools/call').length, 3);
    assert.deepEqual(logs, []);
    assert.doesNotMatch(win.document.body.innerHTML, /a{64}|b{64}/);
  } finally {
    win.dispatchEvent(new win.Event('pagehide'));
    dom.window.close();
  }
});
test('built bridge-free preview supports generic controls and enforces disabled Save; foreign messages ignored', async () => {
  const dom = new JSDOM(
    fs.readFileSync(
      path.join(__dirname, '../force-app/main/default/staticresources/CardstackOpportunityPreviewUi.resource'),
      'utf8',
    ),
    { runScripts: 'dangerously' },
  );
  try {
    const doc = dom.window.document;
    assert.match(doc.querySelector('#root').textContent, /Synthetic Studio preview/);
    doc.querySelector('[data-field=Amount]').value = '15000.25';
    doc.querySelector('[data-action=review]').click();
    assert.equal(doc.querySelector('[data-action=confirm]').disabled, true);
    assert.match(doc.querySelector('table').textContent, /15,000\.25/);
    doc.querySelector('[data-action=back]').click();
    [...doc.querySelectorAll('nav button')].find((b) => b.textContent === 'All supported controls').click();
    assert.equal(doc.querySelectorAll('[data-field]').length, 9);
    const parent = {};
    Object.defineProperty(dom.window, 'parent', { value: parent });
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: {},
        data: { type: 'cardstack-preview/v1', fields: fields() },
      }),
    );
    assert.equal(doc.querySelectorAll('[data-field]').length, 9);
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: parent,
        data: {
          type: 'cardstack-preview/v1',
          scenario:'Opportunity',objectApiName:'Opportunity',nativeKeyPrefix:'006',recordId:id,mode:'opportunity-stage',
          fields:fields().map((field,index)=>index ? field : {...field,value:'Discovery',choices:[{label:'Discovery',value:'Discovery'},{label:'Closed won',value:'Closed Won'}]}),
          layout: {
            version: 1,
            sections: [
              {
                id: 'edit',
                label: 'Synthetic layout',
                columns: 1,
                fields: ['StageName', 'CloseDate', 'Amount'],
              },
            ],
          },
        },
      }),
    );
    assert.equal(doc.querySelectorAll('[data-field]').length, 3);
    assert.match(doc.querySelector('#root').textContent, /Synthetic layout/);
    assert.equal(doc.querySelector('script').textContent.includes('ui/initialize'), false);
  } finally {
    dom.window.close();
  }
});
test('built local-only synthetic demo recovers dropped response and separates refreshed record from receipt', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'fixtures/opportunity-screen-demo.html'), 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.crypto.randomUUID = require('node:crypto').randomUUID;
      w.structuredClone = global.structuredClone;
      w.fetch = () => {
        throw Error('HTTP forbidden');
      };
    },
  });
  try {
    await tick();
    const doc = dom.window.document;
    assert.match(doc.body.textContent, /Synthetic transport demo/);
    doc.querySelector('[data-action=start]').click();
    await tick();
    doc.querySelector('[data-field=StageName]').value = 'Closed Won';
    doc.querySelector('[data-field=CloseDate]').value = '2026-12-15';
    doc.querySelector('[data-field=Amount]').value = '12500.25';
    doc.querySelector('[data-action=review]').click();
    await tick();
    assert.equal(doc.querySelectorAll('tbody tr').length, 3);
    [...doc.querySelectorAll('nav button')].find((b) => b.textContent === 'Drop next save response').click();
    doc.querySelector('[data-action=confirm]').click();
    await tick();
    assert.equal(doc.querySelector('[role=status]').dataset.state, 'Unknown');
    doc.querySelector('[data-action=resume]').click();
    await tick();
    assert.equal(doc.querySelector('[role=status]').dataset.state, 'Completed');
    doc.querySelector('[data-action=refresh]').click();
    await tick();
    assert.match(doc.querySelector('[data-current-card]').textContent, /12,500\.25/);
    assert.match(doc.querySelector('[data-demo-evidence]').textContent, /fixture effects: 1/);
    assert.match(doc.querySelector('[data-receipt]').textContent, /12,500\.25/);
  } finally {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
  }
});
test('a private handle duplicated in public labels never enters DOM', async () => {
  const h = await editing();
  h.review();
  const r = edit('Review', 2);
  r.structuredContent.diff[0].label = 'a'.repeat(64);
  h.reply(r);
  await tick();
  assert.equal(h.button('confirm'), null);
  assert.doesNotMatch(h.doc.body.innerHTML, /a{64}|b{64}/);
});
test('new host error revokes in-flight authority and late response', async () => {
  const h = await editing();
  h.review();
  h.open({
    isError: true,
    structuredContent: {
      contractVersion: 'opportunity-edit/v1',
      status: 'Rejected',
      errors: [{ code: 'RECORD_UNAVAILABLE', message: 'Record unavailable.' }],
    },
  });
  h.reply(edit('Review', 2));
  await tick();
  assert.equal(h.state(), 'Rejected');
  assert.equal(h.button('confirm'), null);
});
test('malformed fresh-read result preserves known completion and only offers refresh retry', async () => {
  const h = await editing();
  h.review();
  h.reply(edit('Completed', 2));
  await tick();
  h.click('refresh');
  const r = card();
  r.structuredContent.recordId = '006000000000001AAZ';
  h.reply(r);
  await tick();
  assert.equal(h.state(), 'Completed');
  assert.ok(h.doc.querySelector('[data-receipt]'));
  assert.ok(h.button('refresh'));
  assert.equal(h.button('resume'), null);
});
test('Back preserves accepted picklist answer and explicit Keep removes its proposal', async () => {
  const h = await editing();
  h.input('StageName', 'Closed Won');
  h.review();
  h.reply(edit('Review', 2));
  await tick();
  h.click('back');
  const back = edit('Editing', 3);
  back.structuredContent.fields[0].value = 'Closed Won';
  h.reply(back);
  await tick();
  h.review();
  assert.equal(h.calls.at(-1).arguments.changes[0].value, 'Closed Won');
  h.reply(edit('Review', 4));
  await tick();
  h.click('back');
  h.reply(edit('Editing', 5));
  await tick();
  h.input('StageName', '');
  h.review();
  assert.deepEqual(h.calls.at(-1).arguments.changes, []);
});

test('SDK error during completed receipt refresh keeps known outcome and rejects late read reply', async () => {
  const h = await editing();
  h.review();
  h.reply(edit('Completed', 2));
  await tick();
  const original = h.doc.querySelector('[data-receipt]').textContent;
  h.click('refresh');
  h.app.onerror(Error('Synthetic protocol error'));
  assert.equal(h.state(), 'Completed');
  assert.equal(h.doc.querySelector('[data-receipt]').textContent, original);
  assert.equal(h.button('refresh').disabled, false);
  assert.equal(h.button('resume'), null);
  const late = card();
  late.structuredContent.fields[2].value = '999';
  h.reply(late);
  await tick();
  assert.equal(h.doc.querySelector('[data-current-card]'), null);
  assert.equal(h.doc.querySelector('[data-receipt]').textContent, original);
  h.click('refresh');
  h.reply(card());
  await tick();
  assert.ok(h.doc.querySelector('[data-current-card]'));
});

test('unsolicited wrong-interview and older same-record Views cannot replace Review, receipt or Resume target', async () => {
  for (const state of ['Review', 'Completed', 'Unknown']) {
    const h = await editing();
    h.review();
    h.reply(edit('Review', 2));
    await tick();
    if (state !== 'Review') {
      h.click('confirm');
      if (state === 'Completed') h.reply(edit('Completed', 3));
      else h.fail();
      await tick();
    }
    const originalReceipt = h.doc.querySelector('[data-receipt]')?.textContent;
    h.open(edit('Review', 1, 'd'));
    assert.equal(h.state(), state);
    h.open(edit('Completed', 4, 'd'));
    h.open(edit('Editing', 1));
    h.open(card());
    assert.equal(h.state(), state);
    assert.equal(h.doc.querySelector('[data-receipt]')?.textContent, originalReceipt);
    if (state === 'Review') {
      h.click('confirm');
      assert.equal(h.calls.at(-1).arguments.interactionKey, 'a'.repeat(64));
      assert.equal(h.calls.at(-1).arguments.expectedRevision, 2);
      assert.equal(h.calls.at(-1).arguments.reviewGrant, 'b'.repeat(64));
    } else if (state === 'Unknown') {
      h.click('resume');
      assert.equal(h.calls.at(-1).arguments.interactionKey, 'a'.repeat(64));
    }
  }
  const fresh = await editing();
  fresh.app.ontoolinput({ arguments: { recordId: id } });
  fresh.open(edit('Editing', 3, 'd'));
  assert.equal(fresh.state(), 'Recoverable');
  fresh.click('resume');
  assert.equal(fresh.calls.at(-1).arguments.interactionKey, 'd'.repeat(64));
});

test('Resume reconstructs displayed retained proposal and explicit Clear without converting initial-start Keep', async () => {
  for (const amount of ['15', '0', null]) {
    const h = await harness();
    const retained = edit('Editing', 3);
    retained.structuredContent.fields[2].value = amount;
    h.open(retained);
    h.click('resume');
    h.reply(retained);
    await tick();
    assert.equal(h.doc.querySelector('[data-field=Amount]').value, amount ?? '');
    if (amount === null) assert.equal(h.doc.querySelector('[data-clear=Amount]').checked, true);
    h.review();
    assert.deepEqual(h.calls.at(-1).arguments.changes, [
      { fieldApi: 'CloseDate', operation: 'set', value: '2026-11-30' },
      amount === null
        ? { fieldApi: 'Amount', operation: 'clear' }
        : { fieldApi: 'Amount', operation: 'set', value: amount },
    ]);
  }
  const initial = await editing();
  initial.review();
  assert.deepEqual(initial.calls.at(-1).arguments.changes, []);
});

test('generic descriptor-to-draft reconstruction retains false, zero and Clear while omitting inactive picklist', async () => {
  const { draftsFromFields, validateChanges } = await import('../ui/opportunity-edit/fields.mjs');
  const rows = [
    {
      fieldApi: 'Flag',
      label: 'Flag',
      dataType: 'BOOLEAN',
      value: 'false',
      required: false,
      canClear: false,
      choices: [],
    },
    {
      fieldApi: 'Count',
      label: 'Count',
      dataType: 'INTEGER',
      value: '0',
      required: false,
      canClear: false,
      choices: [],
    },
    {
      fieldApi: 'Optional',
      label: 'Optional',
      dataType: 'CURRENCY',
      value: null,
      required: false,
      canClear: true,
      choices: [],
    },
    {
      fieldApi: 'Stage',
      label: 'Stage',
      dataType: 'PICKLIST',
      value: 'inactive',
      required: true,
      canClear: false,
      choices: [{ label: 'Active', value: 'active' }],
    },
  ];
  const drafts = draftsFromFields(rows);
  assert.deepEqual(validateChanges(rows, drafts), {
    changes: [
      { fieldApi: 'Flag', operation: 'set', value: 'false' },
      { fieldApi: 'Count', operation: 'set', value: '0' },
      { fieldApi: 'Optional', operation: 'clear' },
    ],
    errors: [],
  });
});

test('restored Review resumed then Back preserves complete displayed proposals through the next server review', async () => {
  for (const amount of ['15', null]) {
    const h = await harness();
    const diff = [
      { fieldApi: 'StageName', label: 'Stage', beforeValue: 'Discovery', afterValue: 'Closed Won' },
      { fieldApi: 'CloseDate', label: 'Close date', beforeValue: '2026-11-30', afterValue: '2026-12-15' },
      { fieldApi: 'Amount', label: 'Amount', beforeValue: '10000', afterValue: amount },
    ];
    const retained = edit('Review', 2);
    retained.structuredContent.diff = diff;
    h.open(retained);
    h.click('resume');
    const resumed = edit('Review', 3);
    resumed.structuredContent.reviewRevision = 2;
    resumed.structuredContent.diff = diff;
    h.reply(resumed);
    await tick();
    const shownDiff = () =>
      [...h.doc.querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent));
    assert.deepEqual(shownDiff(), [
      ['Stage', 'Discovery', 'Closed Won'],
      ['Close date', '2026-11-30', '2026-12-15'],
      ['Amount', '10000', amount ?? 'Cleared'],
    ]);
    h.click('back');
    const back = edit('Editing', 4);
    back.structuredContent.reviewRevision = 2;
    back.structuredContent.fields[0].value = 'Closed Won';
    back.structuredContent.fields[1].value = '2026-12-15';
    back.structuredContent.fields[2].value = amount;
    h.reply(back);
    await tick();
    assert.equal(h.doc.querySelector('[data-field=Amount]').value, amount ?? '');
    if (amount === null) assert.equal(h.doc.querySelector('[data-clear=Amount]').checked, true);
    h.review();
    assert.deepEqual(h.calls.at(-1).arguments.changes, [
      { fieldApi: 'StageName', operation: 'set', value: 'Closed Won' },
      { fieldApi: 'CloseDate', operation: 'set', value: '2026-12-15' },
      amount === null
        ? { fieldApi: 'Amount', operation: 'clear' }
        : { fieldApi: 'Amount', operation: 'set', value: amount },
    ]);
    const nextReview = edit('Review', 5);
    nextReview.structuredContent.reviewRevision = 3;
    nextReview.structuredContent.diff = diff;
    h.reply(nextReview);
    await tick();
    assert.deepEqual(shownDiff(), [
      ['Stage', 'Discovery', 'Closed Won'],
      ['Close date', '2026-11-30', '2026-12-15'],
      ['Amount', '10,000', amount ?? 'Cleared'],
    ]);
  }
});

test('Review click delivers exact drafts when native form submission cannot reach the submit handler', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main'),
    calls = [];
  renderScreen(root, { status: 'Editing', editable: true, fields: fields() }, { review: (draft) => calls.push(draft) });
  let nativeSubmissions = 0;
  const blockNativeSubmission = (event) => {
    nativeSubmissions++;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  root.querySelector('form').addEventListener('submit', blockNativeSubmission, { capture: true });
  root.querySelector('[data-field=StageName]').value = 'Closed Won';
  root.querySelector('[data-field=CloseDate]').value = '2026-12-15';
  root.querySelector('[data-field=Amount]').value = '9007199254740993.01';
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls, [
    {
      StageName: { operation: 'set', value: 'Closed Won' },
      CloseDate: { operation: 'set', value: '2026-12-15' },
      Amount: { operation: 'set', value: '9007199254740993.01' },
    },
  ]);
  assert.equal(nativeSubmissions, 0);
  root.querySelector('form').removeEventListener('submit', blockNativeSubmission, { capture: true });
  const defensiveSubmit = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  root.querySelector('form').dispatchEvent(defensiveSubmit);
  assert.equal(defensiveSubmit.defaultPrevented, true);
  assert.equal(calls.length, 1);
  dom.window.close();
});

test('single-line Enter reviews directly while textarea, choice, composition and disabled forms retain their behavior', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main'),
    calls = [];
  const rows = [
    {
      fieldApi: 'Title',
      label: 'Title',
      value: 'Before',
      dataType: 'STRING',
      required: true,
      canClear: false,
      choices: [],
    },
    {
      fieldApi: 'Notes',
      label: 'Notes',
      value: 'Before',
      dataType: 'TEXTAREA',
      required: false,
      canClear: false,
      choices: [],
    },
    {
      fieldApi: 'Choice',
      label: 'Choice',
      value: 'one',
      dataType: 'PICKLIST',
      required: false,
      canClear: false,
      choices: [{ label: 'One', value: 'one' }],
    },
  ];
  const model = { status: 'Editing', editable: true, fields: rows };
  const callbacks = { review: (draft) => calls.push(draft) };
  renderScreen(root, model, callbacks);
  const title = root.querySelector('[data-field=Title]'),
    notes = root.querySelector('[data-field=Notes]');
  title.value = 'After';
  notes.value = 'First line\nSecond line';
  const enter = (control, extra = {}) => {
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...extra });
    control.dispatchEvent(event);
    return event;
  };
  notes.focus();
  assert.equal(enter(notes).defaultPrevented, false);
  assert.equal(dom.window.document.activeElement, notes);
  assert.equal(enter(root.querySelector('[data-field=Choice]')).defaultPrevented, false);
  for (const extra of [
    { isComposing: true },
    { repeat: true },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
  ])
    enter(title, extra);
  assert.equal(calls.length, 0);
  title.focus();
  assert.equal(enter(title).defaultPrevented, true);
  assert.deepEqual(calls, [
    {
      Title: { operation: 'set', value: 'After' },
      Notes: { operation: 'set', value: 'First line\nSecond line' },
      Choice: { operation: 'keep' },
    },
  ]);
  renderScreen(root, { ...model, editable: false }, callbacks);
  root.querySelector('[data-action=review]').click();
  enter(root.querySelector('[data-field=Title]'));
  assert.equal(calls.length, 1);
  renderScreen(
    root,
    { ...model, errors: [{ fieldApi: 'Title', code: 'CLIENT_VALUE', message: 'Enter a title.' }], focusError: true },
    callbacks,
  );
  assert.equal(dom.window.document.activeElement.dataset.field, 'Title');
  assert.equal(dom.window.document.activeElement.getAttribute('aria-invalid'), 'true');
  dom.window.close();
});

test('native Date preserves calendar literals and bounds without intercepting calendar Enter', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>'),
    root = dom.window.document.querySelector('main'),
    calls = [];
  renderScreen(
    root,
    { status: 'Editing', editable: true, fields: [fields()[1]] },
    { review: (draft) => calls.push(draft) },
  );
  const date = root.querySelector('[data-field=CloseDate]');
  assert.equal(date.type, 'date');
  assert.equal(date.value, '2026-11-30');
  assert.equal(date.min, '0001-01-01');
  assert.equal(date.max, '9999-12-31');
  date.value = '2028-02-29';
  const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  date.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, false);
  assert.equal(calls.length, 0);
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls, [{ CloseDate: { operation: 'set', value: '2028-02-29' } }]);
  date.value = '2026-02-30';
  assert.equal(date.value, '');
  dom.window.close();
});

test('picklists load current selection without creating a patch and preserve explicit Keep, missing and inactive choices', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>'),
    root = dom.window.document.querySelector('main'),
    calls = [];
  const available = { ...fields()[0], value: 'Closed Won' };
  const render = (field, drafts = {}) =>
    renderScreen(
      root,
      { status: 'Editing', editable: true, fields: [field], drafts },
      { review: (draft) => calls.push(draft) },
    );
  render(available);
  assert.equal(root.querySelector('select').value, 'Closed Won');
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop(), { StageName: { operation: 'keep' } });
  render(available, { StageName: { operation: 'set', value: 'Discovery' } });
  assert.equal(root.querySelector('select').value, 'Discovery');
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop(), { StageName: { operation: 'set', value: 'Discovery' } });
  root.querySelector('select').value = '';
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop(), { StageName: { operation: 'keep' } });
  render(available, { StageName: { operation: 'keep' } });
  assert.equal(root.querySelector('select').value, 'Closed Won');
  render({ ...available, value: null });
  assert.equal(root.querySelector('select').value, '');
  render(fields()[0]);
  const select = root.querySelector('select');
  assert.equal(select.value, 'Inactive');
  assert.equal(select.selectedOptions[0].disabled, true);
  assert.match(select.selectedOptions[0].textContent, /unavailable/i);
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop(), { StageName: { operation: 'keep' } });
  select.value = 'Discovery';
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop(), { StageName: { operation: 'set', value: 'Discovery' } });
  dom.window.close();
});

test('strict numeric grouping canonicalizes exact strings and rejects malformed separators without touching text', async () => {
  const { validateChanges } = await import('../ui/opportunity-edit/fields.mjs');
  const field = (dataType) => ({
    fieldApi: 'Generic',
    label: 'Generic',
    dataType,
    value: null,
    required: false,
    canClear: true,
    choices: [],
  });
  for (const [type, input, canonical] of [
    ['INTEGER', '-9,007,199,254,740,993', '-9007199254740993'],
    ['DECIMAL', '-0,001,234.00500', '-0001234.00500'],
    ['DOUBLE', '9,007,199,254,740,993.010', '9007199254740993.010'],
    ['CURRENCY', '0.0000', '0.0000'],
    ['STRING', '9,007,199', '9,007,199'],
  ]) {
    assert.deepEqual(validateChanges([field(type)], { Generic: { operation: 'set', value: input } }), {
      changes: [{ fieldApi: 'Generic', operation: 'set', value: canonical }],
      errors: [],
    });
  }
  for (const input of ['1,23', '1,,234', '1234,567', ',123', '1,234,', '1.2,345', '1 234', '1e3']) {
    const result = validateChanges([field('DECIMAL')], { Generic: { operation: 'set', value: input } });
    assert.equal(result.changes.length, 0);
    assert.equal(result.errors.length, 1);
  }
});

test('grouped inputs and loaded values preserve untouched canonical comparisons, signed zeros and text identifiers', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>'),
    root = dom.window.document.querySelector('main'),
    calls = [];
  const rows = [
    {
      fieldApi: 'Count',
      label: 'Count',
      dataType: 'INTEGER',
      value: '9007199254740993',
      required: false,
      canClear: true,
      choices: [],
    },
    {
      fieldApi: 'Rate',
      label: 'Rate',
      dataType: 'DECIMAL',
      value: '-0001234.00500',
      required: false,
      canClear: true,
      choices: [],
    },
    {
      fieldApi: 'Code',
      label: 'Code',
      dataType: 'STRING',
      value: '123456789',
      required: false,
      canClear: false,
      choices: [],
    },
  ];
  renderScreen(root, { status: 'Editing', editable: true, fields: rows }, { review: (draft) => calls.push(draft) });
  assert.equal(root.querySelector('[data-field=Count]').value, '9,007,199,254,740,993');
  assert.equal(root.querySelector('[data-field=Rate]').value, '-0,001,234.00500');
  assert.equal(root.querySelector('[data-field=Code]').value, '123456789');
  assert.match(root.textContent, /Starting value: 9,007,199,254,740,993/);
  root.querySelector('[data-field=Count]').value = '9007199254740993';
  root.querySelector('[data-field=Count]').dispatchEvent(new dom.window.Event('blur'));
  assert.equal(root.querySelector('[data-field=Count]').value, '9,007,199,254,740,993');
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop(), {
    Count: { operation: 'keep' },
    Rate: { operation: 'keep' },
    Code: { operation: 'keep' },
  });
  root.querySelector('[data-field=Rate]').value = '-0.0000';
  root.querySelector('[data-action=review]').click();
  assert.deepEqual(calls.pop().Rate, { operation: 'set', value: '-0.0000' });
  renderScreen(root, { status: 'Card', fields: rows, actions: [], ready: true }, {});
  assert.match(root.textContent, /9,007,199,254,740,993/);
  assert.match(root.textContent, /-0,001,234.00500/);
  assert.match(root.textContent, /123456789/);
  assert.doesNotMatch(root.textContent, /123,456,789/);
  renderScreen(
    root,
    { status: 'Editing', editable: true, fields: [{ ...rows[0], value: '9'.repeat(4096) }] },
    { review: (draft) => calls.push(draft) },
  );
  root.querySelector('[data-action=review]').click();
  assert.equal(calls.pop().Count.operation, 'keep');
  dom.window.close();
});

test('checked public numeric types format review and immutable receipt but cannot leak across a new record', async () => {
  const h = await editing();
  assert.equal(h.doc.querySelector('[data-field=Amount]').value, '10,000');
  h.input('Amount', '10,000');
  h.review();
  assert.deepEqual(h.calls.at(-1).arguments.changes, []);
  h.reply(edit('Editing', 1));
  await tick();
  h.input('Amount', '9,007,199,254,740,993.01');
  h.review();
  assert.equal(h.calls.at(-1).arguments.changes[0].value, '9007199254740993.01');
  const reviewed = edit('Review', 2),
    exact = structuredClone(reviewed);
  h.reply(reviewed);
  await tick();
  assert.match(h.doc.querySelector('table').textContent, /10,000/);
  assert.match(h.doc.querySelector('table').textContent, /9,007,199,254,740,993.01/);
  assert.deepEqual(reviewed, exact);
  h.click('confirm');
  h.reply(edit('Completed', 3));
  await tick();
  assert.match(h.doc.querySelector('[data-receipt]').textContent, /9,007,199,254,740,993.01/);
  h.click('refresh');
  h.fail();
  await tick();
  assert.match(h.doc.querySelector('[data-receipt]').textContent, /9,007,199,254,740,993.01/);
  h.app.ontoolinput({ arguments: { recordId: otherId } });
  const noTypes = edit('Completed', 3, 'd', otherId);
  h.open(noTypes);
  assert.match(h.doc.querySelector('[data-receipt]').textContent, /9007199254740993.01/);
  assert.doesNotMatch(h.doc.querySelector('[data-receipt]').textContent, /9,007,199,254,740,993.01/);
  h.click('refresh');
  h.reply(card(otherId));
  await tick();
  assert.match(h.doc.querySelector('[data-receipt]').textContent, /9,007,199,254,740,993.01/);
});

test('Editing rerender preserves field node, selection, clear and touched nullable checkbox intent', async () => {
  const { renderScreen } = await import('../ui/opportunity-edit/view.mjs');
  const dom = new JSDOM('<main></main>'), root = dom.window.document.querySelector('main');
  const rows = [...fields(), {fieldApi:'Flag',label:'Flag',dataType:'BOOLEAN',value:null,required:false,canClear:false,choices:[]}];
  const model = {status:'Editing',workspaceKey:1,recordId:id,fields:rows,editable:true};
  renderScreen(root, model);
  const amount = root.querySelector('[data-field=Amount]');
  amount.value = '12345.00'; amount.focus(); amount.setSelectionRange(2,5);
  const clear = root.querySelector('[data-clear=Amount]'); clear.checked = true;
  clear.dispatchEvent(new dom.window.Event('change'));
  const flag = root.querySelector('[data-field=Flag]');
  flag.dispatchEvent(new dom.window.Event('change'));
  const result = renderScreen(root, {...model, message:'Host ready'});
  assert.equal(root.querySelector('[data-field=Amount]'), amount);
  assert.equal(amount.value, '12345.00');
  assert.equal(amount.selectionStart, 2); assert.equal(amount.selectionEnd, 5);
  assert.equal(root.querySelector('[data-clear=Amount]'), clear);
  assert.deepEqual(result.readDraft().Amount, {operation:'clear'});
  assert.deepEqual(result.readDraft().Flag, {operation:'set',value:'false'});
  renderScreen(root, {...model,workspaceKey:2});
  assert.notEqual(root.querySelector('[data-field=Amount]'), amount);
  assert.equal(root.querySelector('[data-clear=Amount]').checked, false);
  dom.window.close();
});

test('Preparing retains Editing controls and Saving retains exact Review while disabling dispatch', async () => {
  const h = await editing();
  const amount = h.doc.querySelector('[data-field=Amount]');
  amount.value = '15';
  h.review();
  assert.equal(h.state(), 'Preparing');
  assert.match(h.doc.querySelector('[role=status]').textContent, /Preparing server review/);
  assert.equal(h.doc.querySelector('[data-field=Amount]'), amount);
  assert.equal(amount.disabled, true);
  const before = h.calls.length; h.click('review'); h.click('cancel');
  assert.equal(h.calls.length, before);
  h.reply(edit('Review',2)); await tick();
  const diff = h.doc.querySelector('table').textContent;
  const reviewContent = h.doc.querySelector('.workspace-content'); reviewContent.scrollTop = 75;
  h.click('confirm');
  assert.equal(h.state(), 'Saving');
  assert.match(h.doc.querySelector('[role=status]').textContent, /Saving the reviewed changes/);
  assert.equal(reviewContent.scrollTop, 75);
  assert.equal(h.doc.querySelector('table').textContent, diff);
  assert.equal(h.button('cancel'), null);
  h.click('confirm'); h.click('resume');
  assert.equal(h.calls.length, before + 1);
  h.reply(edit('Completed',3)); await tick();
  const receipt = h.doc.querySelector('[data-receipt]').textContent;
  h.click('refresh'); h.fail(); await tick();
  assert.equal(h.doc.querySelector('[data-receipt]').textContent, receipt);
  h.app.ontoolinput({arguments:{recordId:otherId}});
  assert.equal(h.doc.querySelector('[data-receipt]'), null);
  assert.doesNotMatch(h.doc.querySelector('#root').textContent, /Synthetic deal/);
});

test('checked host dimensions and safe areas use bounded workspace sizing and clear invalid updates', async () => {
  const { applyWorkspaceContext } = await import('../ui/opportunity-edit/workspace.mjs');
  const dom = new JSDOM('<main id="root"></main>'), doc = dom.window.document;
  applyWorkspaceContext(doc, {containerDimensions:{height:620,maxWidth:800},safeAreaInsets:{top:8,right:12,bottom:16,left:12}});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'), '620px');
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-safe-bottom'), '16px');
  assert.equal(doc.documentElement.dataset.workspaceSize, 'bounded');
  applyWorkspaceContext(doc, {theme:'dark'});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'), '620px');
  applyWorkspaceContext(doc, {containerDimensions:{height:180,width:320},safeAreaInsets:{top:Infinity,bottom:-1}});
  assert.equal(doc.documentElement.dataset.workspaceSize, 'flow');
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-safe-top'), '0px');
  applyWorkspaceContext(doc, {containerDimensions:{height:NaN,width:'320'},safeAreaInsets:{}});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'), '');
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-max-width'), '');
  assert.equal(doc.documentElement.dataset.workspaceSize, 'bounded');
  dom.window.close();
});

test('host context rerender preserves active field and scroll; detached old action cannot dispatch a new interview', async () => {
  const h = await editing(), amount = h.doc.querySelector('[data-field=Amount]');
  amount.value = '12345'; amount.focus(); amount.setSelectionRange(1,4);
  const content = h.doc.querySelector('.workspace-content'); content.scrollTop = 123;
  const staleReview = h.button('review');
  h.app.onhostcontextchanged({theme:'dark'});
  assert.equal(h.doc.querySelector('[data-field=Amount]'), amount);
  assert.equal(h.doc.activeElement, amount);
  assert.equal(amount.selectionStart, 1); assert.equal(amount.selectionEnd, 4);
  assert.equal(content.scrollTop, 123);
  const before = h.calls.length;
  staleReview.click(); assert.equal(h.calls.length, before);
  h.review();
  assert.equal(h.calls.at(-1).arguments.changes[0].value, '12345');
});

test('built Studio preview keeps the invalid Editing control and local text while Save remains disabled', async () => {
  const html = fs.readFileSync(path.resolve(__dirname,'../force-app/main/default/staticresources/CardstackOpportunityPreviewUi.resource'),'utf8');
  const dom = new JSDOM(html,{runScripts:'dangerously'}), doc=dom.window.document;
  await tick();
  const amount=doc.querySelector('[data-field=Amount]');
  amount.value='1,23'; amount.focus(); amount.setSelectionRange(1,3);
  doc.querySelector('[data-action=review]').click();
  assert.equal(doc.querySelector('[data-field=Amount]'),amount);
  assert.equal(amount.value,'1,23');
  assert.equal(doc.activeElement,amount);
  amount.value='123'; doc.querySelector('[data-action=review]').click();
  assert.equal(doc.querySelector('[data-action=confirm]').disabled,true);
  dom.window.close();
});

test('configured review and receipt preserve section order rather than incoming diff order', async () => {
  const {renderScreen}=await import('../ui/opportunity-edit/view.mjs');
  const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main');
  const rows=fields();
  const layout={version:1,sections:[{id:'money',label:'Financial details',columns:1,fields:['Amount']},{id:'dates',label:'Schedule',columns:2,fields:['CloseDate','StageName']}]};
  const diff=[{fieldApi:'CloseDate',label:'Close date',beforeValue:'2026-11-30',afterValue:'2026-12-15'},{fieldApi:'Amount',label:'Amount',beforeValue:'10000',afterValue:'15'}];
  const base={fields:rows,layout,diff};
  renderScreen(root,{...base,status:'Review'});
  assert.deepEqual([...root.querySelectorAll('tbody th')].map(cell=>cell.textContent),['Amount','Close date']);
  renderScreen(root,{...base,status:'Completed',receipt:{status:'saved',actorDisplayName:'Synthetic actor',completedAt:'2026-10-12T12:00:03Z',reference:'synthetic-receipt',diff}});
  assert.deepEqual([...root.querySelectorAll('[data-receipt] tbody th')].map(cell=>cell.textContent),['Amount','Close date']);
  dom.window.close();
});

test('workspace chrome fit preserves a usable content area and rejects overflowing header or actions', async () => {
  const {workspaceChromeFits}=await import('../ui/opportunity-edit/workspace.mjs');
  assert.equal(workspaceChromeFits(264,180,84),false);
  assert.equal(workspaceChromeFits(580,116,50),true);
  assert.equal(workspaceChromeFits(580,116,500),false);
  assert.equal(workspaceChromeFits(264,75,50),true);
});


test('host maximum height caps the compact preference while fixed height retains its explicit size', async () => {
  const {applyWorkspaceContext}=await import('../ui/opportunity-edit/workspace.mjs');
  const dom=new JSDOM('<main id="root"></main>'),doc=dom.window.document;
  applyWorkspaceContext(doc,{containerDimensions:{maxHeight:5000,maxWidth:800}});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'),'500px');
  applyWorkspaceContext(doc,{theme:'dark'});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'),'500px');
  applyWorkspaceContext(doc,{containerDimensions:{maxHeight:300,width:320}});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'),'300px');
  applyWorkspaceContext(doc,{containerDimensions:{height:640,width:800}});
  assert.equal(doc.documentElement.style.getPropertyValue('--workspace-height'),'640px');
  dom.window.close();
});
