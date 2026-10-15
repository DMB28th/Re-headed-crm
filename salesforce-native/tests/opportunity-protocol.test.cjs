"use strict";
// Offline source-contract checks only. Apex behavior runs in the native bundle;
// this file neither emulates Salesforce nor labels source inspection as native QA.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const classes = path.join(__dirname, "../force-app/main/default/classes");
const source = (name) => fs.readFileSync(path.join(classes, `${name}.cls`), "utf8");
const adapter = source("CardstackOpportunityMcpAdapter");
const dispatcher = source("CardstackMcpDispatcher");
const names = [
  "cardstack_opportunity_open",
  "cardstack_opportunity_edit_start",
  "cardstack_opportunity_edit_transition",
  "cardstack_opportunity_refresh",
];
function body(text, method) {
  const start = text.search(new RegExp(`\\b${method}\\s*\\([^)]*\\)\\s*\\{`));
  assert.notEqual(start, -1, `Missing method ${method}`);
  const first = text.indexOf("{", start);
  let depth = 1, quoted = false;
  for (let index = first + 1; index < text.length; index++) {
    if (text[index] === "'" && text[index - 1] !== "\\") quoted = !quoted;
    if (!quoted) {
      if (text[index] === "{") depth++;
      if (text[index] === "}" && --depth === 0) return text.slice(first + 1, index);
    }
  }
  assert.fail(`Unterminated method ${method}`);
}
test("registered product names form the exact approved surface with no model-save alias", () => {
  const found = [...adapter.matchAll(/'([a-z][a-z0-9_]*opportunity[a-z0-9_]*)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(found)].sort(), [...names].sort());
  assert.doesNotMatch(adapter, /'cardstack_opportunity_(?:save|confirm|update)'/);
  assert.match(adapter, /'visibility'\s*=>\s*new List<String>\s*\{\s*'model'\s*,\s*'app'\s*\}/);
  assert.match(adapter, /'visibility'\s*=>\s*new List<String>\s*\{\s*'app'\s*\}/);
});
test("wire byte guard precedes service dispatch and keeps the 16 KiB decoded UTF-8 boundary", () => {
  assert.match(adapter, /Blob\.valueOf\(JSON\.serialize\(args\)\)\.size\(\)/);
  assert.match(adapter, /(?:16384|16\s*\*\s*1024)/);
  assert.match(adapter, /'REQUEST_TOO_LARGE'/);
  assert.match(adapter, /keySet\(\)/, "Unknown keys must be checked on the decoded map, not dropped by DTO deserialization");
  assert.doesNotMatch(adapter, /JSON\.deserialize\([^;]*TransitionRequest\.class/,
    "Permissive DTO decoding cannot establish per-operation unknown-key/type rejection");
});
test("product serialization isolates the private envelope and preserves the distinct public contracts", () => {
  assert.match(adapter, /'opportunity-card\/v1'/);
  assert.match(adapter, /'opportunity-edit\/v1'/);
  assert.match(adapter, /'cardstack\/opportunityEdit'/);
  assert.doesNotMatch(adapter, /'structuredContent'\s*=>\s*(?:envelope|resultEnvelope)\b/,
    "The private Envelope itself must never become structuredContent");
  assert.doesNotMatch(adapter, /System\.debug\s*\(/, "No diagnostic logging of private input/result values");
});
test("resource contract binds exact native StaticResource identity, MIME, and empty external CSP", () => {
  for (const value of ["text/html;profile=mcp-app"])
    assert.ok(adapter.includes(`'${value}'`), `Missing exact resource contract value ${value}`);
  const registry = source("CardstackEditorUiResource");
  assert.ok(registry.includes("'ui://cardstack/opportunity-edit-v1'"));
  assert.ok(registry.includes("'CardstackOpportunityEditUi'"));
  for (const name of ["connectDomains", "resourceDomains", "frameDomains"])
    assert.match(adapter, new RegExp(`'${name}'\\s*=>\\s*new List<(?:Object|String)>\\s*\\(\\s*\\)`),
      `External ${name} must remain empty`);
  assert.match(adapter, /'openai\/widgetCSP'/, "Keep clients' CSP compatibility alias");
});
test("only governed service transitions may execute product mutations; refresh is an authoritative read", () => {
  assert.match(adapter, /CardstackOpportunityEditService\.start\s*\(/);
  assert.match(adapter, /CardstackOpportunityEditService\.transitionFromMcp\s*\(/);
  assert.match(adapter, /CardstackOpportunitySelector\.read\s*\(/);
  assert.doesNotMatch(adapter, /Cardstack(?:UpdateRecord|PreviewUpdate)Action\.(?:invoke|execute|preview)\s*\(/,
    "The MCP adapter must not reintroduce trial DML or legacy partial-field mutation");
  assert.doesNotMatch(adapter, /Database\.(?:insert|update|delete|upsert)\s*\(/,
    "The adapter serializes and dispatches; it does not own CRM/private DML");
});
test("dispatcher authenticates before exact product routing and unavailable resources produce RPC errors", () => {
  const handle = body(dispatcher, "handle");
  assert.ok(handle.indexOf("CardstackConnectionAccess.requireUser()") < handle.indexOf("return dispatch("));
  const call = body(dispatcher, "toolCall");
  for (const name of names) assert.ok(call.includes(`'${name}'.equals(name)`), `Exact route ${name}`);
  assert.match(call, /CardstackOpportunityMcpAdapter\.call\(client, name, args\)/);
  const dispatch = body(dispatcher, "dispatch");
  assert.match(dispatch, /productResource == null \? error\(id, -32603, 'Opportunity UI unavailable'\)/);
  assert.doesNotMatch(dispatch, /success\(id,\s*'<(?:!doctype|html)/i);
});
test("metadata for new Apex source and test remains API 67", () => {
  for (const name of ["CardstackOpportunityMcpAdapter", "CardstackOpportunityMcpAdapterTest", "CardstackEditorUiResource", "CardstackEditorUiResourceTest"]) {
    const metadata = fs.readFileSync(path.join(classes, `${name}.cls-meta.xml`), "utf8");
    assert.match(metadata, /<apiVersion>67\.0<\/apiVersion>/);
    assert.match(metadata, /<status>Active<\/status>/);
  }
});

test("editor discovery and reads use one native content-address implementation", () => {
  for (const name of ["CardstackOpportunityMcpAdapter", "CardstackRecordMcpAdapter"]) {
    const editor = source(name);
    assert.match(editor, /CardstackEditorUiResource/, "Editor must derive its URI from installed native bytes");
    assert.doesNotMatch(editor, /'resourceUri'\s*=>\s*URI/, "A mutable legacy URL cannot advertise the current build");
  }
  assert.doesNotMatch(body(dispatcher, "dispatch"), /'uri'\s*=>\s*'ui:\/\/cardstack\/(?:opportunity|record)-edit-v1\.html'/,
    "Discovery must not list mutable aliases as current content addresses");
});
