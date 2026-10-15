const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../ui/opportunity-edit/delivery-qa.mjs');
const confirm = (name = 'cardstack_record_edit_transition') => ({ name, arguments: { operation: 'confirm', opaque: 'private' } });
const page = { name: 'cardstack_record_related_page', arguments: { recordId: 'private' } };
const tick = () => new Promise(resolve => setImmediate(resolve));
test('disabled default returns the exact SDK and cannot arm interruptions', async () => {
  const { createDeliveryQa } = await load();
  const sdk = { callServerTool: async () => ({ real: true }) };
  const qa = createDeliveryQa(sdk);
  assert.equal(qa.app, sdk);
  assert.equal(qa.armDiscardConfirm(), false);
  assert.equal(qa.armHoldRelatedPage(), false);
  assert.equal(qa.state().enabled, false);
});
test('enabled passthrough preserves SDK this, arguments, options, events and response identity', async () => {
  const { createDeliveryQa } = await load();
  const reply = {}, options = {}, request = confirm(); let calls = 0;
  const sdk = { capability: true, callServerTool(r, o) { assert.equal(this, sdk); assert.equal(r, request); assert.equal(o, options); calls++; return Promise.resolve(reply); }, connect() { return this; } };
  const qa = createDeliveryQa(sdk, { enabled: true });
  const event = () => {}; qa.app.ontoolresult = event;
  assert.equal(sdk.ontoolresult, event);
  assert.equal(qa.app.connect(), sdk);
  assert.equal(qa.app.capability, true);
  assert.equal(await qa.app.callServerTool(request, options), reply);
  assert.equal(calls, 1);
});
test('discard is one shot, targets only exact native Confirm, and waits for real backend resolution', async () => {
  const { createDeliveryQa } = await load(); let resolveNative, calls = 0;
  const reply = {}; const sdk = { callServerTool: r => { calls++; return r.arguments.operation === 'confirm' ? new Promise(resolve => { resolveNative = resolve; }) : Promise.resolve(reply); } };
  const qa = createDeliveryQa(sdk, { enabled: true }); qa.armDiscardConfirm();
  assert.equal(await qa.app.callServerTool({ name: 'cardstack_record_edit_transition', arguments: { operation: 'review' } }), reply);
  let settled = false;
  const rejected = assert.rejects(qa.app.callServerTool(confirm()), { code: 'CARDSTACK_QA_REPLY_DISCARDED' }).then(() => { settled = true; });
  await tick(); assert.equal(settled, false); assert.equal(calls, 2);
  resolveNative(reply); await rejected;
  const next = qa.app.callServerTool(confirm()); resolveNative(reply);
  assert.equal(await next, reply); assert.equal(calls, 3);
});
test('all three supported Confirm families are exact; unrelated names never consume the arm', async () => {
  const { createDeliveryQa } = await load(); const reply = {};
  for (const name of ['cardstack_record_edit_transition', 'cardstack_opportunity_edit_transition', 'cardstack_record_flow_transition']) {
    const qa = createDeliveryQa({ callServerTool: async () => reply }, { enabled: true }); qa.armDiscardConfirm();
    assert.equal(await qa.app.callServerTool(confirm('unrelated')), reply);
    await assert.rejects(qa.app.callServerTool(confirm(name)), { code: 'CARDSTACK_QA_REPLY_DISCARDED' });
  }
});
test('holding a real page calls backend once and releases its exact unchanged response', async () => {
  const { createDeliveryQa } = await load(); const reply = { private: {} }; let calls = 0;
  const qa = createDeliveryQa({ callServerTool: async r => { assert.equal(r, page); calls++; return reply; } }, { enabled: true });
  qa.armHoldRelatedPage(); const delivery = qa.app.callServerTool(page);
  await tick(); assert.equal(qa.state().held, true); assert.equal(calls, 1);
  assert.equal(qa.release(), true); assert.equal(await delivery, reply);
  assert.equal(qa.release(), false); assert.equal(qa.state().held, false);
});
test('reset rejects held response and clears arms without adopting or exposing it', async () => {
  const { createDeliveryQa } = await load(); const reply = { privateToken: 'secret' };
  const qa = createDeliveryQa({ callServerTool: async () => reply }, { enabled: true });
  qa.armHoldRelatedPage(); const failure = assert.rejects(qa.app.callServerTool(page), { code: 'CARDSTACK_QA_RESET' });
  await tick(); qa.reset(); await failure;
  assert.equal(qa.release(), false); assert.equal(JSON.stringify(qa.state()).includes('secret'), false);
  assert.deepEqual(Object.keys(qa.state()).sort(), ['discardArmed', 'enabled', 'held', 'holdArmed', 'waiting'].sort());
});
test('reset while native page is pending blocks its eventual stale delivery', async () => {
  const { createDeliveryQa } = await load(); let finish;
  const qa = createDeliveryQa({ callServerTool: () => new Promise(resolve => { finish = resolve; }) }, { enabled: true });
  qa.armHoldRelatedPage(); const failure = assert.rejects(qa.app.callServerTool(page), { code: 'CARDSTACK_QA_RESET' });
  qa.reset(); finish({}); await failure; assert.equal(qa.release(), false);
});
test('native rejection is preserved and interruption cannot manufacture a response', async () => {
  const { createDeliveryQa } = await load(); const nativeFailure = new Error('native failed');
  const qa = createDeliveryQa({ callServerTool: async () => { throw nativeFailure; } }, { enabled: true });
  qa.armDiscardConfirm(); await assert.rejects(qa.app.callServerTool(confirm()), error => error === nativeFailure);
  assert.equal(qa.state().discardArmed, false);
});
test('subscribers receive generic state only and dispose cancels hold then disables controls', async () => {
  const { createDeliveryQa } = await load(); const states = [], reply = {};
  const qa = createDeliveryQa({ callServerTool: async () => reply }, { enabled: true });
  const off = qa.subscribe(state => states.push(state)); qa.armHoldRelatedPage();
  const failure = assert.rejects(qa.app.callServerTool(page), { code: 'CARDSTACK_QA_RESET' });
  await tick(); qa.dispose(); await failure;
  assert.equal(qa.state().enabled, false); assert.equal(qa.armHoldRelatedPage(), false);
  assert.equal(await qa.app.callServerTool(page), reply); off();
  assert.equal(states.some(state => state.held), true);
  assert.equal(states.some(state => Object.values(state).some(value => typeof value !== 'boolean')), false);
});
test('held page leaves unrelated calls live and rejects a second hold arm until release', async () => {
  const { createDeliveryQa } = await load(); const pageReply = {}, otherReply = {};
  const qa = createDeliveryQa({ callServerTool: async r => r.name === page.name ? pageReply : otherReply }, { enabled: true });
  qa.armHoldRelatedPage(); const delivery = qa.app.callServerTool(page);
  assert.equal(qa.armHoldRelatedPage(), false);
  assert.equal(await qa.app.callServerTool({ name: 'cardstack_record_open', arguments: {} }), otherReply);
  await tick(); assert.equal(qa.armHoldRelatedPage(), false);
  qa.release(); assert.equal(await delivery, pageReply);
  assert.equal(qa.armHoldRelatedPage(), true); qa.reset();
});
test('reset and rearm isolate old pending result from the new hold', async () => {
  const { createDeliveryQa } = await load(); const resolvers = [];
  const qa = createDeliveryQa({ callServerTool: () => new Promise(resolve => resolvers.push(resolve)) }, { enabled: true });
  qa.armHoldRelatedPage(); const old = assert.rejects(qa.app.callServerTool(page), { code: 'CARDSTACK_QA_RESET' });
  qa.reset(); qa.armHoldRelatedPage(); const current = qa.app.callServerTool(page);
  resolvers[0]({ old: true }); await old; assert.equal(qa.state().waiting, true);
  const actual = {}; resolvers[1](actual); await tick(); qa.release();
  assert.equal(await current, actual);
});
test('native page failure clears pending state and observer failures cannot trigger a retry', async () => {
  const { createDeliveryQa } = await load(); const error = new Error('native'); let calls = 0;
  const qa = createDeliveryQa({ callServerTool: async () => { calls++; throw error; } }, { enabled: true });
  qa.subscribe(() => {}); let initial = true;
  qa.subscribe(() => { if (initial) initial = false; else throw new Error('observer'); });
  qa.armHoldRelatedPage(); await assert.rejects(qa.app.callServerTool(page), value => value === error);
  assert.equal(qa.state().waiting, false); assert.equal(qa.state().held, false); assert.equal(calls, 1);
  assert.equal(qa.armHoldRelatedPage(), true); qa.reset();
});
