"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const deps = process.env.CARDSTACK_UI_DEPENDENCIES;
const localRequire = deps
  ? createRequire(path.resolve(deps, "../package.json"))
  : require;
const { JSDOM } = localRequire("jsdom");
const values = {
  text: 'café ✓ "quoted"',
  amount: 0,
  accepted: false,
  choice: "beta",
  rating: "hot",
  notes: "first\nsecond",
  enabled: false,
};
const versions = {
  package: "0.1.0.8",
  transport: "cardstack/v1",
  ui: "mcp-apps/v1",
  permissionPolicy: "1",
};
const start = Date.parse("2026-10-10T12:00:00.000Z");
function opening(key = "a") {
  return {
    content: [{ type: "text", text: "Synthetic connection diagnostic" }],
    _meta: {
      "cardstack/connectionDiagnostic": {
        attemptKey: key.repeat(64),
        challenge: "b".repeat(64),
        expiresAt: "2026-10-10T12:10:00.000Z",
        configurationRevision: 3,
        client: "claude",
        versions: { ...versions },
        resourceUri: "ui://cardstack/connection-diagnostic-v1.html",
        fixture: { ...values },
      },
    },
  };
}
function receipt(v = values) {
  return {
    structuredContent: {
      values: { ...v },
      client: "claude",
      versions: { ...versions },
      reference: "check_" + "c".repeat(64),
      configurationRevision: 3,
      checkedAt: "2026-10-10T12:00:01.000Z",
      expiresAt: "2026-10-10T12:10:00.000Z",
      exactValues: true,
      stages: [
        {
          stage: "diagnosticExchange",
          status: "Pass",
          source: "Server exact typed echo",
          checkedAt: "2026-10-10T12:00:01.000Z",
          errorCode: null,
        },
        {
          stage: "htmlLoading",
          status: "Unknown",
          source: "No HTML-loading evidence",
          checkedAt: null,
          errorCode: null,
        },
        {
          stage: "clientUiObserved",
          status: "Unknown",
          source: "Operator observation",
          checkedAt: null,
          errorCode: null,
        },
      ],
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function harness({ late = false } = {}) {
  const { mountDiagnostic } =
    await import("../ui/connection-diagnostic/controller.mjs");
  const dom = new JSDOM(
    fs.readFileSync(
      path.join(__dirname, "../ui/connection-diagnostic/index.html"),
      "utf8",
    ),
  );
  let resolveConnect,
    resolveCall,
    now = start;
  const calls = [];
  let timer;
  const app = {
    connect() {
      assert.equal(typeof this.ontoolresult, "function");
      assert.equal(typeof this.onteardown, "function");
      return late
        ? new Promise((r) => (resolveConnect = r))
        : Promise.resolve();
    },
    callServerTool(input) {
      calls.push(input);
      return new Promise((r) => (resolveCall = r));
    },
    close() {
      this.onclose?.();
    },
  };
  const controller = mountDiagnostic(app, dom.window.document, {
    now: () => now,
    setInterval: (fn) => ((timer = fn), 1),
    clearInterval() {
      timer = null;
    },
  });
  await tick();
  return {
    app,
    controller,
    calls,
    doc: dom.window.document,
    open: (o) => app.ontoolresult(o || opening()),
    reply: (r) => resolveCall(r || receipt()),
    connected: () => resolveConnect(),
    advance: (ms) => {
      now += ms;
      timer?.();
    },
    button: () => dom.window.document.querySelector("button[type=submit]"),
    submit: () =>
      dom.window.document
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { cancelable: true })),
    state: () => dom.window.document.querySelector("#status").dataset.state,
  };
}
test("bridgeReadyRequiresInitialResult; early and late result order both work", async () => {
  const h = await harness();
  assert.equal(h.state(), "waiting");
  assert.equal(h.button().disabled, true);
  h.open();
  assert.equal(h.state(), "ready");
  assert.equal(h.button().disabled, false);
  const late = await harness({ late: true });
  late.open();
  assert.equal(late.state(), "waiting");
  late.connected();
  await tick();
  assert.equal(late.state(), "ready");
});
test("exactSevenValues: submit reads typed controls and displays independently compared receipt", async () => {
  const h = await harness();
  h.open();
  h.submit();
  h.submit();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], {
    name: "cardstack_connection_echo",
    arguments: {
      attemptKey: "a".repeat(64),
      challenge: "b".repeat(64),
      values,
    },
  });
  h.reply();
  await tick();
  assert.equal(h.state(), "passed");
  assert.deepEqual(
    JSON.parse(h.doc.querySelector("#receipt").textContent).values,
    values,
  );
  assert.doesNotMatch(h.doc.body.textContent, /a{64}|b{64}/);
});
test("emptyText stays empty with false and zero preserved", async () => {
  const h = await harness();
  h.open();
  h.doc.querySelector("#text").value = "";
  h.submit();
  assert.equal(h.calls[0].arguments.values.text, "");
  h.reply(receipt({ ...values, text: "" }));
  await tick();
  assert.equal(h.state(), "passed");
});
test("disconnectDisablesSubmit and invalidates pending reply", async () => {
  const h = await harness();
  h.open();
  h.submit();
  h.app.onclose();
  h.reply();
  await tick();
  assert.equal(h.state(), "disconnected");
  assert.equal(h.button().disabled, true);
  assert.equal(h.doc.querySelector("#receipt").textContent, "");
});
test("staleReplyIgnored after changed attempt", async () => {
  const h = await harness();
  h.open();
  h.submit();
  h.open(opening("d"));
  h.reply();
  await tick();
  assert.equal(h.state(), "ready");
  assert.equal(h.doc.querySelector("#receipt").textContent, "");
});
test("reloadFreshAttempt and teardown require new initial result", async () => {
  const h = await harness();
  h.open();
  h.submit();
  await h.app.onteardown();
  h.reply();
  h.open();
  await tick();
  assert.equal(h.state(), "disconnected");
  const fresh = await harness();
  fresh.submit();
  assert.equal(fresh.calls.length, 0);
  assert.equal(fresh.state(), "waiting");
});
test("hostDeniedShowsErrorWithoutSuccess and unchanged attempt supports bounded retry", async () => {
  const h = await harness();
  h.open();
  h.submit();
  h.reply({
    isError: true,
    content: [{ type: "text", text: "private-secret" }],
  });
  await tick();
  assert.equal(h.state(), "failed");
  assert.doesNotMatch(h.doc.body.textContent, /private-secret/);
  h.submit();
  h.reply();
  await tick();
  assert.equal(h.state(), "passed");
});
for (const [name, mutate] of [
  ["wrong value", (r) => (r.structuredContent.values.amount = "0")],
  ["extra value", (r) => (r.structuredContent.values.extra = "secret")],
  ["missing value", (r) => delete r.structuredContent.values.enabled],
  ["wrong revision", (r) => (r.structuredContent.configurationRevision = 4)],
  [
    "wrong deadline",
    (r) => (r.structuredContent.expiresAt = "2026-10-10T12:11:00.000Z"),
  ],
  ["wrong version", (r) => (r.structuredContent.versions.ui = "other")],
  ["wrong stage", (r) => (r.structuredContent.stages[0].status = "Unknown")],
  ["extra receipt key", (r) => (r.structuredContent.actor = "private")],
  ["missing receipt", (r) => delete r.structuredContent],
  ["Boolean-only result", (r) => (r.structuredContent = { exactValues: true })],
  [
    "future receipt",
    (r) => (r.structuredContent.checkedAt = "2026-10-10T12:11:00.000Z"),
  ],
])
  test("rejects " + name, async () => {
    const h = await harness();
    h.open();
    h.submit();
    const r = receipt();
    mutate(r);
    h.reply(r);
    await tick();
    assert.equal(h.state(), "failed");
    assert.equal(h.doc.querySelector("#receipt").textContent, "");
  });
