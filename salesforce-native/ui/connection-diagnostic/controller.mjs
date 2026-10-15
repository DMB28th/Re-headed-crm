// No HTTP, credentials, storage or logging. Attempt secrets exist only in this closure.
const FIXTURE = Object.freeze({
  text: 'café ✓ "quoted"',
  amount: 0,
  accepted: false,
  choice: "beta",
  rating: "hot",
  notes: "first\nsecond",
  enabled: false,
});
const VERSIONS = Object.freeze({
  package: "0.1.0.8",
  transport: "cardstack/v1",
  ui: "mcp-apps/v1",
  permissionPolicy: "1",
});
const URI = "ui://cardstack/connection-diagnostic-v1.html";
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const keys = (x, expected) =>
  object(x) &&
  Object.keys(x).sort().join(",") === [...expected].sort().join(",");
const equal = (x, y) =>
  keys(x, Object.keys(y)) && Object.keys(y).every((k) => x[k] === y[k]);
const validValues = (x) =>
  keys(x, Object.keys(FIXTURE)) &&
  Object.keys(FIXTURE).every(
    (k) => x[k] === FIXTURE[k] || (k === "text" && x[k] === ""),
  );
const date = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x) &&
  Number.isFinite(Date.parse(x));
function validOpen(x, now) {
  return (
    keys(x, [
      "attemptKey",
      "challenge",
      "expiresAt",
      "configurationRevision",
      "resourceUri",
      "fixture",
      "client",
      "versions",
    ]) &&
    /^[a-f0-9]{64}$/.test(x.attemptKey) &&
    /^[a-f0-9]{64}$/.test(x.challenge) &&
    date(x.expiresAt) &&
    Date.parse(x.expiresAt) > now &&
    Date.parse(x.expiresAt) <= now + 600000 &&
    Number.isSafeInteger(x.configurationRevision) &&
    x.configurationRevision > 0 &&
    ["claude", "chatgpt"].includes(x.client) &&
    equal(x.versions, VERSIONS) &&
    x.resourceUri === URI &&
    equal(x.fixture, FIXTURE)
  );
}
function sameOpen(left, right) {
  return (
    [
      "attemptKey",
      "challenge",
      "configurationRevision",
      "resourceUri",
      "client",
    ].every((key) => left[key] === right[key]) &&
    Date.parse(left.expiresAt) === Date.parse(right.expiresAt) &&
    equal(left.fixture, right.fixture) &&
    equal(left.versions, right.versions)
  );
}
function validReceipt(r, a, v) {
  if (
    !keys(r, [
      "values",
      "client",
      "versions",
      "expiresAt",
      "reference",
      "configurationRevision",
      "checkedAt",
      "exactValues",
      "stages",
    ]) ||
    !equal(r.values, v) ||
    r.client !== a.client ||
    !equal(r.versions, a.versions) ||
    r.configurationRevision !== a.configurationRevision ||
    !date(r.expiresAt) ||
    Date.parse(r.expiresAt) !== Date.parse(a.expiresAt) ||
    r.exactValues !== true ||
    !/^check_[a-f0-9]{64}$/.test(r.reference) ||
    !date(r.checkedAt) ||
    Date.parse(r.checkedAt) >= Date.parse(a.expiresAt) ||
    Date.parse(r.checkedAt) < Date.parse(a.expiresAt) - 600000
  )
    return false;
  const stages = r.stages;
  if (
    !Array.isArray(stages) ||
    stages.length !== 3 ||
    stages.some(
      (s) => !keys(s, ["stage", "status", "source", "checkedAt", "errorCode"]),
    )
  )
    return false;
  return (
    stages[0].stage === "diagnosticExchange" &&
    stages[0].status === "Pass" &&
    stages[0].source === "Server exact typed echo" &&
    stages[0].checkedAt === r.checkedAt &&
    stages[0].errorCode === null &&
    stages[1].stage === "htmlLoading" &&
    stages[1].status === "Unknown" &&
    stages[1].source === "No HTML-loading evidence" &&
    stages[1].checkedAt === null &&
    stages[1].errorCode === null &&
    stages[2].stage === "clientUiObserved" &&
    stages[2].source === "Operator observation" &&
    stages[2].errorCode === null &&
    ((stages[2].status === "Unknown" && stages[2].checkedAt === null) ||
      (stages[2].status === "Pass" && date(stages[2].checkedAt)))
  );
}
export function mountDiagnostic(
  app,
  document,
  {
    now = () => Date.now(),
    setInterval: repeat = globalThis.setInterval,
    clearInterval: cancel = globalThis.clearInterval,
    hostStyles = () => {},
  } = {},
) {
  const form = document.querySelector("form"),
    button = form.querySelector("button"),
    status = document.querySelector("#status"),
    output = document.querySelector("#receipt");
  let connected = false,
    closed = false,
    attempt = null,
    generation = 0,
    state = "waiting",
    submissions = 0,
    lastAttemptKey = null;
  const messages = {
    waiting: "Waiting for the host and initial result.",
    ready: "Host bridge ready. Send the synthetic fixture.",
    submitting: "Waiting for the exact-value receipt…",
    passed: "Exact API exchange passed. Client observation remains separate.",
    failed:
      "Exchange failed. Check the fixture and retry, or open a fresh diagnostic.",
    disconnected: "Host disconnected. Open a fresh diagnostic.",
    stale: "Attempt expired. Open a fresh diagnostic.",
  };
  function render(next) {
    state = next;
    status.dataset.state = next;
    status.textContent = messages[next];
    button.disabled =
      !connected ||
      !attempt ||
      !["ready", "failed"].includes(next) ||
      submissions >= 3;
    for (const control of form.querySelectorAll("input,select,textarea"))
      control.disabled = [
        "submitting",
        "passed",
        "disconnected",
        "stale",
      ].includes(next);
  }
  function expire() {
    if (!closed && attempt && Date.parse(attempt.expiresAt) <= now()) {
      generation++;
      attempt = null;
      output.textContent = "";
      render("stale");
    }
  }
  const timer = repeat(expire, 1000);
  function disconnect() {
    closed = true;
    connected = false;
    attempt = null;
    generation++;
    cancel(timer);
    output.textContent = "";
    render("disconnected");
  }
  app.ontoolresult = (result) => {
    if (closed) return;
    const candidate = result?._meta?.["cardstack/connectionDiagnostic"];
    // Validate the envelope before deduplication: an error revokes readiness and
    // invalidates pending callbacks, even when it repeats previously valid metadata.
    if (result?.isError || !validOpen(candidate, now())) {
      generation++;
      attempt = null;
      output.textContent = "";
      render("failed");
      return;
    }
    // JSON object order is not part of the contract. Semantic duplicates preserve
    // both the pending exchange and its bounded retry budget.
    if (attempt && sameOpen(candidate, attempt)) return;
    generation++;
    output.textContent = "";
    if (candidate.attemptKey !== lastAttemptKey) {
      submissions = 0;
      lastAttemptKey = candidate.attemptKey;
    }
    attempt = JSON.parse(JSON.stringify(candidate));
    for (const [key, value] of Object.entries(FIXTURE)) {
      const input = document.querySelector("#" + key);
      if (input.type === "checkbox") input.checked = value;
      else input.value = value;
    }
    render(connected ? "ready" : "waiting");
  };
  app.onhostcontextchanged = (context) => {
    if (!closed) hostStyles(context);
  };
  app.onclose = disconnect;
  app.onerror = () => {
    if (!closed) {
      generation++;
      output.textContent = "";
      render("failed");
    }
  };
  app.onteardown = async () => {
    disconnect();
    return {};
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    expire();
    if (closed || button.disabled || !attempt) return;
    const values = {};
    for (const key of Object.keys(FIXTURE)) {
      const input = document.querySelector("#" + key);
      values[key] =
        input.type === "checkbox"
          ? input.checked
          : key === "amount"
            ? input.value === ""
              ? null
              : Number(input.value)
            : input.value;
    }
    if (!validValues(values)) {
      render("failed");
      return;
    }
    const current = generation,
      submitted = attempt;
    submissions++;
    output.textContent = "";
    render("submitting");
    try {
      const result = await app.callServerTool(
        {
          name: "cardstack_connection_echo",
          arguments: {
            attemptKey: submitted.attemptKey,
            challenge: submitted.challenge,
            values,
          },
        },
        {
          timeout: 15000,
          maxTotalTimeout: 15000,
          resetTimeoutOnProgress: false,
        },
      );
      expire();
      if (closed || current !== generation) return;
      if (
        result?.isError ||
        !validReceipt(result?.structuredContent, submitted, values)
      ) {
        render("failed");
        return;
      }
      // Only the validated receipt is rendered; never content, errors, or _meta.
      output.textContent = JSON.stringify(result.structuredContent, null, 2);
      render("passed");
    } catch {
      if (!closed && current === generation) {
        expire();
        if (attempt) render("failed");
      }
    }
  });
  render("waiting");
  Promise.resolve()
    .then(() =>
      app.connect(undefined, {
        timeout: 15000,
        maxTotalTimeout: 15000,
        resetTimeoutOnProgress: false,
      }),
    )
    .then(() => {
      if (closed) return;
      connected = true;
      hostStyles(app.getHostContext?.() || {});
      expire();
      if (state !== "stale") render(attempt ? "ready" : state);
    })
    .catch(disconnect);
  return { disconnect };
}
