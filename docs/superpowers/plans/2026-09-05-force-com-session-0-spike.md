# MCPforce Session 0 — Spike and Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a chat host can connect to an Apex REST MCP endpoint with manually entered client credentials and render a real widget, prove Apex can call its own org as the caller, and leave behind the SFDX project skeleton every later session builds in — ending in a written go/no-go.

**Architecture:** A root SFDX project (`force-app/` packaged, `unpackaged/` for test flows) with one `@RestResource` class speaking stateless JSON-RPC 2.0 over POST, a static tool registry holding one tool (`crm_ping`), four widget bundles copied into static resources by a sync script, and a packaged connected app hosts authenticate against. Nothing runs outside the org; the only Node pieces are the widget build and a fixture test that pins the MCP Apps `_meta` shapes to the shipped SDK.

**Tech Stack:** Salesforce DX (`sf` CLI 2.144+), Apex (API 62.0), Apex tests, pnpm + Vite (existing widget build), vitest, curl + jq for the smoke script.

## Global Constraints

- Spec: `docs/superpowers/specs/force-com/00-spike-and-foundation.md`; overview `docs/superpowers/specs/2026-09-05-force-com-rebuild-design.md`. Read both before starting.
- Nothing runs off-platform at runtime. No Node service, no database, no Named Credential in this session.
- The namespace is permanent and must be **name-neutral** (not `mcpforce`); the product name is a working name.
- `_meta` and MIME shapes come from `@modelcontextprotocol/ext-apps@1.7.4` in `node_modules`, never from memory (hard rule 7). Pinned values: `RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"`, `RESOURCE_URI_META_KEY = "ui/resourceUri"`, tool `_meta = { ui: { resourceUri }, "ui/resourceUri": resourceUri }`, resource `_meta = { ui: { prefersBorder: true } }`, protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`.
- Widget bundles never contain secrets or tenant data (hard rule 3); they are copied byte-for-byte from `packages/widgets/dist`.
- Never persist a CLI access token anywhere; the smoke script reads it into a shell variable only.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Salesforce facts measured on 2026-09-05 against the dev org: `/.well-known/openid-configuration` exists on the My Domain and advertises `registration_endpoint`; `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` are 404; an unauthenticated POST to `/services/apexrest/...` is a 401 with `www-authenticate: Token` and no `resource_metadata` pointer.

---

## File structure

| Path | Responsibility |
|---|---|
| `sfdx-project.json`, `config/project-scratch-def.json`, `.forceignore` | SFDX project definition (root) |
| `scripts/sf/org-create.sh`, `deploy.sh`, `test.sh`, `mcp-smoke.sh` | Thin wrappers so every session runs the same commands |
| `scripts/widgets-to-static-resources.mjs` | Copies `packages/widgets/dist/*.html` into static resources; `--check` mode for CI |
| `unpackaged/main/default/flows/*` | Test flows moved from `salesforce-metadata/` (deployed to scratch orgs, never packaged) |
| `force-app/test/fixtures/mcp-apps-meta.json` | Pinned MCP Apps shapes, shared by the vitest and the Apex tests |
| `packages/widgets/src/shared/mcp-apps-meta.test.ts` | Asserts the fixture equals the shipped SDK constants |
| `force-app/main/default/classes/McpEndpoint.cls` | `@RestResource` JSON-RPC envelope, dispatch, error shaping, 405 on GET |
| `force-app/main/default/classes/McpforceTool.cls` | Interface every tool implements |
| `force-app/main/default/classes/McpTools.cls` | Static registry, `tools/list`, `tools/call`, result helpers |
| `force-app/main/default/classes/McpPingTool.cls` | `crm_ping`: results-table payload for the running user + self-callout probe |
| `force-app/main/default/classes/McpResources.cls` | `resources/list`, `resources/read` from static resources |
| `force-app/main/default/classes/OrgApi.cls` | Callout to self with the caller's session, no Remote Site Setting |
| `force-app/main/default/classes/*Test.cls` | One test class per class above |
| `force-app/main/default/staticresources/mcpforce_*.resource(-meta.xml)` | The four widget bundles |
| `force-app/main/default/connectedApps/MCPforce.connectedApp-meta.xml` | Packaged connected app |
| `docs/superpowers/specs/force-com/00-result.md` | Per-host results, observations, go/no-go |

Every Apex class has a sibling `<Name>.cls-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

---

### Task 1: Dev Hub, namespace, and the SFDX project skeleton

Parts of this task are manual clicks in Salesforce Setup. Do them exactly as written and paste the outcomes into the result doc in Task 8.

**Files:**
- Create: `sfdx-project.json`, `config/project-scratch-def.json`, `.forceignore`
- Create: `scripts/sf/org-create.sh`, `scripts/sf/deploy.sh`, `scripts/sf/test.sh`
- Move: `salesforce-metadata/force-app/main/default/flows/*` → `unpackaged/main/default/flows/`
- Delete: `salesforce-metadata/` (everything else in it is the stock DX README and captured JSON that `packages/core/src/__fixtures__/test-screen-flow.json` already holds)

**Interfaces:**
- Produces: a default scratch org alias `mcpforce-dev`, a default Dev Hub alias `devhub`, and `sfdx-project.json` whose `namespace` later tasks read.

- [ ] **Step 1: Enable a Dev Hub (manual)**

Open the existing dev org: `sf org open -o screenflow-org`. In Setup, search "Dev Hub" → Enable Dev Hub. If the page does not exist in that org (some orgfarm editions hide it), sign up a fresh Developer Edition org at https://developer.salesforce.com/signup and enable Dev Hub there instead. Then:

```bash
sf org login web --alias devhub --set-default-dev-hub
```

Expected: browser login completes; `sf org list` shows `devhub` with the 🌳 marker.

- [ ] **Step 2: Register a name-neutral namespace (manual)**

Sign up a **separate** Developer Edition org (the namespace org; it cannot be the Dev Hub). In it: Setup → Package Manager → Namespace Settings → Register Namespace. Try `cstk`, then `rcrd`, then any 4–6 letter neutral string that is free. Write the chosen string down; it is permanent.

Then in the Dev Hub: Setup → Namespace Registries → Link Namespace → log in to the namespace org.

Expected: the Dev Hub's Namespace Registries list shows the namespace with status Active.

- [ ] **Step 3: Write the project files**

`sfdx-project.json` (replace `NAMESPACE` with the string from Step 2; leave `""` only if Step 2 is still pending, and come back):

```json
{
  "packageDirectories": [
    { "path": "force-app", "default": true },
    { "path": "unpackaged", "default": false }
  ],
  "name": "mcpforce",
  "namespace": "NAMESPACE",
  "sfdcLoginUrl": "https://login.salesforce.com",
  "sourceApiVersion": "62.0"
}
```

`config/project-scratch-def.json`:

```json
{
  "orgName": "MCPforce dev",
  "edition": "Developer",
  "features": []
}
```

`.forceignore`:

```
package.xml
**/jsconfig.json
**/.eslintrc.json
force-app/test/**
```

`scripts/sf/org-create.sh`:

```bash
#!/usr/bin/env bash
# Create (or recreate) the default scratch org for MCPforce development.
set -euo pipefail
cd "$(dirname "$0")/../.."
ALIAS="${1:-mcpforce-dev}"
sf org create scratch --definition-file config/project-scratch-def.json \
  --alias "$ALIAS" --set-default --duration-days 30 --wait 10
sf org display -o "$ALIAS"
```

`scripts/sf/deploy.sh`:

```bash
#!/usr/bin/env bash
# Deploy packaged source plus unpackaged test metadata to the target org.
set -euo pipefail
cd "$(dirname "$0")/../.."
ORG="${1:-mcpforce-dev}"
sf project deploy start --source-dir force-app -o "$ORG" --wait 10
sf project deploy start --source-dir unpackaged -o "$ORG" --wait 10
```

`scripts/sf/test.sh`:

```bash
#!/usr/bin/env bash
# Run every local Apex test with coverage.
set -euo pipefail
cd "$(dirname "$0")/../.."
ORG="${1:-mcpforce-dev}"
sf apex run test --test-level RunLocalTests --code-coverage \
  --result-format human --wait 10 -o "$ORG"
```

```bash
chmod +x scripts/sf/*.sh
mkdir -p unpackaged/main/default/flows
git mv salesforce-metadata/force-app/main/default/flows/* unpackaged/main/default/flows/
git rm -r -q salesforce-metadata
```

- [ ] **Step 4: Create the scratch org and deploy the test flows**

```bash
scripts/sf/org-create.sh
sf project deploy start --source-dir unpackaged -o mcpforce-dev --wait 10
```

Expected: org created; three flows deployed. If a flow fails on a missing custom field it references in the old dev org, add its filename to `.forceignore` and record the name in the Task 8 result doc under "Deferred to Session 7" — the flows are Session 7's concern, the skeleton is this session's.

- [ ] **Step 5: Commit**

```bash
git add sfdx-project.json config .forceignore scripts/sf unpackaged
git add -u
git commit -m "chore(sfdx): root DX project, scratch def, sf wrappers; move test flows to unpackaged/

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Pin the MCP Apps shapes to the shipped SDK

**Files:**
- Create: `force-app/test/fixtures/mcp-apps-meta.json`
- Create: `packages/widgets/src/shared/mcp-apps-meta.test.ts`
- Modify: `packages/widgets/package.json` (only if `@modelcontextprotocol/sdk` is not already a dependency)

**Interfaces:**
- Produces: the literal values Apex constants in Tasks 3 and 4 must equal: `mimeType`, `resourceUriMetaKey`, `toolMeta`, `resourceMeta`, `protocolVersions`.

- [ ] **Step 1: Write the failing test**

`packages/widgets/src/shared/mcp-apps-meta.test.ts`:

```ts
/**
 * The Apex runtime cannot import the SDK, so its _meta and MIME literals are
 * pinned in force-app/test/fixtures/mcp-apps-meta.json. This test fails the
 * moment an SDK upgrade changes a value, which is the signal to update Apex.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

const fixturePath = fileURLToPath(
  new URL("../../../../force-app/test/fixtures/mcp-apps-meta.json", import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  mimeType: string;
  resourceUriMetaKey: string;
  toolMeta: Record<string, unknown>;
  resourceMeta: Record<string, unknown>;
  protocolVersions: string[];
};

describe("mcp-apps-meta fixture", () => {
  it("pins the resource MIME type and meta key to the SDK", () => {
    expect(fixture.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(fixture.resourceUriMetaKey).toBe(RESOURCE_URI_META_KEY);
  });

  it("pins the tool _meta shape registerAppTool emits (both keys)", () => {
    const uri = "ui://mcpforce/results-table";
    expect(fixture.toolMeta).toEqual({ ui: { resourceUri: uri }, [RESOURCE_URI_META_KEY]: uri });
  });

  it("pins the resource _meta shape the server registers", () => {
    expect(fixture.resourceMeta).toEqual({ ui: { prefersBorder: true } });
  });

  it("lists protocol versions the SDK supports, latest first", () => {
    expect(fixture.protocolVersions[0]).toBe(LATEST_PROTOCOL_VERSION);
    for (const v of fixture.protocolVersions) expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(v);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @cardstack/widgets exec vitest run src/shared/mcp-apps-meta.test.ts
```

Expected: FAIL — `ENOENT ... mcp-apps-meta.json`. If instead it fails with "Cannot find module '@modelcontextprotocol/sdk/types.js'", run `pnpm --filter @cardstack/widgets add @modelcontextprotocol/sdk@1.29.0` and rerun.

- [ ] **Step 3: Write the fixture**

`force-app/test/fixtures/mcp-apps-meta.json`:

```json
{
  "source": "@modelcontextprotocol/ext-apps@1.7.4 + @modelcontextprotocol/sdk@1.29.0 — verified by packages/widgets/src/shared/mcp-apps-meta.test.ts; Apex asserts the same literals in McpEndpointTest.metaMatchesSdkFixture",
  "mimeType": "text/html;profile=mcp-app",
  "resourceUriMetaKey": "ui/resourceUri",
  "toolMeta": {
    "ui": { "resourceUri": "ui://mcpforce/results-table" },
    "ui/resourceUri": "ui://mcpforce/results-table"
  },
  "resourceMeta": { "ui": { "prefersBorder": true } },
  "protocolVersions": ["2025-11-25", "2025-06-18", "2025-03-26"]
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @cardstack/widgets exec vitest run src/shared/mcp-apps-meta.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add force-app/test/fixtures/mcp-apps-meta.json packages/widgets/src/shared/mcp-apps-meta.test.ts packages/widgets/package.json pnpm-lock.yaml
git commit -m "test(widgets): pin MCP Apps _meta and MIME shapes to the shipped SDK for the Apex port

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The JSON-RPC endpoint with one tool

**Files:**
- Create: `force-app/main/default/classes/McpEndpoint.cls` (+ meta)
- Create: `force-app/main/default/classes/McpforceTool.cls` (+ meta)
- Create: `force-app/main/default/classes/McpTools.cls` (+ meta)
- Create: `force-app/main/default/classes/McpPingTool.cls` (+ meta)
- Create: `force-app/main/default/classes/McpEndpointTest.cls`, `McpToolsTest.cls`, `McpPingToolTest.cls` (+ metas)

**Interfaces:**
- Produces: `McpEndpoint.doPost()` / `doGet()`; `McpEndpoint.dispatch(String method, Map<String,Object> params)`; `McpEndpoint.McpError(Integer code, String message)`; `McpforceTool { String name(); String title(); String description(); Map<String,Object> inputSchema(); String resourceUri(); Map<String,Object> call(Map<String,Object> args); }`; `McpTools.list()`, `McpTools.call(params)`, `McpTools.result(String text, Map<String,Object> structured)`, `McpTools.RESOURCE_URI_META_KEY`; `McpPingTool` structuredContent of kind `results-table`.
- Consumes: nothing yet. `resources/*` dispatch lines are added in Task 4; `McpPingTool` gains the self-callout in Task 5.

- [ ] **Step 1: Write the failing endpoint test**

`force-app/main/default/classes/McpEndpointTest.cls`:

```apex
@IsTest
private class McpEndpointTest {
    /** Posts one JSON-RPC body through the REST class and parses the reply. */
    private static Map<String, Object> post(String body) {
        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/mcp';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        McpEndpoint.doPost();
        Blob out = RestContext.response.responseBody;
        String text = out == null ? '' : out.toString();
        return String.isBlank(text) ? null : (Map<String, Object>) JSON.deserializeUntyped(text);
    }

    @IsTest
    static void initializeEchoesASupportedVersion() {
        Map<String, Object> reply = post('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}');
        Assert.areEqual(200, RestContext.response.statusCode);
        Assert.areEqual(1, reply.get('id'));
        Map<String, Object> result = (Map<String, Object>) reply.get('result');
        Assert.areEqual('2025-06-18', result.get('protocolVersion'));
        Map<String, Object> caps = (Map<String, Object>) result.get('capabilities');
        Assert.isTrue(caps.containsKey('tools'), 'declares tools');
        Assert.isTrue(caps.containsKey('resources'), 'declares resources');
        Map<String, Object> info = (Map<String, Object>) result.get('serverInfo');
        Assert.areEqual('MCPforce', info.get('name'));
    }

    @IsTest
    static void initializeFallsBackToLatestForUnknownVersion() {
        Map<String, Object> reply = post('{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"1999-01-01","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}');
        Map<String, Object> result = (Map<String, Object>) reply.get('result');
        Assert.areEqual('2025-11-25', result.get('protocolVersion'));
    }

    @IsTest
    static void notificationIs202WithEmptyBody() {
        Map<String, Object> reply = post('{"jsonrpc":"2.0","method":"notifications/initialized"}');
        Assert.areEqual(202, RestContext.response.statusCode);
        Assert.isNull(reply);
    }

    @IsTest
    static void pingReturnsEmptyResult() {
        Map<String, Object> reply = post('{"jsonrpc":"2.0","id":3,"method":"ping"}');
        Assert.areEqual(0, ((Map<String, Object>) reply.get('result')).size());
    }

    @IsTest
    static void unknownMethodIsMethodNotFound() {
        Map<String, Object> reply = post('{"jsonrpc":"2.0","id":4,"method":"nope/nothing"}');
        Assert.areEqual(200, RestContext.response.statusCode);
        Map<String, Object> err = (Map<String, Object>) reply.get('error');
        Assert.areEqual(-32601, err.get('code'));
    }

    @IsTest
    static void parseErrorIs400() {
        Map<String, Object> reply = post('{not json');
        Assert.areEqual(400, RestContext.response.statusCode);
        Assert.areEqual(-32700, ((Map<String, Object>) reply.get('error')).get('code'));
    }

    @IsTest
    static void batchArraysAreRejected() {
        Map<String, Object> reply = post('[{"jsonrpc":"2.0","id":1,"method":"ping"}]');
        Assert.areEqual(400, RestContext.response.statusCode);
        Assert.areEqual(-32600, ((Map<String, Object>) reply.get('error')).get('code'));
    }

    @IsTest
    static void getIs405() {
        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/mcp';
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();
        McpEndpoint.doGet();
        Assert.areEqual(405, RestContext.response.statusCode);
    }

    @IsTest
    static void responseIsJson() {
        post('{"jsonrpc":"2.0","id":5,"method":"ping"}');
        Assert.areEqual('application/json', RestContext.response.headers.get('Content-Type'));
    }

    /** Mirrors force-app/test/fixtures/mcp-apps-meta.json — keep both in step. */
    @IsTest
    static void metaMatchesSdkFixture() {
        Assert.areEqual('ui/resourceUri', McpTools.RESOURCE_URI_META_KEY);
        Assert.areEqual('2025-11-25', McpEndpoint.SUPPORTED_PROTOCOL_VERSIONS[0]);
        Assert.isTrue(McpEndpoint.SUPPORTED_PROTOCOL_VERSIONS.contains('2025-06-18'));
        Assert.isTrue(McpEndpoint.SUPPORTED_PROTOCOL_VERSIONS.contains('2025-03-26'));
    }
}
```

- [ ] **Step 2: Write the failing tools and ping tests**

`force-app/main/default/classes/McpToolsTest.cls`:

```apex
@IsTest
private class McpToolsTest {
    @IsTest
    static void listEmitsPingWithBothUiMetaKeys() {
        Map<String, Object> result = McpTools.list();
        List<Object> tools = (List<Object>) result.get('tools');
        Assert.areEqual(1, tools.size());
        Map<String, Object> ping = (Map<String, Object>) tools[0];
        Assert.areEqual('crm_ping', ping.get('name'));
        Map<String, Object> schema = (Map<String, Object>) ping.get('inputSchema');
        Assert.areEqual('object', schema.get('type'));
        Map<String, Object> meta = (Map<String, Object>) ping.get('_meta');
        Assert.areEqual('ui://mcpforce/results-table', meta.get('ui/resourceUri'));
        Map<String, Object> ui = (Map<String, Object>) meta.get('ui');
        Assert.areEqual('ui://mcpforce/results-table', ui.get('resourceUri'));
        Map<String, Object> ann = (Map<String, Object>) ping.get('annotations');
        Assert.areEqual(true, ann.get('readOnlyHint'));
    }