test("expiry including in-flight echo makes state stale and disables submit", async () => {
  const h = await harness();
  h.open();
  h.submit();
  h.advance(600000);
  h.reply();
  await tick();
  assert.equal(h.state(), "stale");
  assert.equal(h.button().disabled, true);
});
test("invalid initial metadata invalidates earlier attempt; secrets never render", async () => {
  const h = await harness();
  h.open();
  h.open({
    structuredContent: { ...opening()._meta["cardstack/connectionDiagnostic"] },
  });
  h.submit();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state(), "failed");
});
test("controls reject arbitrary synthetic input without bridge call", async () => {
  const h = await harness();
  h.open();
  h.doc.querySelector("#amount").value = "1";
  h.submit();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state(), "failed");
});
test("receipt binds initial canonical client and version contract", async () => {
  const h = await harness();
  const o = opening();
  o._meta["cardstack/connectionDiagnostic"].client = "chatgpt";
  h.open(o);
  h.submit();
  h.reply();
  await tick();
  assert.equal(h.state(), "failed");
});
test("initial result without client or versions is rejected", async () => {
  for (const key of ["client", "versions"]) {
    const h = await harness();
    const o = opening();
    delete o._meta["cardstack/connectionDiagnostic"][key];
    h.open(o);
    assert.equal(h.state(), "failed");
  }
});
test("bounded retry stops after three denied calls and duplicate initial result cannot reset it", async () => {
  const h = await harness();
  h.open();
  for (let i = 0; i < 3; i++) {
    h.submit();
    h.reply({ isError: true });
    await tick();
    h.open();
  }
  h.submit();
  assert.equal(h.calls.length, 3);
  assert.equal(h.button().disabled, true);
});
test("generated bundle initializes the real pinned SDK and consumes actual JSON-RPC host messages", async () => {
  const html = fs.readFileSync(
    path.join(
      __dirname,
      "../force-app/main/default/staticresources/CardstackConnectionDiagnosticUi.resource",
    ),
    "utf8",
  );
  const outgoing = [],
    logs = [];
  let win, deadline;
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      win = w;
      for (const key of ["debug", "log", "info", "warn", "error"])
        w.console[key] = (...args) => logs.push(args);
      w.ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
      w.fetch = () => {
        throw Error("UI HTTP forbidden");
      };
      w.postMessage = (message) => {
        outgoing.push(message);
        if (message.method === "ui/initialize")
          queueMicrotask(() =>
            w.dispatchEvent(
              new w.MessageEvent("message", {
                source: w,
                data: {
                  jsonrpc: "2.0",
                  id: message.id,
                  result: {
                    protocolVersion: message.params.protocolVersion,
                    hostInfo: { name: "Offline synthetic host", version: "1" },
                    hostCapabilities: { serverTools: {} },
                    hostContext: { theme: "light" },
                  },
                },
              }),
            ),
          );
        if (message.method === "tools/call") {
          const result = receipt(message.params.arguments.values);
          result.content = [];
          result.structuredContent.expiresAt = deadline;
          result.structuredContent.checkedAt = new Date().toISOString();
          result.structuredContent.stages[0].checkedAt =
            result.structuredContent.checkedAt;
          queueMicrotask(() =>
            w.dispatchEvent(
              new w.MessageEvent("message", {
                source: w,
                data: { jsonrpc: "2.0", id: message.id, result },
              }),
            ),
          );
        }
      };
    },
  });
  try {
    await tick();
    await tick();
    assert.ok(outgoing.some((m) => m.method === "ui/initialize"));
    const tool = opening();
    tool._meta["cardstack/connectionDiagnostic"].expiresAt = deadline =
      new Date(Date.now() + 590000).toISOString();
    win.dispatchEvent(
      new win.MessageEvent("message", {
        source: win,
        data: {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: tool,
        },
      }),
    );
    await tick();
    assert.equal(win.document.querySelector("#status").dataset.state, "ready");
    assert.equal(win.document.querySelector("button").disabled, false);
    assert.equal(
      win.document.querySelectorAll("input,select,textarea").length,
      7,
    );
    win.document
      .querySelector("form")
      .dispatchEvent(new win.Event("submit", { cancelable: true }));
    await tick();
    await tick();
    assert.equal(win.document.querySelector("#status").dataset.state, "passed");
    assert.equal(outgoing.filter((m) => m.method === "tools/call").length, 1);
    assert.deepEqual(logs, []);
  } finally {
    win.dispatchEvent(new win.Event("pagehide"));
    dom.window.close();
  }
});
const reverseKeys = (value) =>
  Object.fromEntries(Object.entries(value).reverse());
