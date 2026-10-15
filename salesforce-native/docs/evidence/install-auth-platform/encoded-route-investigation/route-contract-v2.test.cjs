'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {CASES, evaluateCase} = require('./route-contract-v2.cjs');

// Literal expectations catch a swapped path/category or a relaxed separator criterion.
const expectedCases = [
  {id: 'claude.plain', client: 'claude', category: 'canonical', path: '/services/apexrest/cardstack/v1/claude/mcp', method: 'GET', auth: 'named', expectedStatus: 405, expectedError: 'method_not_allowed'},
  {id: 'claude.encoded-letter', client: 'claude', category: 'unreserved-letter', path: '/services/apexrest/cardstack/v1/claude/%6dcp', method: 'GET', auth: 'named', expectedStatus: 405, expectedError: 'method_not_allowed'},
  {id: 'claude.encoded-letter-upper', client: 'claude', category: 'unreserved-letter', path: '/services/apexrest/cardstack/v1/claude/%6Dcp', method: 'GET', auth: 'named', expectedStatus: 405, expectedError: 'method_not_allowed'},
  {id: 'claude.encoded-separator', client: 'claude', category: 'reserved-separator', path: '/services/apexrest/cardstack/v1/claude%2fmcp', method: 'GET', auth: 'named', expectedStatus: 404, expectedError: 'unknown_probe_route'},
  {id: 'claude.encoded-separator-upper', client: 'claude', category: 'reserved-separator', path: '/services/apexrest/cardstack/v1/claude%2Fmcp', method: 'GET', auth: 'named', expectedStatus: 404, expectedError: 'unknown_probe_route'},
  {id: 'chatgpt.plain', client: 'chatgpt', category: 'canonical', path: '/services/apexrest/cardstack/v1/chatgpt/mcp', method: 'GET', auth: 'named', expectedStatus: 405, expectedError: 'method_not_allowed'},
  {id: 'chatgpt.encoded-letter', client: 'chatgpt', category: 'unreserved-letter', path: '/services/apexrest/cardstack/v1/chatgpt/%6dcp', method: 'GET', auth: 'named', expectedStatus: 405, expectedError: 'method_not_allowed'},
  {id: 'chatgpt.encoded-letter-upper', client: 'chatgpt', category: 'unreserved-letter', path: '/services/apexrest/cardstack/v1/chatgpt/%6Dcp', method: 'GET', auth: 'named', expectedStatus: 405, expectedError: 'method_not_allowed'},
  {id: 'chatgpt.encoded-separator', client: 'chatgpt', category: 'reserved-separator', path: '/services/apexrest/cardstack/v1/chatgpt%2fmcp', method: 'GET', auth: 'named', expectedStatus: 404, expectedError: 'unknown_probe_route'},
  {id: 'chatgpt.encoded-separator-upper', client: 'chatgpt', category: 'reserved-separator', path: '/services/apexrest/cardstack/v1/chatgpt%2Fmcp', method: 'GET', auth: 'named', expectedStatus: 404, expectedError: 'unknown_probe_route'},
];
const methodDenied = {status: 405, headers: {'content-type': 'application/json'}, body: '{"error":"method_not_allowed"}'};
const routeDenied = {status: 404, headers: {'content-type': 'application/json'}, body: '{"error":"unknown_probe_route"}'};

test('encoded letters pass the exact method denial; separators visibly fail it', () => {
  for (const client of ['claude', 'chatgpt']) {
    for (const suffix of ['plain', 'encoded-letter', 'encoded-letter-upper']) {
      assert.equal(evaluateCase(client + '.' + suffix, methodDenied).status, 'Pass');
    }
    for (const suffix of ['encoded-separator', 'encoded-separator-upper']) {
      assert.deepEqual(evaluateCase(client + '.' + suffix, methodDenied), {
        contractVersion: 2, id: client + '.' + suffix, client, category: 'reserved-separator', status: 'Fail', code: 'CONTRACT_MISMATCH',
      });
    }
  }
});

test('all fixed cases classify exact independently specified responses', () => {
  assert.deepEqual(CASES, expectedCases);
  for (const entry of expectedCases) {
    const response = entry.category === 'reserved-separator' ? routeDenied : methodDenied;
    assert.deepEqual(evaluateCase(entry.id, response), {
      contractVersion: 2, id: entry.id, client: entry.client, category: entry.category, status: 'Pass', code: 'CONTRACT_MATCH',
    });
  }
});

test('fixture errors with wrong status, wrong known error, extra keys or non-JSON content type fail', () => {
  for (const entry of expectedCases) {
    const exact = entry.category === 'reserved-separator' ? routeDenied : methodDenied;
    const wrong = entry.category === 'reserved-separator' ? methodDenied : routeDenied;
    for (const response of [
      {...exact, status: 200}, {...exact, body: wrong.body},
      {...exact, body: exact.body.slice(0, -1) + ',"extra":"provider-sentinel"}'},
      {...exact, headers: {'content-type': 'text/plain'}}, {...exact, headers: {}},
      {...exact, headers: {'content-type': 'application/jsonp'}},
      {...exact, headers: {'content-type': 'application/json\r\nprovider-sentinel'}},
      ...['authentication_required', 'cardstack_use_required', 'public_context_unavailable'].map(error => ({...exact, body: JSON.stringify({error})})),
    ]) {
      assert.equal(evaluateCase(entry.id, response).status, 'Fail', entry.id);
      assert.equal(evaluateCase(entry.id, response).code, 'CONTRACT_MISMATCH');
    }
  }
});