    @IsTest
    static void callRoutesByNameAndWrapsResult() {
        Test.setMock(HttpCalloutMock.class, new McpPingToolTest.OkMock());
        Map<String, Object> result = McpTools.call(new Map<String, Object>{
            'name' => 'crm_ping', 'arguments' => new Map<String, Object>()
        });
        Assert.areEqual(false, result.get('isError'));
        List<Object> content = (List<Object>) result.get('content');
        Assert.areEqual('text', ((Map<String, Object>) content[0]).get('type'));
        Map<String, Object> structured = (Map<String, Object>) result.get('structuredContent');
        Assert.areEqual('results-table', structured.get('kind'));
    }

    @IsTest
    static void unknownToolIsInvalidParams() {
        try {
            McpTools.call(new Map<String, Object>{ 'name' => 'crm_nope' });
            Assert.fail('expected McpError');
        } catch (McpEndpoint.McpError e) {
            Assert.areEqual(-32602, e.code);
        }
    }
}
```

`force-app/main/default/classes/McpPingToolTest.cls`:

```apex
@IsTest
public class McpPingToolTest {
    /** Public so McpToolsTest can reuse it. Stands in for the org's own Tooling API. */
    public class OkMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"size":1,"totalSize":1,"done":true,"records":[{"Id":"301000000000001AAA"}]}');
            return res;
        }
    }

    @IsTest
    static void payloadIsAResultsTableForTheRunningUser() {
        Test.setMock(HttpCalloutMock.class, new OkMock());
        Map<String, Object> result = new McpPingTool().call(new Map<String, Object>());
        Map<String, Object> payload = (Map<String, Object>) result.get('structuredContent');
        Assert.areEqual('results-table', payload.get('kind'));
        Assert.areEqual('User', payload.get('object'));
        Map<String, Object> listView = (Map<String, Object>) payload.get('listView');
        Assert.areEqual(new List<Object>{ 'Name', 'Username' }, (List<Object>) listView.get('columns'));
        Map<String, Object> page = (Map<String, Object>) payload.get('page');
        List<Object> rows = (List<Object>) page.get('rows');
        Assert.areEqual(1, rows.size());
        Map<String, Object> row = (Map<String, Object>) rows[0];
        Assert.areEqual(UserInfo.getUserId(), row.get('id'));
        Map<String, Object> fields = (Map<String, Object>) row.get('fields');
        Assert.areEqual(UserInfo.getName(), fields.get('Name'));
        Map<String, Object> meta = (Map<String, Object>) payload.get('meta');
        Assert.areEqual('string', ((Map<String, Object>) meta.get('Name')).get('type'));
        Map<String, Object> prov = (Map<String, Object>) payload.get('provenance');
        Assert.areEqual('salesforce', prov.get('crm'));
        Assert.areEqual(0, prov.get('layoutRevision'));
    }
}
```

- [ ] **Step 3: Deploy the tests alone to confirm they fail to compile**

```bash
sf project deploy start --source-dir force-app/main/default/classes -o mcpforce-dev --wait 10
```

Expected: deploy FAILS with `Invalid type: McpEndpoint` (and the others). That is the red step in Apex: the classes do not exist.

- [ ] **Step 4: Write the interface and the endpoint**

`force-app/main/default/classes/McpforceTool.cls`:

```apex
/**
 * One MCP tool. Implementations are registered in McpTools.REGISTRY.
 * call() returns the full CallToolResult map — use McpTools.result() to build it.
 */
