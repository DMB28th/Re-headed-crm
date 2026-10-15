'use strict';
// Source-only investigation: the installed HTTP stack ends at a network-disabled
// MockAgent, never Salesforce ingress. No Org/Connection or credential IO.
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = '/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/';
const sdk = {
  HttpApi: require(lib + 'lib/http-api').HttpApi,
  request: require(lib + 'lib/request').default,
  StreamPromise: require(lib + 'lib/util/promise').StreamPromise,
  getLogger: require(lib + 'lib/util/logger').getLogger,
};
const undici = require(lib + 'node_modules/undici');
const {createBoundedTransport, ROOT, PREFIX} = require('../canonical-disposable/controller/protocol-transport.cjs');
const {createMeasurement, aggregateReceipts} = require('../canonical-disposable/controller/protocol.cjs');
const identity = {org: '00D000000000001EAA', actor: '005000000000001AAA'};
const siteId = '0DM000000000001GAA';
const siteBase = 'https://encoded-route.invalid' + PREFIX;
const issuer = 'https://synthetic-org.invalid';
const connection = {version: '67.0', accessToken: 'offline-synthetic-sentinel'};
const pins = {...identity, siteId, siteBase, issuer};
function proof() {
  return {
    identity: {...identity}, ownership: {...identity, siteId, verified: true},
    testGate: {...identity, exactSixtyTestsPassed: true},
    currentUse: {...identity, effective: true, permission: 'Cardstack_Use_Connections', hasActivationRequired: false},
    activeSite: {siteId, active: true, savedVerified: true}, siteBase, issuer,
  };
}
async function withOfflineDispatcher(run) {
  const previous = undici.getGlobalDispatcher();
  const mock = new undici.MockAgent();
  const loggers = ['fetch', 'request-helper', 'http-api'].map(name => sdk.getLogger(name));
  // Installed Logger exposes setLogLevel but no getter; capture its numeric
  // level for exact restoration rather than imposing NONE on the caller.
  const levels = loggers.map(logger => logger._logLevel);
  mock.disableNetConnect();
  undici.setGlobalDispatcher(mock);
  try {
    await run(mock);
    mock.assertNoPendingInterceptors();
  } finally {
    undici.setGlobalDispatcher(previous);
    loggers.forEach((logger, index) => logger.setLogLevel(levels[index]));
    await mock.close();
  }
}
function intercept(mock, client, leaf, status, body, seen) {
  const path = PREFIX + ROOT + client + '/' + leaf;
  mock.get('https://encoded-route.invalid').intercept({path, method: 'GET'}).reply(options => {
    // Assert what undici actually dispatched, beyond the transport's input URL.
    assert.equal(options.path, path);
    assert.equal(options.method, 'GET');
    seen.push(options.path);
    return {statusCode: status, data: JSON.stringify(body), responseOptions: {headers: {'content-type': 'application/json'}}};
  });
}
function measurement() {
  return createMeasurement({pins, connection, sdk, evidenceSource: 'offline-injected',
    verifyCurrent: async () => proof(), now: () => Date.parse('2026-10-10T12:00:00.000Z')});
}
test('installed HttpApi/request/StreamPromise preserve %6dcp and canonical paths for both clients', async () => {
  await withOfflineDispatcher(async mock => {
    const seen = [];
    const transport = createBoundedTransport({connection, sdk, siteBase, issuer});
    for (const client of ['claude', 'chatgpt']) {
      for (const leaf of ['%6dcp', 'mcp']) {
        intercept(mock, client, leaf, 200, {synthetic: true}, seen);
        const response = await transport.request({auth: 'named', method: 'GET', path: ROOT + client + '/' + leaf});
        assert.equal(response.status, 200);
        assert.deepEqual(JSON.parse(response.body), {synthetic: true});
      }
    }
    assert.deepEqual(seen, ['claude', 'chatgpt'].flatMap(client => ['%6dcp', 'mcp'].map(leaf => PREFIX + ROOT + client + '/' + leaf)));
  });
});
test('original fixed encoded cases Pass only for exact fixture404; canonical GET controls Pass fixture405', async () => {
  await withOfflineDispatcher(async mock => {
    const seen = [], ids = [];
    for (const client of ['claude', 'chatgpt']) {
      intercept(mock, client, '%6dcp', 404, {error: 'unknown_probe_route'}, seen);
      intercept(mock, client, 'mcp', 405, {error: 'method_not_allowed'}, seen);
      ids.push(client + '.negative-encoded', client + '.method-get');
    }
    const receipt = await measurement().runCases(ids);
    assert.equal(receipt.liveExecution, false);
    assert.deepEqual(receipt.cases.map(c => [c.id, c.status, c.code, c.attempts]), ids.map(id => [id, 'Pass', 'CONTRACT_MATCH', 1]));
    assert.equal(seen.length, 4);
  });
});
test('fixture405 fails encoded contract; aggregate Fail cannot reconstruct HTTP status/body', async () => {
  await withOfflineDispatcher(async mock => {
    const seen = [];
    async function responseReceipts(status, body) {
      const receipts = [];
      for (const client of ['claude', 'chatgpt']) {
        intercept(mock, client, '%6dcp', status, body, seen);
        receipts.push(await measurement().runCase(client + '.negative-encoded'));
      }
      return aggregateReceipts(receipts);
    }
    const deniedMethod = await responseReceipts(405, {error: 'method_not_allowed'});
    const deniedUse = await responseReceipts(403, {error: 'cardstack_use_required'});
    const extraField = await responseReceipts(404, {error: 'unknown_probe_route', extra: true});
    assert.deepEqual(deniedMethod, deniedUse);
    assert.deepEqual(deniedMethod, extraField);
    for (const c of deniedMethod.cases) {
      assert.equal(c.status, 'Fail');
      assert.equal(c.code, 'CONTRACT_MISMATCH');
      assert.equal(c.attempts, 1);
      assert.equal(Object.hasOwn(c, 'response'), false);
      assert.equal(Object.hasOwn(c, 'body'), false);
      assert.deepEqual(Object.keys(c).sort(), ['id', 'stage', 'status', 'code', 'source', 'startedAt', 'endedAt', 'attempts'].sort());
    }
    assert.equal(deniedMethod.complete, false);
    assert.equal(deniedMethod.allCasesPass, false);
    assert.equal(seen.length, 6);
  });
});
test('nonfixture provider JSON error remains Unknown for both fixed encoded cases', async () => {
  await withOfflineDispatcher(async mock => {
    const seen = [];
    for (const client of ['claude', 'chatgpt']) intercept(mock, client, '%6dcp', 404, {error: 'synthetic_provider_denial'}, seen);
    const receipt = await measurement().runCases(['claude.negative-encoded', 'chatgpt.negative-encoded']);
    assert.deepEqual(receipt.cases.map(c => [c.status, c.code, c.attempts]), [['Unknown', 'PROVIDER_DENIAL', 1], ['Unknown', 'PROVIDER_DENIAL', 1]]);
    assert.equal(seen.length, 2);
  });
});
