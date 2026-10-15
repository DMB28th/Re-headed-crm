const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const runnerPath = path.join(__dirname, '../scripts/run-apex-checks.cjs');
const fs = require('node:fs');
function completeResult() {
  const tests = ['CardstackConnectionSetupTest', 'CardstackConnectionContextTest'].flatMap(name => {
    const source = fs.readFileSync(path.join(__dirname, '../force-app/main/default/classes', `${name}.cls`), 'utf8');
    return [...source.matchAll(/@IsTest\s+static\s+void\s+(\w+)\s*\(/g)].map(match => ({Outcome: 'Pass', ApexClass: {Name: name}, MethodName: match[1]}));
  });
  return {status: 0, result: {summary: {testsRan: tests.length, passing: tests.length, failing: 0}, tests}};
}
test('runner emits bounded allowlisted failure names, never private CLI fields', () => {
  const {sanitize} = require(runnerPath);
  const raw = completeResult();
  const failed = raw.result.tests.find(item => item.MethodName === 'saveRejectsStaleRevision');
  Object.assign(failed, {Outcome: 'Fail', Message: 'private token', StackTrace: 'private actor'});
  raw.result.summary.passing--; raw.result.summary.failing++;
  raw.result.summary.testRunId = 'private-id';
  const result = sanitize(raw, 0);
  assert.deepEqual(result, {status: 'Completed', testsRan: raw.result.tests.length, passing: raw.result.tests.length - 1, failing: 1, failures: ['CardstackConnectionSetupTest.saveRejectsStaleRevision']});
  assert.doesNotMatch(JSON.stringify(result), /private|SensitiveUnknown|secret/);
});
test('runner refuses missing explicit live authorization', () => {
  const {validateArguments} = require(runnerPath);
  assert.throws(() => validateArguments([]), /LIVE_AUTHORIZATION_REQUIRED/);
});
test('runner refuses targets or classes outside bounded contract', () => {
  const {validateArguments} = require(runnerPath);
  assert.throws(() => validateArguments(['--controller-approved', '--target-org', '../secret']), /INVALID_TARGET/);
  assert.deepEqual(validateArguments(['--controller-approved', '--target-org', 'cardstack-spike2']), {target: 'cardstack-spike2'});
});
test('malformed CLI result produces only safe runner error', () => {
  const {sanitize} = require(runnerPath);
  assert.deepEqual(sanitize({status: 1, message: 'credential secret'}), {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'});
});
test('incomplete count fields cannot falsely report a passing run', () => {
  const {sanitize} = require(runnerPath);
  assert.deepEqual(sanitize({result: {summary: {testsRan: 'private'}, tests: []}}), {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'});
});
test('runner bounds execution to the controller reviewed org alias', () => {
  const {validateArguments} = require(runnerPath);
  assert.throws(() => validateArguments(['--controller-approved', '--target-org', 'production']), /INVALID_TARGET/);
});

for (const [name, corrupt] of [
  ['empty individual results', raw => {raw.result.tests = []; raw.result.summary = {testsRan: 1, passing: 1, failing: 0};}],
  ['partial reviewed scope', raw => {raw.result.tests.pop(); raw.result.summary.testsRan--; raw.result.summary.passing--;}],
  ['duplicate result replacing a required method', raw => {raw.result.tests[1] = {...raw.result.tests[0]};}],
  ['unknown result replacing a required method', raw => {raw.result.tests[0].MethodName = 'privateSecret';}],
  ['invalid individual outcome', raw => {raw.result.tests[0].Outcome = 'Skip';}],
  ['count and individual outcome mismatch', raw => {raw.result.tests[0].Outcome = 'Fail';}],
  ['nonzero CLI JSON status', raw => {raw.status = 1;}],
  ['missing CLI JSON status', raw => {delete raw.status;}]
]) {
  test(`runner rejects ${name}`, () => {
    const {sanitize} = require(runnerPath);
    const raw = completeResult(); corrupt(raw);
    assert.deepEqual(sanitize(raw, 0), {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'});
  });
}
test('runner rejects nonzero subprocess status despite complete passing JSON', () => {
  const {sanitize} = require(runnerPath);
  assert.deepEqual(sanitize(completeResult(), 1), {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'});
});
test('runner rejects absent subprocess completion status', () => {
  const {sanitize} = require(runnerPath);
  assert.deepEqual(sanitize(completeResult()), {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'});
});
test('complete passing reviewed scope produces passing counts', () => {
  const {sanitize} = require(runnerPath);
  const raw = completeResult();
  assert.deepEqual(sanitize(raw, 0), {status: 'Completed', testsRan: raw.result.tests.length, passing: raw.result.tests.length, failing: 0, failures: []});
});
test('permission metadata keeps repeated schema groups contiguous before description', () => {
  for (const name of ['Admin', 'User']) {
    const xml = fs.readFileSync(path.join(__dirname, '../force-app/main/default/permissionsets', `Cardstack_${name}.permissionset-meta.xml`), 'utf8');
    const description = xml.indexOf('<description>');
    const classGroups = [...xml.matchAll(/<classAccesses>[\s\S]*?<\/classAccesses>/g)];
    const customGroups = [...xml.matchAll(/<customPermissions>[\s\S]*?<\/customPermissions>/g)];
    assert.ok(classGroups.every(group => group.index < description), `${name}: class access before description`);
    assert.ok(customGroups.every(group => group.index < description), `${name}: custom permissions before description`);
    assert.ok(classGroups.at(-1).index < customGroups[0].index, `${name}: class/custom permission groups ordered`);
    assert.equal(classGroups.filter(group => group[0].includes('<apexClass>CardstackConnectionSetup</apexClass>')).length, 1);
  }
});

test('runner requires all 28 reviewed methods including owned-set diagnostic', () => {
  const raw = completeResult();
  assert.equal(raw.result.tests.length, 28);
  assert.ok(raw.result.tests.some(item => item.MethodName === 'ownedPermissionSetEvaluatesNativeUserGate'));
  assert.deepEqual(require(runnerPath).sanitize(raw, 0), {status: 'Completed', testsRan: 28, passing: 28, failing: 0, failures: []});
});
