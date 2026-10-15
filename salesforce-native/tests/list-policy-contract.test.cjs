const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../force-app/main/default/classes');
const fixtureSource = fs.readFileSync(path.join(root, 'CardstackListExposurePolicyTest.cls'), 'utf8');
const fixture = JSON.parse(fixtureSource.match(/CONTRACT_JSON = '([^']+)'/)[1]);
test('published Apex fixture uses the exact editor policy contract', () => {
  assert.equal(fixture.version, 1);
  assert.equal(typeof fixture.allowAdHoc, 'boolean');
  assert.deepEqual(Object.keys(fixture.views[0]), ['viewId', 'enabled']);
  assert.match(fixture.views[0].viewId, /^[a-zA-Z0-9]{18}$/);
  assert.deepEqual(Object.keys(fixture.customLists[0]), ['key', 'enabled']);
  assert.equal(fixture.customLists[0].key, 'listview:Opportunity:approved_name');
});
test('policy implementation consumes the same fixture vocabulary', () => {
  const file = path.join(root, 'CardstackListExposurePolicy.cls');
  assert.ok(fs.existsSync(file), 'native policy implementation is missing');
  const source = fs.readFileSync(file, 'utf8');
  for (const key of ['version', 'allowAdHoc', 'views', 'customLists', 'viewId', 'key', 'enabled']) {
    assert.ok(source.includes(`'${key}'`), `Apex contract must consume ${key}`);
  }
});