public interface McpforceTool {
    String name();
    String title();
    String description();
    /** JSON Schema for the arguments, as a map. */
    Map<String, Object> inputSchema();
    /** ui:// resource the host renders for this tool's result, or null for no UI. */
    String resourceUri();
    Map<String, Object> call(Map<String, Object> args);
}
```

`force-app/main/default/classes/McpEndpoint.cls`:

```apex
/**
 * MCPforce MCP endpoint: stateless JSON-RPC 2.0 over POST at
 * /services/apexrest/<namespace>/mcp. No sessions, no SSE — GET is 405.
 * Runs as the calling user: the platform validated the bearer token before
 * this code ran, so there is no auth code here and every query is scoped.
 */
@RestResource(urlMapping='/mcp')
global with sharing class McpEndpoint {
    public static final String SERVER_NAME = 'MCPforce';
    public static final String SERVER_VERSION = '0.0.1';
    /** Latest first. Mirrors force-app/test/fixtures/mcp-apps-meta.json. */
    public static final List<String> SUPPORTED_PROTOCOL_VERSIONS =
        new List<String>{ '2025-11-25', '2025-06-18', '2025-03-26' };

    /** A JSON-RPC error with a code; anything else becomes -32603. */
    public class McpError extends Exception {
        public Integer code;
        public McpError(Integer code, String message) {
            this.code = code;
            this.setMessage(message);
        }
    }

    @HttpPost
    global static void doPost() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');

        Object parsed;
        try {
            String raw = req.requestBody == null ? '' : req.requestBody.toString();
            parsed = JSON.deserializeUntyped(raw);
        } catch (Exception e) {
            write(res, 400, errorEnvelope(null, -32700, 'Parse error: ' + e.getMessage()));
            return;
        }
        if (!(parsed instanceof Map<String, Object>)) {
            write(res, 400, errorEnvelope(null, -32600, 'Invalid Request: expected one JSON-RPC object (batches are not supported)'));
            return;
        }
        Map<String, Object> message = (Map<String, Object>) parsed;
        Object id = message.get('id');
        Object methodObj = message.get('method');
        if (!(methodObj instanceof String)) {
            write(res, 400, errorEnvelope(id, -32600, 'Invalid Request: missing method'));
            return;
        }
        String method = (String) methodObj;
        Map<String, Object> params = message.get('params') instanceof Map<String, Object>
            ? (Map<String, Object>) message.get('params')
            : new Map<String, Object>();

        // A notification has no id and gets no body.
        if (!message.containsKey('id')) {
            res.statusCode = 202;
            res.responseBody = Blob.valueOf('');
            return;
        }

        try {
            write(res, 200, resultEnvelope(id, dispatch(method, params)));
        } catch (McpError e) {
            write(res, 200, errorEnvelope(id, e.code, e.getMessage()));
        } catch (Exception e) {
            write(res, 200, errorEnvelope(id, -32603, e.getTypeName() + ': ' + e.getMessage()));
        }
    }

    @HttpGet
    global static void doGet() {
        RestResponse res = RestContext.response;
        res.statusCode = 405;
        res.addHeader('Allow', 'POST');
        res.responseBody = Blob.valueOf('');
    }

    public static Map<String, Object> dispatch(String method, Map<String, Object> params) {
        if (method == 'initialize') return initialize(params);
        if (method == 'ping') return new Map<String, Object>();
        if (method == 'tools/list') return McpTools.list();
        if (method == 'tools/call') return McpTools.call(params);
        throw new McpError(-32601, 'Method not found: ' + method);
    }

    private static Map<String, Object> initialize(Map<String, Object> params) {
        Object requested = params.get('protocolVersion');
        String version = requested instanceof String && SUPPORTED_PROTOCOL_VERSIONS.contains((String) requested)
            ? (String) requested
            : SUPPORTED_PROTOCOL_VERSIONS[0];
        return new Map<String, Object>{
            'protocolVersion' => version,
            'capabilities' => new Map<String, Object>{
                'tools' => new Map<String, Object>(),
                'resources' => new Map<String, Object>()
            },
            'serverInfo' => new Map<String, Object>{ 'name' => SERVER_NAME, 'version' => SERVER_VERSION }
        };
    }

    private static Map<String, Object> resultEnvelope(Object id, Map<String, Object> result) {
        return new Map<String, Object>{ 'jsonrpc' => '2.0', 'id' => id, 'result' => result };
    }

    private static Map<String, Object> errorEnvelope(Object id, Integer code, String message) {
        return new Map<String, Object>{
            'jsonrpc' => '2.0',
            'id' => id,
            'error' => new Map<String, Object>{ 'code' => code, 'message' => message }
        };
    }

    private static void write(RestResponse res, Integer status, Map<String, Object> body) {
        res.statusCode = status;
        res.responseBody = Blob.valueOf(JSON.serialize(body));
    }
}
```

- [ ] **Step 5: Write the registry and the ping tool**

`force-app/main/default/classes/McpTools.cls`:

```apex
/**
 * Static tool registry. tools/list and tools/call live here so McpEndpoint
 * stays a transport. Adding a tool = one class implementing McpforceTool +
 * one line in REGISTRY.
 */
