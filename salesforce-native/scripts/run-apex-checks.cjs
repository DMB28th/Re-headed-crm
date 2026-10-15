'use strict';
// Controller-only focused org test runner. No deployment, login, token or log APIs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const classes = ['CardstackConnectionSetupTest', 'CardstackConnectionContextTest'];
const methods = new Set(classes.flatMap(name => {
  const source = fs.readFileSync(path.join(__dirname, '../force-app/main/default/classes', `${name}.cls`), 'utf8');
  return [...source.matchAll(/@IsTest\s+static\s+void\s+(\w+)\s*\(/g)].map(match => `${name}.${match[1]}`);
}));
function validateArguments(args) {
  if (!args.includes('--controller-approved')) throw new Error('LIVE_AUTHORIZATION_REQUIRED');
  if (args.length !== 3 || args[0] !== '--controller-approved' || args[1] !== '--target-org' || args[2] !== 'cardstack-spike2') throw new Error('INVALID_TARGET');
  return {target: args[2]};
}
function validCount(value) { return Number.isInteger(value) && value >= 0 && value <= 10000; }
function sanitize(raw, processStatus) {
  const error = {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'};
  const summary = raw?.result?.summary;
  const results = raw?.result?.tests;
  if (processStatus !== 0 || raw?.status !== 0 || !summary || !Array.isArray(results) ||
      !['testsRan', 'passing', 'failing'].every(key => validCount(summary[key])) ||
      methods.size === 0 || summary.testsRan !== methods.size || results.length !== methods.size ||
      summary.passing + summary.failing !== summary.testsRan) return error;
  const observed = new Set();
  const failures = [];
  let passing = 0;
  for (const item of results) {
    const name = `${item?.ApexClass?.Name}.${item?.MethodName}`;
    if (!methods.has(name) || observed.has(name) || !['Pass', 'Fail'].includes(item?.Outcome)) return error;
    observed.add(name);
    if (item.Outcome === 'Pass') passing++;
    else failures.push(name);
  }
  if (passing !== summary.passing || failures.length !== summary.failing) return error;
  return {status: 'Completed', testsRan: results.length, passing, failing: failures.length, failures: failures.sort()};
}
function run(args) {
  const {target} = validateArguments(args);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cardstack-apex-checks-'));
  fs.chmodSync(directory, 0o700);
  try {
    const result = spawnSync('sf', ['apex', 'run', 'test', '--target-org', target, '--class-names', ...classes, '--result-format', 'json', '--wait', '10', '--api-version', '67.0'], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 660000,
      stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, SF_DISABLE_TELEMETRY: 'true'}
    });
    if (result.error || result.status !== 0 || !result.stdout) return {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'};
    const capture = path.join(directory, 'result.json');
    fs.writeFileSync(capture, result.stdout, {mode: 0o600});
    try { return sanitize(JSON.parse(fs.readFileSync(capture, 'utf8')), result.status); }
    catch { return {status: 'RunnerError', errorCode: 'APEX_RUNNER_FAILED'}; }
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
}
module.exports = {sanitize, validateArguments};
if (require.main === module) {
  let receipt;
  try { receipt = run(process.argv.slice(2)); }
  catch (error) { receipt = {status: 'RunnerError', errorCode: ['LIVE_AUTHORIZATION_REQUIRED', 'INVALID_TARGET'].includes(error.message) ? error.message : 'APEX_RUNNER_FAILED'}; }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.status === 'Completed' && receipt.failing === 0 ? 0 : 1;
}
