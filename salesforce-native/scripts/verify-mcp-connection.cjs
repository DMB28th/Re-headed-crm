#!/usr/bin/env node
"use strict";
// Local executable only. No authentication, network or file IO occurs on import.
// Managed auth is loaded only after explicit private scope validation. Never refresh.
const { createHash } = require("node:crypto");
const { isDeepStrictEqual: eq } = require("node:util");
const LIVE_EXECUTION = Symbol("controller-cli");
const URI = "ui://cardstack/connection-diagnostic-v1.html";
const need = (ok, code) => {
  if (!ok) throw Error(code);
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const keys = (x, expected) =>
  object(x) && eq(Object.keys(x).sort(), [...expected].sort());
function normalizeId(value) {
  need(
    typeof value === "string" &&
      /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(value),
    "SCOPE_REJECTED",
  );
  const base = value.slice(0, 15),
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  let suffix = "";
  for (let block = 0; block < 3; block++) {
    let bits = 0;
    for (let n = 0; n < 5; n++)
      if (/[A-Z]/.test(base[block * 5 + n])) bits |= 1 << n;
    suffix += alphabet[bits];
  }
  const full = base + suffix;
  need(value.length === 15 || value === full, "SCOPE_REJECTED");
  return full;
}
function validateScope(raw) {
  need(
    keys(raw, [
      "controllerApproved",
      "alias",
      "client",
      "resourceUrl",
      "metadataUrl",
      "issuer",
      "orgId",
    ]) &&
      raw.controllerApproved === true &&
      raw.alias === "cardstack-spike2" &&
      ["claude", "chatgpt"].includes(raw.client),
    "SCOPE_REJECTED",
  );
  need(
    typeof raw.orgId === "string" &&
      raw.orgId.length === 18 &&
      raw.orgId.startsWith("00D") &&
      normalizeId(raw.orgId) === raw.orgId,
    "SCOPE_REJECTED",
  );
  const suffix = "/services/apexrest/cardstack/v1/" + raw.client;
  need(
    typeof raw.resourceUrl === "string" &&
      /^https:\/\/(?:[a-z0-9-]+\.)+my\.salesforce-sites\.com(?:\/[A-Za-z0-9_-]{1,80})?\/services\/apexrest\/cardstack\/v1\/(claude|chatgpt)\/mcp$/.test(
        raw.resourceUrl,
      ) &&
      raw.resourceUrl.endsWith(suffix + "/mcp"),
    "SCOPE_REJECTED",
  );
  need(
    raw.metadataUrl === raw.resourceUrl.slice(0, -3) + "metadata" &&
      typeof raw.issuer === "string" &&
      /^https:\/\/(?:[a-z0-9-]+\.)+my\.salesforce\.com$/.test(raw.issuer),
    "SCOPE_REJECTED",
  );
  return Object.freeze({ ...raw });
}
function cases(scope) {
  const rpc = (id, method, params) =>
    JSON.stringify({
      jsonrpc: "2.0",
      ...(id ? { id } : {}),
      method,
      ...(params ? { params } : {}),
    });
  return [
    {
      caseId: "metadata",
      auth: "anonymous",
      url: scope.metadataUrl,
      method: "GET",
    },
    {
      caseId: "public401",
      auth: "anonymous",
      url: scope.resourceUrl,
      method: "GET",
    },
    {
      caseId: "anonymousResource",
      auth: "anonymous",
      url: scope.resourceUrl,
      method: "POST",
      body: rpc(2, "resources/read", { uri: URI }),
    },
    {
      caseId: "initialize",
      auth: "named",
      url: scope.resourceUrl,
      method: "POST",
      body: rpc(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "Cardstack bounded local check", version: "1.0.0" },
      }),
    },
    {
      caseId: "notification",
      auth: "named",
      url: scope.resourceUrl,
      method: "POST",
      body: rpc(null, "notifications/initialized"),
    },
    {
      caseId: "resource",
      auth: "named",
      url: scope.resourceUrl,
      method: "POST",
      body: rpc(3, "resources/read", { uri: URI }),
    },
  ].map((c) =>
    Object.freeze({
      ...c,
      redirect: "error",
      headers: Object.freeze({
        "content-type": "application/json",
        accept: "application/json",
      }),
    }),
  );
}
async function deadline(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function bounded(send, request, timeoutMs) {
  const abort = new AbortController();
  let timer, iterator;
  const operation = (async () => {
    let response = await send({ ...request, signal: abort.signal });
    need(
      response && Number.isInteger(response.status) && object(response.headers),
      "TRANSPORT_FAILURE",
    );
    const headers = {};
    for (const key of ["content-type", "www-authenticate"]) {
      const v = response.headers[key];
      if (v !== undefined) {
        need(
          typeof v === "string" && Buffer.byteLength(v) <= 4096,
          "HEADER_LIMIT",
        );
        headers[key] = v;
      }
    }
    if (response.status >= 300 && response.status < 400)
      return { code: "PROVIDER_REDIRECT" };
    if (/^text\/html(?:;|$)/i.test(headers["content-type"] || ""))
      return { code: "PROVIDER_HTML" };
    const cap = request.caseId === "resource" ? 1048576 : 65536,
      chunks = [];
    let bytes = 0;
    const take = (chunk) => {
      need(
        typeof chunk === "string" ||
          Buffer.isBuffer(chunk) ||
          chunk instanceof Uint8Array,
        "TRANSPORT_FAILURE",
      );
      const b = Buffer.from(chunk);
      bytes += b.length;
      need(bytes <= cap, "BODY_LIMIT");
      chunks.push(b);
    };
    if (typeof response.body === "string" || Buffer.isBuffer(response.body))
      take(response.body);
    else {
      need(
        response.body &&
          typeof response.body[Symbol.asyncIterator] === "function",
        "TRANSPORT_FAILURE",
      );
      iterator = response.body[Symbol.asyncIterator]();
      while (true) {
        const part = await iterator.next();
        if (part.done) break;
        if (abort.signal.aborted) throw Error("TIMEOUT");
        take(part.value);
      }
    }
    return {
      status: response.status,
      headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };
  })();
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("TIMEOUT")), timeoutMs);
      }),
    ]);
  } catch (error) {
    const code = ["BODY_LIMIT", "HEADER_LIMIT", "TIMEOUT"].includes(
      error.message,
    )
      ? error.message
      : "TRANSPORT_FAILURE";
    return { code };
  } finally {
    clearTimeout(timer);
    abort.abort();
    if (iterator?.return) Promise.resolve(iterator.return()).catch(() => {});
  }
}
function classify(entry, response, scope, hash) {
  const outcome = (status, code) => ({ status, code });
  if (response.code) return outcome("Unknown", response.code);
  if (entry.caseId === "notification")
    return response.status === 202
      ? outcome(
          response.body === "" ? "Pass" : "Fail",
          response.body === "" ? "CONTRACT_MATCH" : "CONTRACT_MISMATCH",
        )
      : outcome("Unknown", "PROVIDER_UNCLASSIFIED");
  let body;
  try {
    body = JSON.parse(response.body);
  } catch {
    return outcome("Unknown", "PROVIDER_UNCLASSIFIED");
  }
  if (!object(body)) return outcome("Unknown", "PROVIDER_UNCLASSIFIED");
  const json = /^application\/json(?:;|$)/i.test(
    response.headers["content-type"] || "",
  );
  let pass = false;
  switch (entry.caseId) {
    case "metadata":
      pass =
        response.status === 200 &&
        body.resource === scope.resourceUrl &&
        eq(body.authorization_servers, [scope.issuer]);
      break;
    case "public401":
      pass =
        response.status === 401 &&
        body.error === "authentication_required" &&
        response.headers["www-authenticate"] ===
          `Bearer resource_metadata="${scope.metadataUrl}", scope="api refresh_token"`;
      break;
    case "anonymousResource":
      pass =
        response.status === 401 && body.error === "authentication_required";
      break;
    case "initialize":
      pass =
        response.status === 200 &&
        body.jsonrpc === "2.0" &&
        body.id === 1 &&
        !body.error &&
        body.result?.protocolVersion === "2025-06-18" &&
        body.result?.serverInfo?.name === "Cardstack connection diagnostics" &&
        object(body.result?.capabilities?.tools) &&
        object(body.result?.capabilities?.resources) &&
        object(
          body.result?.capabilities?.extensions?.["io.modelcontextprotocol/ui"],
        );
      break;
    case "resource": {
      const item = body.result?.contents?.[0];
      pass =
        response.status === 200 &&
        keys(body, ["jsonrpc", "id", "result"]) &&
        body.jsonrpc === "2.0" &&
        body.id === 3 &&
        body.result?.contents?.length === 1 &&
        item?.uri === URI &&
        item.mimeType === "text/html;profile=mcp-app" &&
        typeof item.text === "string" &&
        createHash("sha256").update(item.text).digest("hex") === hash &&
        eq(item._meta?.ui?.csp, {
          connectDomains: [],
          resourceDomains: [],
          frameDomains: [],
        });
      break;
    }
  }
  if (pass && json) return outcome("Pass", "CONTRACT_MATCH");
  const recognizable =
    object(body) &&
    (Object.hasOwn(body, "jsonrpc") ||
      Object.hasOwn(body, "resource") ||
      body.error === "authentication_required" ||
      response.status === 401);
  return outcome(
    recognizable ? "Fail" : "Unknown",
    recognizable ? "CONTRACT_MISMATCH" : "PROVIDER_UNCLASSIFIED",
  );
}
// Standalone classifier harness is offline-only. No arbitrary RPC/tool/method/
// body/path input or credential handling exists in this entry point.
async function runOfflineProtocol({
  scope: raw,
  expectedHash,
  send,
  verifyIdentity,
  timeoutMs = 15000,
}) {
  const scope = validateScope(raw);
  need(
    /^[a-f0-9]{64}$/.test(expectedHash) &&
      typeof send === "function" &&
      typeof verifyIdentity === "function" &&
      Number.isInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= 15000,
    "SCOPE_REJECTED",
  );
  const stages = [],
    add = (stage, status, code) =>
      stages.push({
        stage,
        status,
        code,
        source: "offline-injected",
        checkedAt: new Date().toISOString(),
      });
  let identity;
  try {
    const current = await deadline(verifyIdentity, timeoutMs);
    identity =
      normalizeId(current?.orgId) === scope.orgId &&
      current?.issuer === scope.issuer;
  } catch {
    identity = false;
  }
  add(
    "identity",
    identity ? "Pass" : "Fail",
    identity ? "IDENTITY_MATCH" : "IDENTITY_UNVERIFIED",
  );
  for (const entry of cases(scope)) {
    if (!identity) {
      add(entry.caseId, "Unknown", "IDENTITY_UNVERIFIED");
      continue;
    }
    const response = await bounded(send, entry, timeoutMs);
    const result = classify(entry, response, scope, expectedHash);
    add(entry.caseId, result.status, result.code);
  }
  for (const gate of ["host", "iframe", "bridge", "diagnosticExchange"])
    add(gate, "Unknown", "NOT_OBSERVED");
  return {
    schemaVersion: 1,
    evidenceSource: "offline-injected",
    liveExecution: false,
    evidenceRevision: "connection-protocol/v1",
    resourceSha256: expectedHash,
    configurationRevision: null,
    stages,
  };
}
function validateApprovedScope(raw) {
  need(
    keys(raw, [
      "controllerApproved",
      "alias",
      "client",
      "resourceUrl",
      "metadataUrl",
      "issuer",
      "orgId",
      "actorId",
      "identityUrl",
      "apiUrl",
    ]),
    "SCOPE_REJECTED",
  );
  const { actorId, identityUrl, apiUrl, ...base } = raw;
  const scope = validateScope(base);
  need(
    typeof actorId === "string" &&
      actorId.length === 18 &&
      actorId.startsWith("005") &&
      normalizeId(actorId) === actorId &&
      identityUrl === scope.issuer + "/services/oauth2/userinfo" &&
      apiUrl === scope.issuer + "/services/data/v67.0/limits",
    "SCOPE_REJECTED",
  );
  return Object.freeze({ ...scope, actorId, identityUrl, apiUrl });
}
async function runApprovedProtocol({
  scope: raw,
  expectedHash,
  loadManaged,
  send,
  timeoutMs = 15000,
  executionMarker,
}) {
  const scope = validateApprovedScope(raw);
  need(
    /^[a-f0-9]{64}$/.test(expectedHash) &&
      typeof loadManaged === "function" &&
      typeof send === "function" &&
      Number.isInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= 15000,
    "SCOPE_REJECTED",
  );
  const liveExecution =
    executionMarker === LIVE_EXECUTION && send === nativeSend;
  const stages = [],
    source = liveExecution ? "controller-approved-http" : "offline-injected";
  const add = (stage, status, code) =>
    stages.push({
      stage,
      status,
      code,
      source,
      checkedAt: new Date().toISOString(),
    });
  const finish = () => {
    for (const gate of [
      "identity",
      "apiAuthorization",
      "metadata",
      "public401",
      "anonymousResource",
      "initialize",
      "notification",
      "resource",
      "host",
      "iframe",
      "bridge",
      "diagnosticExchange",
      "mcpAudienceBinding",
    ])
      if (!stages.some((s) => s.stage === gate))
        add(gate, "Unknown", "NOT_OBSERVED");
    return {
      schemaVersion: 1,
      evidenceSource: source,
      liveExecution,
      evidenceRevision: "connection-protocol/v1",
      resourceSha256: expectedHash,
      configurationRevision: null,
      stages,
    };
  };
  let managed;
  try {
    managed = await deadline(() => loadManaged(scope.alias), timeoutMs);
    need(
      normalizeId(managed?.orgId) === scope.orgId &&
        managed.instanceUrl === scope.issuer &&
        typeof managed.accessToken === "string" &&
        managed.accessToken.length > 0 &&
        managed.accessToken.length <= 16384 &&
        !/[\s]/.test(managed.accessToken),
      "MANAGED_AUTH_UNAVAILABLE",
    );
  } catch {
    add("identity", "Unknown", "MANAGED_AUTH_UNAVAILABLE");
    return finish();
  }
  const request = async (entry) =>
    bounded(
      send,
      {
        ...entry,
        redirect: "error",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(entry.auth === "named"
            ? { Authorization: "Bearer " + managed.accessToken }
            : {}),
        },
      },
      timeoutMs,
    );
  const identity = await request({
    caseId: "identityControl",
    auth: "named",
    method: "GET",
    url: scope.identityUrl,
  });
  let who;
  try {
    who = JSON.parse(identity.body);
    need(
      identity.status === 200 &&
        /^application\/json(?:;|$)/i.test(
          identity.headers?.["content-type"] || "",
        ) &&
        normalizeId(who.organization_id) === scope.orgId &&
        normalizeId(who.user_id) === scope.actorId,
      "IDENTITY_UNVERIFIED",
    );
  } catch {
    add("identity", "Unknown", identity.code || "IDENTITY_UNVERIFIED");
    return finish();
  }
  add("identity", "Pass", "IDENTITY_MATCH");
  const api = await request({
    caseId: "apiControl",
    auth: "named",
    method: "GET",
    url: scope.apiUrl,
  });
  try {
    const limits = JSON.parse(api.body)?.DailyApiRequests;
    need(
      api.status === 200 &&
        /^application\/json(?:;|$)/i.test(
          api.headers?.["content-type"] || "",
        ) &&
        Number.isSafeInteger(limits?.Max) &&
        limits.Max >= 0 &&
        Number.isSafeInteger(limits?.Remaining) &&
        limits.Remaining >= 0 &&
        limits.Remaining <= limits.Max,
      "API_AUTHORIZATION_UNVERIFIED",
    );
  } catch {
    add(
      "apiAuthorization",
      "Unknown",
      api.code || "API_AUTHORIZATION_UNVERIFIED",
    );
    return finish();
  }
  add("apiAuthorization", "Pass", "API_AUTHORIZATION_MATCH");
  let metadataMatches = false;
  for (const entry of cases(scope)) {
    if (entry.auth === "named" && !metadataMatches) {
      add(entry.caseId, "Unknown", "METADATA_UNVERIFIED");
      continue;
    }
    const result = classify(entry, await request(entry), scope, expectedHash);
    add(entry.caseId, result.status, result.code);
    if (entry.caseId === "metadata") metadataMatches = result.status === "Pass";
  }
  managed = null;
  return finish();
}
async function readManagedWithSdk(alias, { StateAggregator, AuthInfo }) {
  const state = await StateAggregator.getInstance();
  const username = state.aliases.getUsername(alias);
  need(
    typeof username === "string" &&
      username.includes("@") &&
      !username.includes("!"),
    "MANAGED_AUTH_UNAVAILABLE",
  );
  const info = await AuthInfo.create({ username });
  const fields = info.getFields(true);
  return {
    accessToken: fields.accessToken,
    orgId: fields.orgId,
    instanceUrl: fields.instanceUrl,
  };
}
async function loadExistingManagedAuth(alias, runtime) {
  // Public installed SDK APIs only: existing alias -> existing AuthInfo -> fields.
  // No getConnectionOptions, Connection, refreshFn, retrieveUserInfo or CLI JSON.
  const path = require("node:path"),
    { createRequire } = require("node:module");
  process.env.SF_LOG_LEVEL = "FATAL";
  process.env.SFDX_LOG_LEVEL = "FATAL";
  const resolveFrom = runtime
    ? createRequire(path.resolve(runtime, "package.json"))
    : require;
  return readManagedWithSdk(alias, resolveFrom("@salesforce/core"));
}
async function nativeSend({ url, method, headers, body, redirect, signal }) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect,
    signal,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: response.body || Buffer.alloc(0),
  };
}
async function main(args) {
  const fs = require("node:fs"),
    path = require("node:path");
  let receipt;
  try {
    need(args[0] === "--controller-approved", "CONTROLLER_APPROVAL_REQUIRED");
    need(
      [7, 9].includes(args.length) &&
        args[1] === "--target-org" &&
        args[3] === "--client" &&
        args[5] === "--scope-file" &&
        (args.length === 7 || args[7] === "--sf-runtime"),
      "SCOPE_REJECTED",
    );
    const fd = fs.openSync(
      args[6],
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    let raw;
    try {
      const stat = fs.fstatSync(fd);
      need(
        stat.isFile() &&
          stat.size > 0 &&
          stat.size <= 16384 &&
          (stat.mode & 0o077) === 0 &&
          stat.uid === process.getuid(),
        "SCOPE_REJECTED",
      );
      raw = JSON.parse(fs.readFileSync(fd, "utf8"));
    } finally {
      fs.closeSync(fd);
    }
    const scope = validateApprovedScope(raw);
    need(scope.alias === args[2] && scope.client === args[4], "SCOPE_REJECTED");
    const expectedHash = createHash("sha256")
      .update(
        fs.readFileSync(
          path.join(
            __dirname,
            "../force-app/main/default/staticresources/CardstackConnectionDiagnosticUi.resource",
          ),
        ),
      )
      .digest("hex");
    receipt = await runApprovedProtocol({
      scope,
      expectedHash,
      loadManaged: (alias) => loadExistingManagedAuth(alias, args[8]),
      send: nativeSend,
      executionMarker: LIVE_EXECUTION,
    });
  } catch (error) {
    const code = ["CONTROLLER_APPROVAL_REQUIRED", "SCOPE_REJECTED"].includes(
      error.message,
    )
      ? error.message
      : "SCOPE_REJECTED";
    receipt = {
      schemaVersion: 1,
      liveExecution: false,
      status: "Unknown",
      code,
      stages: [
        "identity",
        "apiAuthorization",
        "metadata",
        "public401",
        "anonymousResource",
        "initialize",
        "notification",
        "resource",
        "host",
        "iframe",
        "bridge",
        "diagnosticExchange",
        "mcpAudienceBinding",
      ].map((stage) => ({ stage, status: "Unknown", source: "not-run", code })),
    };
  }
  process.stdout.write(JSON.stringify(receipt) + "\n");
  return receipt.stages
    .filter(
      (s) =>
        ![
          "host",
          "iframe",
          "bridge",
          "diagnosticExchange",
          "mcpAudienceBinding",
        ].includes(s.stage),
    )
    .every((s) => s.status === "Pass")
    ? 0
    : 2;
}
module.exports = {
  runOfflineProtocol,
  runApprovedProtocol,
  validateScope,
  readManagedWithSdk,
};
if (require.main === module)
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stdout.write('{"status":"Unknown","code":"RUNNER_FAILURE"}\n');
      process.exitCode = 2;
    });