public with sharing class McpTools {
    /** Legacy flat key registerAppTool also writes, beside _meta.ui.resourceUri. */
    public static final String RESOURCE_URI_META_KEY = 'ui/resourceUri';

    private static final List<McpforceTool> REGISTRY = new List<McpforceTool>{
        new McpPingTool()
    };

    public static Map<String, Object> list() {
        List<Object> tools = new List<Object>();
        for (McpforceTool tool : REGISTRY) {
            Map<String, Object> entry = new Map<String, Object>{
                'name' => tool.name(),
                'title' => tool.title(),
                'description' => tool.description(),
                'inputSchema' => tool.inputSchema(),
                'annotations' => new Map<String, Object>{ 'readOnlyHint' => true }
            };
            if (tool.resourceUri() != null) {
                entry.put('_meta', new Map<String, Object>{
                    'ui' => new Map<String, Object>{ 'resourceUri' => tool.resourceUri() },
                    RESOURCE_URI_META_KEY => tool.resourceUri()
                });
            }
            tools.add(entry);
        }
        return new Map<String, Object>{ 'tools' => tools };
    }

    public static Map<String, Object> call(Map<String, Object> params) {
        String name = (String) params.get('name');
        Map<String, Object> args = params.get('arguments') instanceof Map<String, Object>
            ? (Map<String, Object>) params.get('arguments')
            : new Map<String, Object>();
        for (McpforceTool tool : REGISTRY) {
            if (tool.name() == name) return tool.call(args);
        }
        throw new McpEndpoint.McpError(-32602, 'Unknown tool: ' + name);
    }

    /** Builds a CallToolResult with one text block and structuredContent. */
    public static Map<String, Object> result(String text, Map<String, Object> structured) {
        return new Map<String, Object>{
            'content' => new List<Object>{ new Map<String, Object>{ 'type' => 'text', 'text' => text } },
            'structuredContent' => structured,
            'isError' => false
        };
    }
}
```

`force-app/main/default/classes/McpPingTool.cls` (the self-callout line is added in Task 5; leave `selfCallout` out for now):

```apex
/**
 * crm_ping — the spike's only tool. Returns a results-table payload with
 * one row (the calling user) so the real results-table widget renders, and
 * reports whether the org can call itself (Task 5).
 */