test('JSON media type accepts case and optional parameters without relaxing exact fixture JSON', () => {
  for (const entry of expectedCases) {
    const response = entry.category === 'reserved-separator' ? routeDenied : methodDenied;
    for (const contentType of ['APPLICATION/JSON', 'application/json; charset=UTF-8', 'Application/Json; Charset="utf-8"']) {
      assert.equal(evaluateCase(entry.id, {...response, headers: {'content-type': contentType}}).status, 'Pass');
    }
  }
});

test('provider HTML, denial JSON, nonfixture JSON and malformed raw bodies stay Unknown', () => {
  for (const entry of expectedCases) {
    for (const response of [
      {status: 403, headers: {'content-type': 'text/html'}, body: '<html>provider-sentinel</html>'},
      {status: 404, headers: {'content-type': 'application/json'}, body: '{"error":"provider-sentinel"}'},
      {...methodDenied, body: '{"message":"provider-sentinel"}'},
      ...['{', '', 'null', '[]', '"method_not_allowed"', '{"error":{}}', '{"error":405}'].map(body => ({...methodDenied, body})),
      {...methodDenied, body: {error: 'method_not_allowed'}}, {...methodDenied, body: undefined},
    ]) {
      const result = evaluateCase(entry.id, response);
      assert.equal(result.status, 'Unknown', entry.id);
      assert.equal(result.code, 'RESPONSE_UNCLASSIFIED');
      assert.equal(JSON.stringify(result).includes('provider-sentinel'), false);
    }
  }
});

test('missing, coerced, noninteger and out-of-range HTTP status cannot become fixture proof', () => {
  for (const entry of expectedCases) {
    for (const status of [undefined, null, '405', 405.5, NaN, Infinity, 99, 600, {}, true]) {
      assert.equal(evaluateCase(entry.id, {...methodDenied, status}).status, 'Unknown');
      assert.equal(evaluateCase(entry.id, {...methodDenied, status}).code, 'INVALID_RESPONSE_STATUS');
    }
    for (const response of [undefined, null, {}]) {
      assert.equal(evaluateCase(entry.id, response).code, 'INVALID_RESPONSE_STATUS');
    }
  }
});

test('unsupported IDs reject with a fixed safe error and do not echo input', () => {
  for (const id of ['claude.negative-encoded', 'provider-sentinel', '/services/apexrest/cardstack/v1/claude/mcp', '__proto__', undefined, null, {}, 1]) {
    assert.throws(() => evaluateCase(id, methodDenied), {name: 'Error', message: 'UNSUPPORTED_ROUTE_CASE'});
  }
});

test('caller mutations cannot change the matrix, exported evaluator or subsequent results', () => {
  const moduleApi = require('./route-contract-v2.cjs');
  assert.throws(() => CASES.push(expectedCases[0]), TypeError);
  assert.throws(() => { CASES[0] = expectedCases[3]; }, TypeError);
  for (const entry of CASES) {
    assert.throws(() => { entry.expectedStatus = 200; }, TypeError);
    assert.throws(() => { entry.category = 'provider-sentinel'; }, TypeError);
    const clone = {...entry, expectedStatus: 200};
    assert.equal(evaluateCase(clone.id, {status: 200, headers: {'content-type': 'application/json'}, body: JSON.stringify({error: entry.expectedError})}).status, 'Fail');
  }
  assert.throws(() => { moduleApi.evaluateCase = () => ({status: 'Pass'}); }, TypeError);
  const result = evaluateCase('claude.encoded-separator', methodDenied);
  assert.throws(() => { result.status = 'Pass'; }, TypeError);
  assert.equal(evaluateCase('claude.encoded-separator', methodDenied).status, 'Fail');
});

test('safe output allowlist excludes injected headers, bodies, URLs and provider claims', () => {
  const response = {...methodDenied, provider: 'provider-sentinel', liveExecution: true, url: 'https://provider-sentinel.invalid', headers: {...methodDenied.headers, private: 'provider-sentinel'}};
  for (const entry of expectedCases) {
    const result = evaluateCase(entry.id, response);
    assert.deepEqual(Object.keys(result).sort(), ['category', 'client', 'code', 'contractVersion', 'id', 'status']);
    assert.equal(JSON.stringify(result).includes('provider-sentinel'), false);
    assert.equal(JSON.stringify(result).includes('method_not_allowed'), false);
  }
});

test('throwing response accessors remain Unknown without exposing exception text', () => {
  const response = {status: 405, get body() { throw new Error('provider-sentinel'); }};
  const result = evaluateCase('claude.encoded-letter', response);
  assert.equal(result.status, 'Unknown');
  assert.equal(result.code, 'RESPONSE_UNCLASSIFIED');
  assert.equal(JSON.stringify(result).includes('provider-sentinel'), false);
});

test('import has no IO dependencies or entry-point execution', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const sandbox = {module: {exports: {}}, require() { assert.fail('Unexpected import dependency'); }};
  vm.runInNewContext(fs.readFileSync(__dirname + '/route-contract-v2.cjs', 'utf8'), sandbox);
  assert.equal(typeof sandbox.module.exports.evaluateCase, 'function');
});

test('original v1 invalid-route still fails 405 while v2 encoded-letter passes it', () => {
  const {validateObservation} = require('../canonical-disposable/contract.cjs');
  for (const client of ['claude', 'chatgpt']) {
    const original = validateObservation({stage: 'invalid-route', response: {status: 405, body: {error: 'method_not_allowed'}}}, {
      client, prefix: '/probe', base: 'https://synthetic-route.invalid/probe', issuer: 'https://synthetic-issuer.invalid', htmlHash: 'a'.repeat(64),
    });
    assert.equal(original.status, 'Fail');
    assert.equal(evaluateCase(client + '.encoded-letter', methodDenied).status, 'Pass');
  }
});
