'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'force-app/main/default/staticresources');
const rows = [
 ['3daad61','Record','a2a99a80ee382b9922804f720e2e7c9dd1c18cdba95988c4eea2a430e4f4d075'],
 ['3daad61','Opportunity','c24749508bbe8ff9163e328b84916bfaed2e1fb9e36b2315f1fda86e64e8455f'],
 ['5275b7e','Record','5552323110417f4e8d870affa2030ce04a4b7c82e805abcca82cfdcdd28c3b56'],
 ['5275b7e','Opportunity','e2b9d0699964d727fd6c0b113cce7f61c03062dd7ac19d96bc7eef1f175767eb'],
];
for(const [revision,family,digest] of rows) {
 test(`${family} ${revision} archive retains qualified digest and private caching`, () => {
  const name = `Cardstack${family}Ui${revision}`;
  assert.ok(fs.existsSync(path.join(resources, `${name}.resource`)), 'Qualified immutable archive must exist');
  const bytes = fs.readFileSync(path.join(resources, `${name}.resource`));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),digest);
  const metadata = fs.readFileSync(path.join(resources,`${name}.resource-meta.xml`),'utf8');
  assert.match(metadata,/<cacheControl>Private<\/cacheControl>/);
  assert.match(metadata,/<contentType>text\/html<\/contentType>/);
 });
}