public with sharing class McpPingTool implements McpforceTool {
    public static final String RESULTS_TABLE_URI = 'ui://mcpforce/results-table';

    public String name() { return 'crm_ping'; }
    public String title() { return 'Ping MCPforce'; }
    public String description() {
        return 'Confirms the MCPforce endpoint is reachable and renders the calling user in a results table.';
    }
    public Map<String, Object> inputSchema() {
        return new Map<String, Object>{ 'type' => 'object', 'properties' => new Map<String, Object>() };
    }
    public String resourceUri() { return RESULTS_TABLE_URI; }

    public Map<String, Object> call(Map<String, Object> args) {
        String orgName = [SELECT Name FROM Organization LIMIT 1].Name;
        Map<String, Object> payload = new Map<String, Object>{
            'kind' => 'results-table',
            'object' => 'User',
            'title' => 'MCPforce is alive in ' + orgName,
            'listView' => new Map<String, Object>{
                'columns' => new List<Object>{ 'Name', 'Username' },
                'rowActions' => new List<Object>()
            },
            'meta' => new Map<String, Object>{
                'Name' => fieldMeta('Name', 'Name', 'string'),
                'Username' => fieldMeta('Username', 'Username', 'email')
            },
            'page' => new Map<String, Object>{
                'rows' => new List<Object>{ new Map<String, Object>{
                    'id' => UserInfo.getUserId(),
                    'fields' => new Map<String, Object>{
                        'Name' => UserInfo.getName(),
                        'Username' => UserInfo.getUserName()
                    }
                } },
                'hasMore' => false,
                'total' => 1
            },
            'provenance' => new Map<String, Object>{
                'crm' => 'salesforce',
                'crmLabel' => 'Salesforce',
                'layoutRevision' => 0,
                'connectedUser' => UserInfo.getName(),
                'fetchedAt' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
            }
        };
        String text = 'MCPforce is alive in ' + orgName + ' as ' + UserInfo.getName() + '.';
        return McpTools.result(text, payload);
    }

    private static Map<String, Object> fieldMeta(String api, String label, String type) {
        return new Map<String, Object>{
            'api' => api, 'label' => label, 'type' => type, 'required' => false, 'readOnly' => true
        };
    }
}
```

- [ ] **Step 6: Deploy and run the three test classes**

```bash
sf project deploy start --source-dir force-app -o mcpforce-dev --wait 10
sf apex run test --class-names McpEndpointTest --class-names McpToolsTest --class-names McpPingToolTest --result-format human --wait 10 -o mcpforce-dev
```

Expected: deploy succeeds; every test passes (the mock in two tests is registered but unused until Task 5 adds the callout). If a test fails, fix the class, not the test.

- [ ] **Step 7: Commit**

```bash
git add force-app/main/default/classes
git commit -m "feat(apex): MCP JSON-RPC endpoint, tool registry, and crm_ping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Widgets as static resources and `resources/*`

**Files:**
- Create: `scripts/widgets-to-static-resources.mjs`
- Modify: `package.json` (root scripts)
- Create: `force-app/main/default/staticresources/mcpforce_record_card.resource` (+ `-meta.xml`), and the same for `mcpforce_results_table`, `mcpforce_home_card`, `mcpforce_flow_run`
- Create: `force-app/main/default/classes/McpResources.cls`, `McpResourcesTest.cls` (+ metas)
- Modify: `force-app/main/default/classes/McpEndpoint.cls` (two dispatch lines)

**Interfaces:**
- Produces: `McpResources.MIME_TYPE`, `McpResources.list()`, `McpResources.read(params)`, `McpResources.URIS` (uri → static resource name).
- Consumes: `McpEndpoint.McpError`, `McpEndpoint.dispatch`.

- [ ] **Step 1: Write the sync script**

`scripts/widgets-to-static-resources.mjs`:

```js
#!/usr/bin/env node
/**
 * Copies the built widget bundles (packages/widgets/dist/*.html) into
 * force-app static resources, byte for byte. `--check` exits 1 when the
 * committed resources are stale — CI runs it after a widget build.
 *
 * Static resource names must be alphanumeric/underscore: record-card →
 * mcpforce_record_card. The runtime maps ui://mcpforce/<name> to these.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL(".", import.meta.url).pathname, "..");
const src = join(root, "packages/widgets/dist");
const dst = join(root, "force-app/main/default/staticresources");
const check = process.argv.includes("--check");

const META = `<?xml version="1.0" encoding="UTF-8"?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Private</cacheControl>
    <contentType>text/html</contentType>
</StaticResource>
`;

if (!existsSync(src)) {
  console.error(`No widget build at ${src} — run: pnpm --filter @cardstack/widgets build`);
  process.exit(2);
}
mkdirSync(dst, { recursive: true });

let stale = 0;
for (const file of readdirSync(src).filter((f) => f.endsWith(".html"))) {
  const name = "mcpforce_" + file.replace(/\.html$/, "").replace(/-/g, "_");
  const built = readFileSync(join(src, file));
  const target = join(dst, `${name}.resource`);
  const current = existsSync(target) ? readFileSync(target) : null;
  const same = current !== null && current.equals(built);
  if (check) {
    if (!same) { stale++; console.error(`stale: ${name}.resource`); }
    continue;
  }
  writeFileSync(target, built);
  writeFileSync(join(dst, `${name}.resource-meta.xml`), META);
  console.log(`${same ? "unchanged" : "updated "} ${name}.resource (${built.length} bytes)`);
}
if (check && stale > 0) process.exit(1);
```

Add to root `package.json` scripts:

```json
"widgets:sync": "pnpm --filter @cardstack/widgets build && node scripts/widgets-to-static-resources.mjs",
"widgets:check": "pnpm --filter @cardstack/widgets build && node scripts/widgets-to-static-resources.mjs --check"
```

- [ ] **Step 2: Run the sync and confirm `--check` agrees**

```bash
pnpm widgets:sync
node scripts/widgets-to-static-resources.mjs --check && echo CHECK OK
ls -la force-app/main/default/staticresources
```

Expected: four `.resource` files of roughly 450–560 KB each with four `-meta.xml` siblings; `CHECK OK`.

- [ ] **Step 3: Write the failing resources test**

`force-app/main/default/classes/McpResourcesTest.cls`:

```apex
@IsTest
private class McpResourcesTest {
    @IsTest
    static void listsFourWidgetsWithMimeAndMeta() {
        Map<String, Object> result = McpResources.list();
        List<Object> resources = (List<Object>) result.get('resources');
        Assert.areEqual(4, resources.size());
        Set<String> uris = new Set<String>();
        for (Object r : resources) {
            Map<String, Object> entry = (Map<String, Object>) r;
            uris.add((String) entry.get('uri'));
            Assert.areEqual('text/html;profile=mcp-app', entry.get('mimeType'));
            Map<String, Object> ui = (Map<String, Object>) ((Map<String, Object>) entry.get('_meta')).get('ui');
            Assert.areEqual(true, ui.get('prefersBorder'));
        }
        Assert.isTrue(uris.contains('ui://mcpforce/record-card'));
        Assert.isTrue(uris.contains('ui://mcpforce/results-table'));
        Assert.isTrue(uris.contains('ui://mcpforce/home-card'));
        Assert.isTrue(uris.contains('ui://mcpforce/flow-run'));
    }

    @IsTest
    static void readReturnsTheBundleHtml() {
        Map<String, Object> result = McpResources.read(new Map<String, Object>{ 'uri' => 'ui://mcpforce/results-table' });
        List<Object> contents = (List<Object>) result.get('contents');
        Map<String, Object> item = (Map<String, Object>) contents[0];
        Assert.areEqual('ui://mcpforce/results-table', item.get('uri'));
        Assert.areEqual('text/html;profile=mcp-app', item.get('mimeType'));
        String html = (String) item.get('text');
        Assert.isTrue(html.length() > 100000, 'bundle is a real build, got ' + html.length());
        Assert.isTrue(html.toLowerCase().contains('<html'), 'is html');
    }

    @IsTest
    static void unknownUriIsInvalidParams() {
        try {
            McpResources.read(new Map<String, Object>{ 'uri' => 'ui://mcpforce/nope' });
            Assert.fail('expected McpError');
        } catch (McpEndpoint.McpError e) {
            Assert.areEqual(-32602, e.code);
        }
    }

    @IsTest
    static void mimeMatchesSdkFixture() {
        Assert.areEqual('text/html;profile=mcp-app', McpResources.MIME_TYPE);
    }
}
```