function reorderedOpening(part) {
  const result = opening();
  const candidate = result._meta["cardstack/connectionDiagnostic"];
  if (part === "top")
    result._meta["cardstack/connectionDiagnostic"] = reverseKeys(candidate);
  else candidate[part] = reverseKeys(candidate[part]);
  return result;
}
for (const part of ["top", "fixture", "versions"]) {
  test(`reordered ${part} metadata cannot reset exhausted submission budget`, async () => {
    const h = await harness();
    h.open();
    for (let i = 0; i < 3; i++) {
      h.submit();
      h.reply({ isError: true });
      await tick();
    }
    assert.equal(h.button().disabled, true);
    h.open(reorderedOpening(part));
    h.submit();
    assert.equal(h.calls.length, 3);
    assert.equal(h.button().disabled, true);
  });
  test(`reordered ${part} metadata preserves in-flight echo and its receipt`, async () => {
    const h = await harness();
    h.open();
    h.submit();
    h.open(reorderedOpening(part));
    assert.equal(h.state(), "submitting");
    assert.equal(h.button().disabled, true);
    h.reply();
    await tick();
    assert.equal(h.state(), "passed");
    assert.deepEqual(
      JSON.parse(h.doc.querySelector("#receipt").textContent).values,
      values,
    );
  });
}
for (const previousState of ["ready", "passed"]) {
  test(`errored identical initial metadata invalidates ${previousState} state`, async () => {
    const h = await harness();
    h.open();
    if (previousState === "passed") {
      h.submit();
      h.reply();
      await tick();
    }
    assert.equal(h.state(), previousState);
    h.open({ ...opening(), isError: true });
    assert.equal(h.state(), "failed");
    assert.equal(h.button().disabled, true);
    assert.equal(h.doc.querySelector("#receipt").textContent, "");
  });
}
test("errored identical initial metadata invalidates an in-flight reply", async () => {
  const h = await harness();
  h.open();
  h.submit();
  h.open({ ...opening(), isError: true });
  h.reply();
  await tick();
  assert.equal(h.state(), "failed");
  assert.equal(h.button().disabled, true);
  assert.equal(h.doc.querySelector("#receipt").textContent, "");
});
test("invalid then valid metadata for the same attempt does not replenish retries", async () => {
  const h = await harness();
  h.open();
  for (let i = 0; i < 3; i++) {
    h.submit();
    h.reply({ isError: true });
    await tick();
  }
  h.open({ ...opening(), isError: true });
  h.open(reorderedOpening("versions"));
  h.submit();
  assert.equal(h.calls.length, 3);
  assert.equal(h.button().disabled, true);
});
