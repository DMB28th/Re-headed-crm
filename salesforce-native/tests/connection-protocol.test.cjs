"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs"),
  path = require("node:path");
const runner = require("../scripts/verify-mcp-connection.cjs");
const uri = "ui://cardstack/connection-diagnostic-v1.html";
const html = "<html>synthetic offline UI</html>",
  hash = createHash("sha256").update(html).digest("hex");
const scope = {
  controllerApproved: true,
  alias: "cardstack-spike2",
  client: "claude",
  resourceUrl:
    "https://diagnostic.my.salesforce-sites.com/cardstack/services/apexrest/cardstack/v1/claude/mcp",
  metadataUrl:
    "https://diagnostic.my.salesforce-sites.com/cardstack/services/apexrest/cardstack/v1/claude/metadata",
  issuer: "https://diagnostic.my.salesforce.com",
  orgId: "00D000000000001EAA",
};
function response(
  body,
  status = 200,
  headers = { "content-type": "application/json" },
) {
  return {
    status,
    headers,
    body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
  };
}
function resource() {
  return {
    jsonrpc: "2.0",
    id: 3,
    result: {
      contents: [
        {
          uri,
          mimeType: "text/html;profile=mcp-app",
          text: html,
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
          },
        },
      ],
    },
  };
}
function replies() {
  return {
    metadata: response({
      resource: scope.resourceUrl,
      authorization_servers: [scope.issuer],
    }),
    public401: response({ error: "authentication_required" }, 401, {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${scope.metadataUrl}", scope="api refresh_token"`,
    }),
    anonymousResource: response({ error: "authentication_required" }, 401),
    initialize: response({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: {
          name: "Cardstack connection diagnostics",
          version: "1.0.0",
        },
        capabilities: {
          tools: {},
          resources: {},
          extensions: { "io.modelcontextprotocol/ui": {} },
        },
      },
    }),
    notification: response("", 202),
    resource: response(resource()),
  };
}
async function run(overrides = {}, options = {}) {
  const seen = [];
  const result = await runner.runOfflineProtocol({
    scope,
    expectedHash: hash,
    verifyIdentity: async () => ({ orgId: scope.orgId, issuer: scope.issuer }),
    send: async (request) => {
      seen.push(request);
      return { ...replies(), ...overrides }[request.caseId];
    },
    ...options,
  });
  return { result, seen };
}
const stage = (r, name) => r.stages.find((s) => s.stage === name);
test("public401Pointer validates exact pinned metadata, not returned authority", async () => {
  const { result } = await run();
  assert.equal(stage(result, "public401").status, "Pass");
  const bad = await run({
    public401: response({}, 401, {
      "www-authenticate": 'Bearer resource_metadata="https://hostile.invalid"',
    }),
  });
  assert.equal(stage(bad.result, "public401").status, "Fail");
});
test("resourceMimeAndHash requires self-contained exact hash and empty CSP", async () => {
  const { result } = await run();
  assert.equal(stage(result, "resource").status, "Pass");
  for (const mutate of [
    (r) => (r.result.contents[0].mimeType = "text/html"),
    (r) => (r.result.contents[0].text += "x"),
    (r) =>
      (r.result.contents[0]._meta.ui.csp.connectDomains = [
        "https://elsewhere.invalid",
      ]),
  ]) {
    const r = resource();
    mutate(r);
    assert.equal(
      stage((await run({ resource: response(r) })).result, "resource").status,
      "Fail",
    );
  }
});
test("notifications require 202 and actually empty body", async () => {
  assert.equal(stage((await run()).result, "notification").status, "Pass");
  for (const body of ["null", " ", "{}"])
    assert.equal(
      stage(
        (await run({ notification: response(body, 202) })).result,
        "notification",
      ).status,
      "Fail",
    );
});
test("anonymousResourceDenied rejects any guest HTML response", async () => {
  assert.equal(stage((await run()).result, "anonymousResource").status, "Pass");
  assert.equal(
    stage(
      (await run({ anonymousResource: response(resource()) })).result,
      "anonymousResource",
    ).status,
    "Fail",
  );
});
test("bodyBounds stop streaming overflow without retaining response; time bounds abort stalled request", async () => {
  let yielded = 0;
  async function* chunks() {
    for (let i = 0; i < 8; i++) {
      yielded++;
      yield Buffer.alloc(65536);
    }
  }
  const r = await run({
    initialize: { status: 200, headers: {}, body: chunks() },
  });
  assert.equal(stage(r.result, "initialize").code, "BODY_LIMIT");
  assert.equal(yielded, 2);
  const stalled = await run(
    {},
    {
      timeoutMs: 5,
      send: (request) =>
        request.caseId === "metadata"
          ? new Promise(() => {})
          : Promise.resolve(replies()[request.caseId]),
    },
  );
  assert.equal(stage(stalled.result, "metadata").code, "TIMEOUT");
});
test("supportOutputContainsNoCredentials and all actual host gates remain Unknown", async () => {
  const { result } = await run(
    {},
    {
      send: async () => {
        throw Error(
          "Bearer private-token private-actor https://private.invalid",
        );
      },
    },
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-token|private-actor|private.invalid|00D|salesforce.com/,
  );
  for (const key of ["host", "iframe", "bridge", "diagnosticExchange"])
    assert.equal(stage(result, key).status, "Unknown");
  assert.equal(result.evidenceSource, "offline-injected");
});
test("scope and independently verified full org identity gate all requests", async () => {
  let calls = 0;
  await assert.rejects(
    run({}, { scope: { ...scope, controllerApproved: false } }),
    /SCOPE_REJECTED/,
  );
  const denied = await run(
    {},
    {
      verifyIdentity: async () => ({
        orgId: "00D000000000002EAA",
        issuer: scope.issuer,
      }),
      send: async () => {
        calls++;
        return response({});
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(stage(denied.result, "identity").status, "Fail");
  for (const field of ["resourceUrl", "metadataUrl", "issuer"])
    await assert.rejects(
      run(
        {},
        { scope: { ...scope, [field]: "https://evil.invalid/?token=private" } },
      ),
      /SCOPE_REJECTED/,
    );
});
test("only six fixed calls, exact URLs and no redirects; no diagnostic persistence", async () => {
  const { seen } = await run();
  assert.equal(seen.length, 6);
  assert.deepEqual(
    seen.map((r) => r.caseId),
    [
      "metadata",
      "public401",
      "anonymousResource",
      "initialize",
      "notification",
      "resource",
    ],
  );
  assert.ok(
    seen.every(
      (r) =>
        r.redirect === "error" &&
        [scope.resourceUrl, scope.metadataUrl].includes(r.url),
    ),
  );
  assert.ok(seen.every((r) => !r.body?.includes("tools/call")));
  assert.ok(seen.every((r) => !JSON.stringify(r.headers).includes("Bearer")));
});
test("provider redirects/HTML and unclassified HTTP failures remain Unknown", async () => {
  for (const reply of [
    response("", 302, { location: "https://private.invalid" }),
    response("<html>private-token</html>", 403, {
      "content-type": "text/html",
    }),
    response({ error: "provider denied" }, 503),
  ]) {
    const { result } = await run({ resource: reply });
    assert.equal(stage(result, "resource").status, "Unknown");
    assert.doesNotMatch(
      JSON.stringify(result),
      /private-token|private.invalid/,
    );
  }
});
test("CLI remains off by default and never accesses auth without controller approval", () => {
  const p = spawnSync(
    process.execPath,
    [path.join(__dirname, "../scripts/verify-mcp-connection.cjs")],
    { encoding: "utf8" },
  );
  assert.equal(p.status, 2);
  assert.equal(JSON.parse(p.stdout).code, "CONTROLLER_APPROVAL_REQUIRED");
  assert.equal(p.stderr, "");
});
test("built artifact is hash-bound self-contained script and private static resource", () => {
  const file = path.join(
    __dirname,
    "../force-app/main/default/staticresources/CardstackConnectionDiagnosticUi.resource",
  );
  const text = fs.readFileSync(file, "utf8");
  const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const digest = createHash("sha256").update(scripts[0][1]).digest("base64");
  assert.ok(text.includes("script-src 'sha256-" + digest + "'"));
  assert.doesNotMatch(text, /<(?:script|link|img|iframe)[^>]+(?:src|href)=/i);
  assert.ok(text.includes("connect-src 'none'"));
  const metadata = fs.readFileSync(file + "-meta.xml", "utf8");
  assert.match(metadata, /<cacheControl>Private<\/cacheControl>/);
});
const approvedScope = () => ({
  ...scope,
  actorId: "005000000000001AAA",
  identityUrl: scope.issuer + "/services/oauth2/userinfo",
  apiUrl: scope.issuer + "/services/data/v67.0/limits",
});
async function guarded(overrides = {}, options = {}) {
  let authReads = 0;
  const seen = [];
  const result = await runner.runApprovedProtocol({
    scope: approvedScope(),
    expectedHash: hash,
    loadManaged: async () => {
      authReads++;
      return {
        accessToken: "opaque-synthetic-managed",
        orgId: scope.orgId,
        instanceUrl: scope.issuer,
      };
    },
    send: async (r) => {
      seen.push(r);
      return {
        ...replies(),
        identityControl: response({
          organization_id: scope.orgId,
          user_id: "005000000000001AAA",
        }),
        apiControl: response({ DailyApiRequests: { Max: 100, Remaining: 99 } }),
        ...overrides,
      }[r.caseId];
    },
    ...options,
  });
  return { result, seen, authReads };
}
test("approved managed runner checks flags and all private pins before auth access", async () => {
  let reads = 0;
  for (const invalid of [
    { ...approvedScope(), controllerApproved: false },
    { ...approvedScope(), actorId: "005000000000001BAD" },
    { ...approvedScope(), identityUrl: "https://elsewhere.invalid" },
  ])
    await assert.rejects(
      guarded(
        {},
        {
          scope: invalid,
          loadManaged: () => {
            reads++;
          },
        },
      ),
      /SCOPE_REJECTED/,
    );
  assert.equal(reads, 0);
});
test("identity and API controls gate every Site bearer; tokens never appear in support output", async () => {
  for (const override of [
    {
      identityControl: response({
        organization_id: scope.orgId,
        user_id: "005000000000002AAA",
      }),
    },
    { identityControl: response({}, 403) },
    { apiControl: response({}, 401) },
    { apiControl: response({ arbitrary: "data" }) },
  ]) {
    const h = await guarded(override);
    assert.ok(h.seen.every((r) => !r.url.includes("salesforce-sites.com")));
    assert.equal(
      h.result.stages.find((s) => s.stage === "resource").status,
      "Unknown",
    );
    assert.doesNotMatch(
      JSON.stringify(h.result),
      /opaque-synthetic-managed|005|00D|salesforce/,
    );
  }
});
test("managed runner sends untouched opaque auth only to fixed control and approved Site URLs", async () => {
  const h = await guarded();
  assert.equal(h.seen.length, 8);
  assert.deepEqual(
    h.seen.slice(0, 2).map((r) => r.url),
    [approvedScope().identityUrl, approvedScope().apiUrl],
  );
  for (const r of h.seen) {
    assert.equal(r.redirect, "error");
    assert.equal(
      r.headers.Authorization,
      r.auth === "named" ? "Bearer opaque-synthetic-managed" : undefined,
    );
  }
  assert.equal(stage(h.result, "identity").status, "Pass");
  assert.equal(stage(h.result, "apiAuthorization").status, "Pass");
  for (const s of ["host", "iframe", "bridge", "mcpAudienceBinding"])
    assert.equal(stage(h.result, s).status, "Unknown");
});
test("metadata mismatch, provider redirect, managed origin mismatch never forward Site bearer", async () => {
  for (const overrides of [
    {
      metadata: response({
        resource: "https://hostile.invalid",
        authorization_servers: [scope.issuer],
      }),
    },
    { identityControl: response("", 302, { location: scope.resourceUrl }) },
  ]) {
    const h = await guarded(overrides);
    assert.ok(
      h.seen
        .filter((r) => r.url.includes("salesforce-sites.com"))
        .every((r) => r.auth === "anonymous"),
    );
  }
  const wrong = await guarded(
    {},
    {
      loadManaged: async () => ({
        accessToken: "opaque-private",
        orgId: scope.orgId,
        instanceUrl: "https://elsewhere.invalid",
      }),
    },
  );
  assert.equal(wrong.seen.length, 0);
});
test("managed alias resolution uses forward username accessor and existing AuthInfo without options", async () => {
  const got = [];
  const sdk = {
    StateAggregator: {
      getInstance: async () => ({
        aliases: {
          getUsername: (a) => (got.push(a), "synthetic@example.invalid"),
          get() {
            throw Error("reverse lookup forbidden");
          },
        },
      }),
    },
    AuthInfo: {
      create: async (options) => {
        got.push(options);
        return {
          getFields: (decrypt) => (
            got.push(decrypt),
            {
              accessToken: "opaque-managed",
              orgId: scope.orgId,
              instanceUrl: scope.issuer,
            }
          ),
        };
      },
    },
  };
  const auth = await runner.readManagedWithSdk("cardstack-spike2", sdk);
  assert.deepEqual(got, [
    "cardstack-spike2",
    { username: "synthetic@example.invalid" },
    true,
  ]);
  assert.equal(auth.accessToken, "opaque-managed");
});
test("provider JSON primitives and arrays are Unknown without crashing or copying body", async () => {
  for (const body of ["null", '"private-sentinel"', "[]", "false"]) {
    const h = await run({ metadata: response(body), resource: response(body) });
    assert.equal(stage(h.result, "metadata").status, "Unknown");
    assert.equal(stage(h.result, "resource").status, "Unknown");
    assert.doesNotMatch(JSON.stringify(h.result), /private-sentinel/);
  }
});
test("managed authentication and identity timeouts fail closed before Site calls", async () => {
  const slow = await guarded(
    {},
    { timeoutMs: 5, loadManaged: () => new Promise(() => {}) },
  );
  assert.equal(slow.seen.length, 0);
  assert.equal(stage(slow.result, "identity").status, "Unknown");
  let aborted = false;
  const identity = await guarded(
    {},
    {
      timeoutMs: 5,
      send: (r) => {
        r.signal.addEventListener("abort", () => (aborted = true));
        return new Promise(() => {});
      },
    },
  );
  assert.equal(aborted, true);
  assert.equal(stage(identity.result, "identity").code, "TIMEOUT");
});
test("builder rejects a different SDK before bundling or overwriting the resource", () => {
  const os = require("node:os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cardstack-sdk-pin-"));
  const packageDir = path.join(
    root,
    "node_modules/@modelcontextprotocol/ext-apps",
  );
  fs.mkdirSync(path.join(packageDir, "dist/src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    JSON.stringify({
      name: "@modelcontextprotocol/ext-apps",
      version: "2.0.0",
      main: "dist/src/app.js",
    }),
  );
  fs.writeFileSync(path.join(packageDir, "dist/src/app.js"), "");
  const resourcePath = path.join(
      __dirname,
      "../force-app/main/default/staticresources/CardstackConnectionDiagnosticUi.resource",
    ),
    before = fs.readFileSync(resourcePath);
  try {
    const p = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "../scripts/build-connection-ui.mjs"),
        "--dependencies",
        path.join(root, "node_modules"),
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(p.status, 0);
    assert.match(p.stderr, /SDK_1_7_4_REQUIRED/);
    assert.deepEqual(fs.readFileSync(resourcePath), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("approved enhanced-domain sandbox host remains pinned without accepting another domain", async () => {
  const pins = {
    ...approvedScope(),
    resourceUrl: scope.resourceUrl.replace(
      "diagnostic.my.",
      "diagnostic--qa.sandbox.my.",
    ),
    metadataUrl: scope.metadataUrl.replace(
      "diagnostic.my.",
      "diagnostic--qa.sandbox.my.",
    ),
    issuer: "https://diagnostic--qa.sandbox.my.salesforce.com",
  };
  pins.identityUrl = pins.issuer + "/services/oauth2/userinfo";
  pins.apiUrl = pins.issuer + "/services/data/v67.0/limits";
  let reads = 0;
  const result = await runner.runApprovedProtocol({
    scope: pins,
    expectedHash: hash,
    loadManaged: async () => {
      reads++;
      throw Error("no test auth");
    },
    send: () => {
      throw Error("must not send");
    },
  });
  assert.equal(reads, 1);
  assert.equal(stage(result, "identity").status, "Unknown");
});
test("injected transport cannot label synthetic responses as live evidence", async () => {
  const h = await guarded({}, { liveExecution: true });
  assert.equal(h.result.liveExecution, false);
  assert.equal(h.result.evidenceSource, "offline-injected");
  assert.equal(h.result.resourceSha256, hash);
  assert.equal(h.result.evidenceRevision, "connection-protocol/v1");
  assert.ok(
    h.result.stages.every((s) => Number.isFinite(Date.parse(s.checkedAt))),
  );
});
test("product ingress preserves diagnostic metadata, named-user gate and private result channel", () => {
  const source = fs.readFileSync(path.join(__dirname,
    "../force-app/main/default/classes/CardstackMcpDispatcher.cls"), "utf8");
  assert.ok(source.includes("'name'=>'Cardstack connection diagnostics','version'=>'1.0.0'"));
  assert.ok(source.includes("private static final String RESOURCE_URI = 'ui://cardstack/connection-diagnostic-v1.html'"));
  assert.ok(source.includes("private static final String OPEN_TOOL = 'cardstack_connection_diagnostic'"));
  assert.ok(source.includes("private static final String ECHO_TOOL = 'cardstack_connection_echo'"));
  const handle = source.slice(source.indexOf("public static Map<String,Object> handle"), source.indexOf("private static Map<String,Object> dispatch"));
  assert.ok(handle.indexOf("CardstackConnectionAccess.requireUser()") < handle.indexOf("return dispatch("));
  assert.ok(source.includes("result.put('_meta', new Map<String,Object>{'cardstack/connectionDiagnostic'=>attempt})"));
  assert.doesNotMatch(source, /'structuredContent'\s*=>\s*attempt\b/);
  assert.ok(source.includes("tool(OPEN_TOOL, 'Open a synthetic connection exchange; actual host readiness requires separate evidence.'"));
  assert.ok(source.includes("tool(ECHO_TOOL, 'Submit the exact synthetic fixture from the app. This is not host attestation.'"));
});