- [ ] **Step 4: Deploy to confirm the compile failure**

```bash
sf project deploy start --source-dir force-app -o mcpforce-dev --wait 10
```

Expected: FAILS with `Invalid type: McpResources`.

- [ ] **Step 5: Write `McpResources` and wire dispatch**

`force-app/main/default/classes/McpResources.cls`:

```apex
/**
 * ui:// resources = the widget bundles, served from static resources.
 * Bundles are generic and hold no tenant data (hard rule 3); everything a
 * widget shows arrives later in structuredContent.
 */
public with sharing class McpResources {
    /** Mirrors RESOURCE_MIME_TYPE in force-app/test/fixtures/mcp-apps-meta.json. */
    public static final String MIME_TYPE = 'text/html;profile=mcp-app';

    /** uri → static resource name, in list order. */
    public static final Map<String, String> URIS = new Map<String, String>{
        'ui://mcpforce/record-card' => 'mcpforce_record_card',
        'ui://mcpforce/results-table' => 'mcpforce_results_table',
        'ui://mcpforce/home-card' => 'mcpforce_home_card',
        'ui://mcpforce/flow-run' => 'mcpforce_flow_run'
    };

    public static Map<String, Object> list() {
        List<Object> resources = new List<Object>();
        for (String uri : URIS.keySet()) {
            resources.add(new Map<String, Object>{
                'uri' => uri,
                'name' => 'MCPforce ' + uri.substringAfterLast('/'),
                'mimeType' => MIME_TYPE,
                '_meta' => new Map<String, Object>{ 'ui' => new Map<String, Object>{ 'prefersBorder' => true } }
            });
        }
        return new Map<String, Object>{ 'resources' => resources };
    }

    public static Map<String, Object> read(Map<String, Object> params) {
        String uri = (String) params.get('uri');
        String resourceName = URIS.get(uri);
        if (resourceName == null) throw new McpEndpoint.McpError(-32602, 'Unknown resource: ' + uri);
        List<StaticResource> found = [SELECT Body FROM StaticResource WHERE Name = :resourceName LIMIT 1];
        if (found.isEmpty()) throw new McpEndpoint.McpError(-32603, 'Static resource missing: ' + resourceName);
        return new Map<String, Object>{
            'contents' => new List<Object>{ new Map<String, Object>{
                'uri' => uri,
                'mimeType' => MIME_TYPE,
                'text' => found[0].Body.toString()
            } }
        };
    }
}
```

In `McpEndpoint.dispatch`, add after the `tools/call` line:

```apex
        if (method == 'resources/list') return McpResources.list();
        if (method == 'resources/read') return McpResources.read(params);
```

- [ ] **Step 6: Deploy and run all tests**

```bash
scripts/sf/deploy.sh
scripts/sf/test.sh
```

Expected: deploy succeeds (static resources included); every test passes.

- [ ] **Step 7: Commit**

```bash
git add scripts/widgets-to-static-resources.mjs package.json force-app/main/default/staticresources force-app/main/default/classes
git commit -m "feat(apex): serve the widget bundles as ui:// resources from static resources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Callout to self from the endpoint

**Files:**
- Create: `force-app/main/default/classes/OrgApi.cls`, `OrgApiTest.cls` (+ metas)
- Modify: `force-app/main/default/classes/McpPingTool.cls` (probe + `selfCallout` in payload and text)
- Modify: `force-app/main/default/classes/McpPingToolTest.cls` (assert the probe)

**Interfaces:**
- Produces: `OrgApi.API_VERSION`, `OrgApi.get(String pathAndQuery)`, `OrgApi.post(String pathAndQuery, String jsonBody)` → `HttpResponse`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing `OrgApi` test**

`force-app/main/default/classes/OrgApiTest.cls`:

```apex
@IsTest
private class OrgApiTest {
    private class CapturingMock implements HttpCalloutMock {
        public HttpRequest seen;
        public HttpResponse respond(HttpRequest req) {
            seen = req;
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"ok":true}');
            return res;
        }
    }

    @IsTest
    static void getTargetsOwnDomainWithCallerSession() {
        CapturingMock mock = new CapturingMock();
        Test.setMock(HttpCalloutMock.class, mock);
        HttpResponse res = OrgApi.get('/services/data/' + OrgApi.API_VERSION + '/limits');
        Assert.areEqual(200, res.getStatusCode());
        Assert.areEqual('GET', mock.seen.getMethod());
        Assert.isTrue(mock.seen.getEndpoint().startsWith(URL.getOrgDomainUrl().toExternalForm()), mock.seen.getEndpoint());
        Assert.isTrue(mock.seen.getEndpoint().endsWith('/limits'));
        Assert.isTrue(mock.seen.getHeader('Authorization').startsWith('Bearer '));
        Assert.areEqual('application/json', mock.seen.getHeader('Accept'));
    }

    @IsTest
    static void postSendsJsonBody() {
        CapturingMock mock = new CapturingMock();
        Test.setMock(HttpCalloutMock.class, mock);
        OrgApi.post('/services/data/' + OrgApi.API_VERSION + '/quickActions/X', '{"a":1}');
        Assert.areEqual('POST', mock.seen.getMethod());
        Assert.areEqual('application/json', mock.seen.getHeader('Content-Type'));
        Assert.areEqual('{"a":1}', mock.seen.getBody());
    }
}
```

Add to `McpPingToolTest`:

```apex
    @IsTest
    static void reportsTheSelfCalloutStatus() {
        Test.setMock(HttpCalloutMock.class, new OkMock());
        Map<String, Object> result = new McpPingTool().call(new Map<String, Object>());
        Map<String, Object> payload = (Map<String, Object>) result.get('structuredContent');
        Map<String, Object> probe = (Map<String, Object>) payload.get('selfCallout');
        Assert.areEqual(200, probe.get('status'));
        Assert.areEqual(true, probe.get('ok'));
        List<Object> content = (List<Object>) result.get('content');
        String text = (String) ((Map<String, Object>) content[0]).get('text');
        Assert.isTrue(text.contains('Callout to self: 200'), text);
    }
```

- [ ] **Step 2: Deploy to confirm the compile failure**

```bash
sf project deploy start --source-dir force-app -o mcpforce-dev --wait 10
```

Expected: FAILS with `Invalid type: OrgApi`.

- [ ] **Step 3: Write `OrgApi` and the probe**

`force-app/main/default/classes/OrgApi.cls`:

```apex
/**
 * Callouts to this org's own REST / Tooling API as the calling user.
 *
 * In an Apex REST context UserInfo.getSessionId() is the caller's own
 * API-enabled token, and callouts to URL.getOrgDomainUrl() need no Remote
 * Site Setting, so nothing is stored and nothing is configured. NOT usable
 * from a Lightning (LWC) session — that session id is not API-enabled;
 * Studio uses a Named Credential instead (Session 8).
 */
