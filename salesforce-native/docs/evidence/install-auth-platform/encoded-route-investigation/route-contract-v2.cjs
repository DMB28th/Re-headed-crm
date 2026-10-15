'use strict';
// Pure prospective contract over fixed cases and injected raw responses.
// No transport, URL parsing/normalization, evidence IO, or execution on import.
const ROOT = '/services/apexrest/cardstack/v1/';
const CASES = Object.freeze(['claude', 'chatgpt'].flatMap(client => [
  ['plain', 'canonical', client + '/mcp', 405, 'method_not_allowed'],
  ['encoded-letter', 'unreserved-letter', client + '/%6dcp', 405, 'method_not_allowed'],
  ['encoded-letter-upper', 'unreserved-letter', client + '/%6Dcp', 405, 'method_not_allowed'],
  ['encoded-separator', 'reserved-separator', client + '%2fmcp', 404, 'unknown_probe_route'],
  ['encoded-separator-upper', 'reserved-separator', client + '%2Fmcp', 404, 'unknown_probe_route'],
].map(([suffix, category, path, expectedStatus, expectedError]) => Object.freeze({
  id: client + '.' + suffix, client, category, path: ROOT + path,
  method: 'GET', auth: 'named', expectedStatus, expectedError,
}))));
const FIXTURE_ERRORS = Object.freeze([
  'method_not_allowed', 'unknown_probe_route', 'authentication_required',
  'cardstack_use_required', 'public_context_unavailable',
]);

function evaluateCase(id, response) {
  const entry = CASES.find(candidate => candidate.id === id);
  if (!entry) throw new Error('UNSUPPORTED_ROUTE_CASE');
  const result = (status, code) => Object.freeze({
    contractVersion: 2, id: entry.id, client: entry.client, category: entry.category, status, code,
  });
  try {
    const status = response?.status;
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      return result('Unknown', 'INVALID_RESPONSE_STATUS');
    }
    const rawBody = response.body;
    if (typeof rawBody !== 'string') return result('Unknown', 'RESPONSE_UNCLASSIFIED');
    const body = JSON.parse(rawBody);
    if (body === null || typeof body !== 'object' || Array.isArray(body) || !FIXTURE_ERRORS.includes(body.error)) {
      return result('Unknown', 'RESPONSE_UNCLASSIFIED');
    }
    const contentType = response.headers?.['content-type'];
    const jsonContentType = typeof contentType === 'string' && /^application\/json(?:[ \t]*;[^\r\n]+)?$/i.test(contentType);
    const exact = jsonContentType && status === entry.expectedStatus &&
      Object.keys(body).length === 1 && Object.hasOwn(body, 'error') && body.error === entry.expectedError;
    return exact ? result('Pass', 'CONTRACT_MATCH') : result('Fail', 'CONTRACT_MISMATCH');
  } catch {
    // Malformed JSON or injected accessor failures never retain exception text.
    return result('Unknown', 'RESPONSE_UNCLASSIFIED');
  }
}

module.exports = Object.freeze({CASES, evaluateCase});