public with sharing class OrgApi {
    public static final String API_VERSION = 'v62.0';

    public static HttpResponse get(String pathAndQuery) {
        return send('GET', pathAndQuery, null);
    }

    public static HttpResponse post(String pathAndQuery, String jsonBody) {
        return send('POST', pathAndQuery, jsonBody);
    }

    private static HttpResponse send(String method, String pathAndQuery, String body) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(URL.getOrgDomainUrl().toExternalForm() + pathAndQuery);
        req.setMethod(method);
        req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
        req.setHeader('Accept', 'application/json');
        req.setTimeout(30000);
        if (body != null) {
            req.setHeader('Content-Type', 'application/json');
            req.setBody(body);
        }
        return new Http().send(req);
    }
}
```

In `McpPingTool.call`, before building `payload`, add the probe:

```apex
        Map<String, Object> probe;
        try {
            String q = EncodingUtil.urlEncode('SELECT Id FROM Flow LIMIT 1', 'UTF-8');
            HttpResponse res = OrgApi.get('/services/data/' + OrgApi.API_VERSION + '/tooling/query?q=' + q);
            probe = new Map<String, Object>{
                'ok' => res.getStatusCode() == 200,
                'status' => res.getStatusCode(),
                'detail' => res.getStatusCode() == 200 ? 'tooling query answered' : res.getBody().abbreviate(300)
            };
        } catch (Exception e) {
            probe = new Map<String, Object>{ 'ok' => false, 'status' => 0, 'detail' => e.getTypeName() + ': ' + e.getMessage() };
        }
```

Then add `'selfCallout' => probe` to the payload map, and change the text line to:

```apex
        String text = 'MCPforce is alive in ' + orgName + ' as ' + UserInfo.getName()
            + '. Callout to self: ' + probe.get('status') + ' (' + probe.get('detail') + ').';
```

- [ ] **Step 4: Deploy and run all tests**

```bash
scripts/sf/deploy.sh
scripts/sf/test.sh
```

Expected: all pass, including the two new tests.

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/classes
git commit -m "feat(apex): OrgApi callout-to-self helper; crm_ping probes the Tooling API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The packaged connected app

**Files:**
- Create: `force-app/main/default/connectedApps/MCPforce.connectedApp-meta.xml`

**Interfaces:**
- Produces: a fixed consumer key committed in source (so every org that installs the package shares it) and a consumer secret held only in the password manager.

- [ ] **Step 1: Write the connected app metadata**

`force-app/main/default/connectedApps/MCPforce.connectedApp-meta.xml` — set `contactEmail` to the Dev Hub admin's email (the username `sf org display -o devhub` prints):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ConnectedApp xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>DEVHUB_ADMIN_EMAIL</contactEmail>
    <description>MCPforce chat-host connector. Chat hosts (Claude, ChatGPT, Copilot) authenticate reps against this org with PKCE; tokens are held by the host, never by MCPforce.</description>
    <label>MCPforce</label>
    <oauthConfig>
        <callbackUrl>https://claude.ai/api/mcp/auth_callback
https://claude.com/api/mcp/auth_callback
https://chatgpt.com/connector_platform_oauth_redirect
http://localhost:3333/callback</callbackUrl>
        <isAdminApproved>false</isAdminApproved>
        <isConsumerSecretOptional>false</isConsumerSecretOptional>
        <isIntrospectAllTokens>false</isIntrospectAllTokens>
        <isPkceRequired>true</isPkceRequired>
        <isRefreshTokenRotationEnabled>false</isRefreshTokenRotationEnabled>
        <isSecretRequiredForRefreshToken>true</isSecretRequiredForRefreshToken>
        <scopes>Api</scopes>
        <scopes>RefreshToken</scopes>
        <scopes>OpenID</scopes>
    </oauthConfig>
    <oauthPolicy>
        <ipRelaxation>ENFORCE</ipRelaxation>
        <refreshTokenPolicy>infinite</refreshTokenPolicy>
    </oauthPolicy>
</ConnectedApp>
```

Rotation is deliberately OFF: refresh-token rotation with reuse detection is what repeatedly killed the old Cardstack connection (memory note `salesforce-token-rotation`). The `localhost:3333` callback is for the smoke test's manual OAuth check in Task 7; the Claude callback URLs are the ones the add-connector dialog shows today — if the dialog shows a different one in Task 8, add it here and redeploy.

- [ ] **Step 2: Deploy, then retrieve the generated consumer key into source**

```bash
sf project deploy start --source-dir force-app/main/default/connectedApps -o mcpforce-dev --wait 10
sf project retrieve start --metadata ConnectedApp:MCPforce -o mcpforce-dev --wait 10
grep consumerKey force-app/main/default/connectedApps/MCPforce.connectedApp-meta.xml
```

Expected: the file now contains a `<consumerKey>3MVG9...</consumerKey>` line inside `oauthConfig`. Committing it is correct and required: a packaged connected app must carry a fixed key.

- [ ] **Step 3: Record the consumer secret (manual)**

```bash
sf org open -o mcpforce-dev --path /lightning/setup/NavigationMenus/home
```

Setup → App Manager → MCPforce → ▼ View → Manage Consumer Details (email verification code goes to the scratch-org user; `sf org open` shows that user's email under Setup → Users). Copy Consumer Key and Consumer Secret into the password manager as "MCPforce dev connected app". Do not paste the secret into any file in this repo.

- [ ] **Step 4: Commit**

```bash
git add force-app/main/default/connectedApps
git commit -m "feat(sfdx): packaged MCPforce connected app (PKCE, no rotation, host callbacks)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Smoke script against the scratch org

**Files:**
- Create: `scripts/sf/mcp-smoke.sh`

**Interfaces:**
- Consumes: the endpoint from Task 3–5 and the `namespace` in `sfdx-project.json`.

- [ ] **Step 1: Write the script**

`scripts/sf/mcp-smoke.sh`:

```bash
#!/usr/bin/env bash
# Exercise the MCP endpoint end to end with the sf CLI's own access token.
# The token lives in a shell variable for the life of this script and nowhere else.
set -euo pipefail
cd "$(dirname "$0")/../.."
ORG="${1:-mcpforce-dev}"

INFO=$(SF_TEMP_SHOW_SECRETS=true sf org display -o "$ORG" --json)
TOKEN=$(jq -r '.result.accessToken' <<<"$INFO")
URL=$(jq -r '.result.instanceUrl' <<<"$INFO")
NS=$(jq -r '.namespace // ""' sfdx-project.json)
[ -n "$NS" ] && NS="$NS/"
EP="$URL/services/apexrest/${NS}mcp"
echo "endpoint: $EP"

call() {
  curl -sS -X POST "$EP" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' -d "$1"
}
status() {
  curl -sS -o /dev/null -w '%{http_code}' "$@"
}

call '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | jq -e '.result.protocolVersion == "2025-06-18" and .result.serverInfo.name == "MCPforce"' >/dev/null && echo "initialize      ok"

[ "$(status -X POST "$EP" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"notifications/initialized"}')" = 202 ] \
  && echo "notification    ok (202)"

call '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | jq -e '.result.tools[0].name == "crm_ping" and .result.tools[0]._meta.ui.resourceUri == "ui://mcpforce/results-table" and .result.tools[0]._meta["ui/resourceUri"] == "ui://mcpforce/results-table"' >/dev/null && echo "tools/list      ok"

call '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"crm_ping","arguments":{}}}' > /tmp/mcpforce-ping.json
jq -e '.result.structuredContent.kind == "results-table" and (.result.structuredContent.page.rows[0].fields.Name | length > 0)' /tmp/mcpforce-ping.json >/dev/null && echo "tools/call      ok"
echo "  $(jq -r '.result.content[0].text' /tmp/mcpforce-ping.json)"

call '{"jsonrpc":"2.0","id":4,"method":"resources/list"}' \
  | jq -e '.result.resources | length == 4' >/dev/null && echo "resources/list  ok"

call '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"ui://mcpforce/results-table"}}' \
  | jq -e '.result.contents[0].mimeType == "text/html;profile=mcp-app" and (.result.contents[0].text | length > 100000)' >/dev/null && echo "resources/read  ok"

[ "$(status "$EP" -H "Authorization: Bearer $TOKEN")" = 405 ] && echo "GET             ok (405)"
[ "$(status -X POST "$EP" -H 'Content-Type: application/json' -d '{}')" = 401 ] && echo "no token        ok (401 from the platform, before Apex)"
rm -f /tmp/mcpforce-ping.json
```

- [ ] **Step 2: Run it**

```bash
chmod +x scripts/sf/mcp-smoke.sh
scripts/sf/mcp-smoke.sh
```

Expected: eight `ok` lines. The `tools/call` text line must read `Callout to self: 200 (tooling query answered)`. If it reads anything else, copy the detail verbatim into the result doc in Task 8 — this is proof 3 failing with a CLI token, which already answers the question.

- [ ] **Step 3: Commit**

```bash
git add scripts/sf/mcp-smoke.sh
git commit -m "chore(sfdx): MCP smoke script against a scratch org

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Connect a chat host and write the go/no-go

This task is manual. It produces the document the overview's decision 2 depends on.

**Files:**
- Create: `docs/superpowers/specs/force-com/00-result.md`
- Possibly modify: `force-app/main/default/connectedApps/MCPforce.connectedApp-meta.xml` (callback URL)

- [ ] **Step 1: Prepare a login for the scratch org user**

```bash
sf org generate password -o mcpforce-dev
sf org display -o mcpforce-dev --json | jq -r '.result | "url: \(.instanceUrl)\nuser: \(.username)"'
```

Copy the username and the generated password; you will type them into Salesforce's login page from the host's OAuth redirect. The endpoint URL is `<instanceUrl>/services/apexrest/<namespace>/mcp` (no namespace segment if `namespace` is `""`).

- [ ] **Step 2: Add the connector in Claude web**

claude.ai → Settings → Connectors → Add custom connector. Name `MCPforce dev`. Remote MCP server URL = the endpoint URL. Open Advanced settings: OAuth Client ID = consumer key, Client Secret = consumer secret. Before saving, note the **callback URL the dialog shows**; if it is not one of the four in the connected app, add it to `callbackUrl`, run `scripts/sf/deploy.sh`, and only then save the connector.

Click Connect. Expected: redirect to the scratch org's My Domain login → sign in with the Step 1 credentials → Allow → back in Claude with the connector marked connected.

Record, for the result doc: whether the login page appeared at all; whether Salesforce showed an error page (copy its text verbatim, e.g. `redirect_uri_mismatch`, `invalid_client_id`); whether Claude reported a discovery error before redirecting (that means it attempted dynamic registration against the advertised `registration_endpoint` and ignored the manual credentials — a hard fail for this approach).

- [ ] **Step 3: Render the widget**

In a new chat with the connector enabled: "Use the MCPforce dev connector and call crm_ping." Expected: the results-table widget renders with a title "MCPforce is alive in MCPforce dev" and one row with the scratch user's name; the tool's text says `Callout to self: 200 (tooling query answered)`.

That text is proof 3 under a connected-app token, which is the case that matters. If it says anything else, copy it verbatim.

- [ ] **Step 4: Check Salesforce's side**

```bash
sf org open -o mcpforce-dev --path /lightning/setup/OrgLoginHistory/home
```

Login History should show a row with Login Type "Remote Access 2.0" and Application "MCPforce". Setup → Connected Apps OAuth Usage should list MCPforce with one user. Note both.

- [ ] **Step 5: Repeat for other hosts you have access to**

Claude Desktop: the same connector is available once claude.ai has it; open a chat, call `crm_ping`, note whether the widget renders. ChatGPT (needs developer mode under Settings → Connectors): create a connector with the same URL and credentials; note the callback URL it demands and add it to the connected app if new. Copilot: only if a tenant with custom MCP connectors is available; otherwise mark untested.

- [ ] **Step 6: Optional, only if time allows — the two on-platform discovery tricks**

(a) In the scratch org, Setup → Sites → create a site, and try to publish a Visualforce page whose URL rewriter maps `/.well-known/oauth-protected-resource`. Record whether the platform accepts a dot-prefixed path at all. (b) `curl -X POST "<instanceUrl>/services/oauth2/register" -H 'Content-Type: application/json' -d '{"client_name":"probe","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'` — record the status and body (expected: 401, because an initial access token is required). Both go under "Discovery experiments" in the result doc. Neither changes the go/no-go.

- [ ] **Step 7: Write the result doc**

`docs/superpowers/specs/force-com/00-result.md`, using exactly these headings and filling every cell — write `untested` rather than leaving a blank:

```markdown
# Session 0 result — <date>

## Go / no-go

**GO** or **NO-GO**, one sentence why. GO requires: Claude web completed OAuth
with manual credentials AND rendered the crm_ping widget AND the tool text
reported `Callout to self: 200`. Anything less is NO-GO, and the
recommendation is the stateless front door from the overview's decision 2.

## Foundation

| Item | Value |
|---|---|
| Dev Hub username | |
| Namespace | |
| Namespace org username | |
| Scratch org alias / instance URL | |
| Endpoint URL | |
| Connected app consumer key | (key is fine to record; the secret is in the password manager only) |
| Callback URLs registered | |

## Host results

| Host | OAuth completed | Widget rendered | Callout to self | Notes (verbatim errors) |
|---|---|---|---|---|
| Claude web | | | | |
| Claude Desktop | | | | |
| ChatGPT | | | | |
| Copilot | | | | |

## What the host actually did

Which discovery documents it fetched (from Claude's error text, the
Salesforce login history, and any network log you could see), whether it
attempted dynamic client registration, and whether it sent an RFC 8707
`resource` parameter that Salesforce tolerated.

## Discovery experiments (optional)

Site URL-rewriter result; `/services/oauth2/register` status and body.

## Deferred to Session 7

Test flows that failed to deploy in Task 1, if any.

## Guidance for the Connect page (Session 6)

The exact sequence of clicks that worked per host, so the Connect page can
say it.
```

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/force-com/00-result.md force-app/main/default/connectedApps
git commit -m "docs: Session 0 result — host connection, callout-to-self, go/no-go

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done when

- `scripts/sf/test.sh` passes with every class covered.
- `scripts/sf/mcp-smoke.sh` prints eight `ok` lines.
- `pnpm --filter @cardstack/widgets exec vitest run src/shared/mcp-apps-meta.test.ts` passes.
- `node scripts/widgets-to-static-resources.mjs --check` exits 0.
- `docs/superpowers/specs/force-com/00-result.md` exists with a GO or NO-GO and no empty cells.
