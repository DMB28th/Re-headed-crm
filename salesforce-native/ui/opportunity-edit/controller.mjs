import { validateChanges, draftsFromFields } from "./fields.mjs";
import { key } from "./contract.mjs";
import { opportunityAdapter, recordAdapter } from "./adapters.mjs";
import { createDeliveryQa } from "./delivery-qa.mjs";
import { publicFlowView, flowAnswers } from "./flow-contract.mjs";
import {
  publicRelatedDefinitions,
  publicRelatedPage,
} from "./related-contract.mjs";
import { renderScreen } from "./view.mjs";
// Private interaction/grant, interview identity and request counters remain in this closure.
function mountEditor(
  app,
  document,
  adapter,
  {
    now = () => Date.now(),
    setInterval: repeat = globalThis.setInterval,
    clearInterval: cancel = globalThis.clearInterval,
    hostStyles = () => {},
    deliveryQaEnabled = false,
  } = {},
) {
  const qaEnabled =
    typeof CARDSTACK_DELIVERY_QA === "undefined"
      ? deliveryQaEnabled === true
      : CARDSTACK_DELIVERY_QA;
  const deliveryQa = qaEnabled
    ? createDeliveryQa(app, { enabled: true })
    : null;
  if (deliveryQa) app = deliveryQa.app;
  let stopQaSubscription = () => {};
  const { recordId } = adapter;
  let activeAdapter = adapter,
    TOOLS = adapter.tools,
    privateMetaKey = adapter.privateMetaKey;
  function selectAdapter(selected) {
    activeAdapter = selected;
    TOOLS = selected.tools;
    privateMetaKey = selected.privateMetaKey;
  }
  function adapterView(raw, selected = activeAdapter) {
    const view =
      selected.tools.flowStart && raw?.contractVersion === "screen-flow/v1"
        ? publicFlowView(raw)
        : selected.publicView(raw);
    return selected === opportunityAdapter && view.recordId
      ? { ...view, objectApiName: "Opportunity" }
      : view;
  }
  const publicView = (raw) => adapterView(raw);
  let activeFlow = false;
  let flowAnswerScheduled = false,
    queuedFlowDrafts = null,
    lastFlowAnswerSignature = null;
  const root = document.querySelector("#root");
  let connected = false,
    closed = false,
    generation = 0,
    requestGeneration = 0,
    identity = null,
    objectIdentity = null,
    interaction = null,
    grant = null,
    busy = false;
  let workspaceEpoch = 0;
  let model = { status: "Waiting" },
    drafts = {},
    fieldTypes = {};
  let pendingStatus = null,
    discovery = null,
    related = null,
    breadcrumb = null;
  const relatedCursors = new Map();
  const relatedPending = new Set(),
    relatedRequests = new Map();
  let relatedRequestSequence = 0;
  const retired = new Set();
  const messages = {
    Waiting: "Waiting for the host and current record.",
    Card: "Record snapshot. Refresh for current values.",
    Discovery: "Choose a record to open. Refine your search if needed.",
    Editing: "Enter changes, then review the exact server diff.",
    Review: "Review the server changes before confirming.",
    Preparing: "Preparing server review…",
    Pending: "Checking the latest server state…",
    Refreshing: "Reading the current Salesforce record…",
    Saving:
      "Saving the reviewed changes. Check status if the response is interrupted.",
    Completed: "Completion receipt. Refresh to read the current record.",
    Unknown:
      "Save or request status unknown. Check the latest server state before retrying.",
    Recoverable:
      "Host supplied an interaction. Check its latest server state before continuing.",
    Unavailable:
      "This interaction cannot be recovered without host-provided private state. Reopen the card; a prior save may have completed.",
    Cancelled: "Edit cancelled.",
    Expired: "Edit expired. Refresh before starting again.",
    Conflict:
      "The record or edit context changed. Refresh and start a new edit.",
    Rejected: "Editing unavailable. Refresh or reconnect before continuing.",
    Disconnected: "Host disconnected. Reopen the app and check server status.",
  };
  function render(extra = {}) {
    const ready = connected && !closed && !busy;
    renderScreen(
      root,
      {
        ...model,
        workspaceKey: workspaceEpoch,
        busyStatus: busy ? pendingStatus : null,
        drafts,
        fieldTypes,
        ready,
        supportsRelated: !!TOOLS.relatedDefinitions,
        related,
        relatedPending: [...relatedPending],
        breadcrumb,
        deliveryQa: deliveryQa?.state(),
        qaReady: connected && !closed && !busy,
        qaCanOpen:
          connected &&
          !closed &&
          !busy &&
          ["Card", "Waiting", "Discovery", "Rejected"].includes(model.status),
        editable: ready && model.status === "Editing",
        canConfirm:
          ready &&
          model.status === "Review" &&
          !!grant &&
          !!interaction &&
          Date.parse(model.expiresAt) > now(),
        message:
          !busy && model.flow && model.status === "Editing"
            ? "Complete this screen, then choose Next."
            : messages[busy ? pendingStatus : model.status],
        ...extra,
      },
      {
        launch: start,
        choose: choose,
        search: search,
        related: loadRelated,
        relatedPage: loadRelatedPage,
        relatedChild: openRelatedChild,
        parent: returnToParent,
        "qa-discard": () => {
          if (connected && !closed && !busy) deliveryQa?.armDiscardConfirm();
        },
        "qa-hold": () => {
          if (connected && !closed && !busy) deliveryQa?.armHoldRelatedPage();
        },
        "qa-release": () => deliveryQa?.release(),
        "qa-reset": () => deliveryQa?.reset(),
        qaOpen: openQaRecord,
        review: review,
        answer: scheduleFlowAnswer,
        confirm: () => transition("confirm"),
        back: () => transition("back"),
        cancel: () => transition("cancel"),
        resume: () => transition("resume"),
        refresh,
      },
    );
  }
  function revoke() {
    workspaceEpoch++;
    if (interaction) retired.add(interaction);
    interaction = null;
    activeFlow = false;
    queuedFlowDrafts = null;
    lastFlowAnswerSignature = null;
    grant = null;
    drafts = {};
    fieldTypes = {};
  }
  function reset(record = null) {
    generation++;
    requestGeneration++;
    busy = false;
    revoke();
    identity = record;
    selectAdapter(adapter);
    objectIdentity = null;
    discovery = null;
    related = null;
    breadcrumb = null;
    relatedCursors.clear();
    relatedPending.clear();
    relatedRequests.clear();
    model = { status: "Waiting" };
  }
  function unknown() {
    busy = false;
    grant = null;
    model = {
      ...model,
      status: interaction ? "Unknown" : "Unavailable",
      errors: [],
      diff: [],
      receipt: null,
      currentCard: null,
    };
    render({ focusHeading: true });
  }
  function refreshFailure(
    message = "Completion is known. Current record refresh failed; retry refresh.",
  ) {
    busy = false;
    model = { ...model, status: "Completed", refreshing: false };
    render({ message });
  }
  function unavailable() {
    busy = false;
    revoke();
    model = { status: "Unavailable" };
    render();
  }
  function expire() {
    if (
      closed ||
      (busy && pendingStatus === "Saving") ||
      ["Saving", "Unknown", "Completed", "Recoverable"].includes(model.status)
    )
      return;
    if (model.expiresAt && Date.parse(model.expiresAt) <= now()) {
      // A dispatched review can complete a no-op interaction; obtain server status.
      if (busy) {
        unknown();
        return;
      }
      grant = null;
      model = { status: "Expired", recordId: identity };
      render();
    }
  }
  function accept(
    result,
    { host = false, operation = null, expectedKey = null } = {},
  ) {
    let view;
    try {
      view = publicView(result?.structuredContent);
    } catch {
      if (host) unavailable();
      else unknown();
      return false;
    }
    if (view.status === "Discovery") {
      revoke();
      identity = null;
      objectIdentity = null;
      discovery = view;
      model = view;
      render({ focusHeading: true });
      return true;
    }
    if (identity && view.recordId && identity !== view.recordId) return false;
    if (
      objectIdentity &&
      view.objectApiName &&
      objectIdentity !== view.objectApiName
    )
      return false;
    if (view.objectApiName) objectIdentity = view.objectApiName;
    if (
      interaction &&
      ["Editing", "Review", "Completed"].includes(view.status) &&
      activeFlow !== !!view.flow
    ) {
      unknown();
      return false;
    }
    const selectedMetaKey = view.flow ? "cardstack/flowEdit" : privateMetaKey;
    const privateMeta = result?._meta?.[selectedMetaKey];
    const serialized = JSON.stringify(view);
    if (
      [
        interaction,
        grant,
        privateMeta?.interactionKey,
        privateMeta?.reviewGrant,
      ]
        .filter(key)
        .some((secret) => serialized.includes(secret))
    ) {
      if (host) unavailable();
      else unknown();
      return false;
    }
    if (
      view.status === "Rejected" &&
      view.errors.some((e) => e.code === "OUTCOME_UNAVAILABLE")
    ) {
      unknown();
      return false;
    }
    if (
      result?.isError &&
      !["Editing", "Rejected", "Conflict", "Expired"].includes(view.status)
    ) {
      unknown();
      return false;
    }
    if (view.status === "Card") {
      identity = view.recordId;
      if (model.status === "Completed" && !host) {
        // A restored receipt has no type metadata until a checked current read.
        if (!Object.keys(fieldTypes).length)
          fieldTypes = Object.fromEntries(
            view.fields.map((field) => [
              field.fieldApi,
              { dataType: field.dataType },
            ]),
          );
        model = { ...model, currentCard: view, refreshing: false };
        render();
        return true;
      }
      revoke();
      related = null;
      relatedCursors.clear();
      fieldTypes = Object.fromEntries(
        view.fields.map((field) => [
          field.fieldApi,
          { dataType: field.dataType },
        ]),
      );
      model = view;
      render();
      return true;
    }
    if (["Rejected", "Conflict"].includes(view.status)) {
      revoke();
      model = { status: view.status, errors: view.errors };
      render({ focusHeading: true });
      return true;
    }
    const metadata = result?._meta?.[selectedMetaKey];
    const candidate = metadata?.interactionKey;
    if (["Editing", "Review", "Completed"].includes(view.status)) {
      if (
        !key(candidate) ||
        retired.has(candidate) ||
        (expectedKey && candidate !== expectedKey)
      ) {
        if (host) unavailable();
        else unknown();
        return false;
      }
      if (view.status === "Review" && !key(metadata.reviewGrant)) {
        if (host) unavailable();
        else unknown();
        return false;
      }
      if (view.status !== "Review" && metadata.reviewGrant != null) {
        if (host) unavailable();
        else unknown();
        return false;
      }
    }
    activeFlow = !!view.flow;
    // Display types come only from accepted public descriptors, never field names or values.
    if (candidate && candidate !== interaction) {
      fieldTypes = {};
      workspaceEpoch++;
    }
    if (view.fields.length)
      fieldTypes = Object.fromEntries(
        view.fields.map((field) => [
          field.fieldApi,
          { dataType: field.dataType },
        ]),
      );
    if (host) {
      if (view.status === "Completed") {
        interaction = candidate;
        identity = view.recordId;
        grant = null;
        model = view;
        render({ focusHeading: true });
        return true;
      }
      if (!key(candidate)) {
        unavailable();
        return false;
      }
      interaction = candidate;
      identity = view.recordId;
      grant = null;
      model = {
        status: "Recoverable",
        recordName: view.recordName,
        objectApiName: view.objectApiName,
        revision: view.revision,
        flow: view.flow,
      };
      render();
      return true;
    }
    identity = view.recordId || identity;
    interaction = candidate || interaction;
    grant = view.status === "Review" ? metadata.reviewGrant : null;
    if (["Cancelled", "Expired"].includes(view.status)) {
      revoke();
    }
    if (view.status === "Editing" && operation === "start") drafts = {};
    // Restored Review has no local form draft. Back projects its retained answers
    // into descriptors; reconstruct only when no local map exists, preserving Keep.
    if (
      view.status === "Editing" &&
      (operation === "resume" ||
        (operation === "back" &&
          (view.flow || Object.keys(drafts).length === 0)))
    ) {
      drafts = view.flow ? {} : draftsFromFields(view.fields);
      if (view.flow) lastFlowAnswerSignature = null;
    }
    if (view.flow && view.status === "Editing" && operation === "answer") {
      const visible = new Set(view.fields.map((field) => field.fieldApi));
      drafts = Object.fromEntries(
        Object.entries(drafts).filter(([api]) => visible.has(api)),
      );
      lastFlowAnswerSignature = null;
    }
    const previousStatus = model.status;
    model = view;
    render({
      focusHeading: view.status !== previousStatus,
      focusError: view.errors.length > 0,
    });
    expire();
    return true;
  }
  async function dispatchRelatedPage(name, args) {
    if (
      closed ||
      !connected ||
      model.status !== "Card" ||
      relatedPending.has(args.listKey)
    )
      return;
    const epoch = generation,
      rootRequest = requestGeneration,
      record = identity,
      request = ++relatedRequestSequence;
    relatedRequests.set(args.listKey, request);
    relatedPending.add(args.listKey);
    render();
    const current = () =>
      !closed &&
      epoch === generation &&
      rootRequest === requestGeneration &&
      record === identity &&
      model.status === "Card" &&
      relatedRequests.get(args.listKey) === request;
    try {
      const result = await app.callServerTool(
        { name, arguments: args },
        {
          timeout: 15000,
          maxTotalTimeout: 15000,
          resetTimeoutOnProgress: false,
        },
      );
      if (!current()) return;
      relatedPending.delete(args.listKey);
      acceptRelated(result, "relatedPage", args);
    } catch {
      if (!current()) return;
      relatedPending.delete(args.listKey);
      relatedFailure();
    } finally {
      if (relatedRequests.get(args.listKey) === request) {
        relatedRequests.delete(args.listKey);
        relatedPending.delete(args.listKey);
      }
    }
  }
  async function dispatch(name, args, operation) {
    if (operation === "relatedPage") return dispatchRelatedPage(name, args);
    if (busy || closed || !connected) return;
    const epoch = generation,
      request = ++requestGeneration,
      record = identity,
      interview = interaction;
    busy = true;
    pendingStatus =
      operation === "confirm"
        ? "Saving"
        : operation === "review"
          ? "Preparing"
          : operation === "refresh"
            ? "Refreshing"
            : "Pending";
    if (operation === "refresh" && model.status === "Completed")
      model = { ...model, refreshing: true };
    render();
    try {
      const result = await app.callServerTool(
        { name, arguments: args },
        {
          timeout: 15000,
          maxTotalTimeout: 15000,
          resetTimeoutOnProgress: false,
        },
      );
      if (
        closed ||
        epoch !== generation ||
        request !== requestGeneration ||
        record !== identity ||
        interview !== interaction
      )
        return;
      busy = false;
      if (operation === "relatedDefinitions" || operation === "relatedPage") {
        acceptRelated(result, operation, args);
        return;
      }
      if (
        operation === "relatedChild" ||
        operation === "parent" ||
        operation === "qaOpen"
      ) {
        const expectedId =
          operation === "relatedChild" ? args.childId : args.recordId;
        let card, nextAdapter;
        try {
          const raw = result?.structuredContent;
          // Only an awaited checked navigation can adopt another installed family.
          if (raw?.contractVersion === "opportunity-card/v1")
            nextAdapter = opportunityAdapter;
          else if (raw?.contractVersion === "record-card/v1")
            nextAdapter = recordAdapter;
          else throw Error("UNSUPPORTED_CARD_FAMILY");
          card = adapterView(raw, nextAdapter);
        } catch {
          card = null;
        }
        if (
          result?.isError ||
          card?.status !== "Card" ||
          card.recordId !== expectedId
        ) {
          if (operation === "qaOpen") {
            model = { status: "Rejected", errors: [] };
            render({
              message:
                "Record could not be opened through the selected native family.",
            });
          } else relatedFailure();
          return;
        }
        const parent =
          operation === "relatedChild"
            ? {
                recordId: identity,
                recordName: model.recordName,
                family:
                  activeAdapter === opportunityAdapter
                    ? "opportunity"
                    : "record",
              }
            : null;
        reset(expectedId);
        selectAdapter(nextAdapter);
        breadcrumb = parent;
        accept(result);
        return;
      }
      if (
        operation === "open" &&
        (result?.isError ||
          result?.structuredContent?.contractVersion !== "record-card/v1")
      ) {
        const previous = discovery;
        reset();
        discovery = previous;
        model = previous || { status: "Unavailable" };
        render({
          message:
            "This record could not be opened. Search again or choose another record.",
        });
        return;
      }
      if (operation === "refresh" && model.receipt) {
        let fresh;
        try {
          fresh = publicView(result?.structuredContent);
        } catch {
          fresh = null;
        }
        const denied =
          fresh?.status === "Rejected" &&
          !fresh.errors.some((e) => e.code === "OUTCOME_UNAVAILABLE");
        if (
          !denied &&
          (result?.isError ||
            fresh?.status !== "Card" ||
            fresh.recordId !== identity)
        ) {
          model = { ...model, status: "Completed", refreshing: false };
          render({
            message:
              "Completion is known. Current record refresh failed; retry refresh.",
          });
          return;
        }
      }
      if (
        !accept(result, {
          operation,
          expectedKey: operation === "start" ? null : interview,
        }) &&
        identity === record &&
        model.status !== "Unknown" &&
        model.status !== "Unavailable"
      )
        unknown();
    } catch {
      if (
        closed ||
        epoch !== generation ||
        request !== requestGeneration ||
        record !== identity ||
        interview !== interaction
      )
        return;
      busy = false;
      if (operation === "refresh" && model.receipt) {
        model = { ...model, status: "Completed", refreshing: false };
        render({
          message:
            "Completion is known. Current record refresh failed; retry refresh.",
        });
      } else if (operation.startsWith("related") || operation === "parent") {
        relatedFailure();
      } else if (operation === "open" && discovery) {
        const previous = discovery;
        reset();
        discovery = previous;
        model = previous;
        render({
          message:
            "Open response unavailable. Search again or choose a record.",
        });
      } else unknown();
    }
  }
  function openQaRecord(selectedId, family = "record") {
    if (
      !deliveryQa ||
      !connected ||
      closed ||
      busy ||
      !["Card", "Waiting", "Discovery", "Rejected"].includes(model.status)
    )
      return;
    if (
      !recordAdapter.recordId(selectedId) ||
      !["record", "opportunity"].includes(family)
    ) {
      render({
        message: "Enter a valid full 18-character Salesforce record ID.",
      });
      return;
    }
    const selected =
      family === "opportunity" ? opportunityAdapter : recordAdapter;
    reset(selectedId);
    selectAdapter(selected);
    dispatch(selected.tools.open, { recordId: selectedId }, "qaOpen");
  }
  function relatedFailure() {
    busy = false;
    relatedCursors.clear();
    breadcrumb = null;
    related = {
      ...(related || { lists: [] }),
      pages: {},
      error: "Related records unavailable. Retry or refresh the record.",
    };
    render();
  }
  function acceptRelated(result, operation, args) {
    try {
      if (result?.isError) throw Error("RELATED_UNAVAILABLE");
      if (operation === "relatedDefinitions") {
        const checked = publicRelatedDefinitions(result.structuredContent);
        if (
          checked.parent.recordId !== identity ||
          checked.parent.objectApiName !== objectIdentity
        )
          throw Error("RELATED_UNAVAILABLE");
        relatedCursors.clear();
        related = { ...checked, pages: {} };
        render();
        return;
      }
      const page = publicRelatedPage(result.structuredContent);
      const definition = related?.lists.find(
        (list) => list.listKey === args.listKey,
      );
      const meta = result?._meta?.["cardstack/related"];
      if (
        !definition ||
        page.parent.recordId !== identity ||
        page.parent.objectApiName !== objectIdentity ||
        page.listKey !== args.listKey ||
        page.definitionFingerprint !== definition.definitionFingerprint ||
        JSON.stringify(page.columns) !== JSON.stringify(definition.columns) ||
        page.rows.length > definition.pageSize ||
        !meta ||
        meta.parentId !== identity ||
        meta.listKey !== args.listKey ||
        meta.definitionFingerprint !== page.definitionFingerprint ||
        (page.hasMore &&
          (typeof meta.nextCursor !== "string" ||
            !meta.nextCursor ||
            meta.nextCursor.length > 2048)) ||
        (!page.hasMore && meta.nextCursor != null)
      )
        throw Error("RELATED_UNAVAILABLE");
      relatedCursors.set(args.listKey, page.hasMore ? meta.nextCursor : null);
      related = {
        ...related,
        error: null,
        pages: { ...related.pages, [args.listKey]: page },
      };
      render();
    } catch {
      relatedFailure();
    }
  }
  function loadRelated() {
    if (model.status !== "Card" || !TOOLS.relatedDefinitions || !identity)
      return;
    dispatch(
      TOOLS.relatedDefinitions,
      { parentId: identity },
      "relatedDefinitions",
    );
  }
  function loadRelatedPage(listKey, next = false) {
    if (
      model.status !== "Card" ||
      !related?.lists.some((list) => list.listKey === listKey)
    )
      return;
    const cursor = next ? relatedCursors.get(listKey) : null;
    if (next && !cursor) return;
    dispatch(
      TOOLS.relatedPage,
      { parentId: identity, listKey, ...(cursor ? { cursor } : {}) },
      "relatedPage",
    );
  }
  function openRelatedChild(listKey, childId) {
    if (
      model.status !== "Card" ||
      !related?.pages[listKey]?.rows.some((row) => row.recordId === childId)
    )
      return;
    dispatch(
      TOOLS.relatedOpenChild,
      { parentId: identity, listKey, childId },
      "relatedChild",
    );
  }
  function returnToParent() {
    if (model.status !== "Card" || !breadcrumb || !TOOLS.open) return;
    const parentAdapter =
      breadcrumb.family === "opportunity" ? opportunityAdapter : recordAdapter;
    dispatch(
      parentAdapter.tools.open,
      { recordId: breadcrumb.recordId },
      "parent",
    );
  }
  function choose(selectedId) {
    if (
      model.status !== "Discovery" ||
      busy ||
      !discovery?.candidates.some((row) => row.recordId === selectedId)
    )
      return;
    const previous = discovery;
    reset(selectedId);
    discovery = previous;
    model = previous;
    dispatch(TOOLS.open, { recordId: selectedId }, "open");
  }
  function search(query, objectApiName) {
    if (
      !TOOLS.search ||
      busy ||
      typeof query !== "string" ||
      !query.trim() ||
      query.length > 160
    )
      return;
    reset();
    dispatch(
      TOOLS.search,
      { query, ...(objectApiName ? { objectApiName } : {}) },
      "search",
    );
  }
  function start(actionName) {
    if (
      model.status !== "Card" ||
      !model.actions.some((a) => a.name === actionName) ||
      !identity ||
      busy
    )
      return;
    drafts = {};
    const action = model.actions.find((a) => a.name === actionName);
    activeFlow = action.type === "screen-flow";
    dispatch(
      activeFlow ? TOOLS.flowStart : TOOLS.start,
      { recordId: identity, actionName },
      "start",
    );
  }
  function changedFlowAnswers(changes) {
    return changes.filter(
      (change) =>
        change.operation !== "set" ||
        model.fields.find((field) => field.fieldApi === change.fieldApi)
          ?.value !== change.value,
    );
  }
  function scheduleFlowAnswer(localDrafts, inputId) {
    if (
      !activeFlow ||
      model.status !== "Editing" ||
      !model.screen?.needsAnswerRefresh ||
      busy
    )
      return;
    if (!model.fields.some((field) => field.fieldApi === inputId)) return;
    queuedFlowDrafts = { drafts: localDrafts, inputId };
    if (flowAnswerScheduled) return;
    flowAnswerScheduled = true;
    const epoch = generation;
    Promise.resolve().then(() => {
      flowAnswerScheduled = false;
      if (epoch !== generation || busy || closed || model.status !== "Editing")
        return;
      const pending = queuedFlowDrafts;
      queuedFlowDrafts = null;
      const parsed = validateChanges(
        model.fields.filter((field) => field.fieldApi === pending.inputId),
        pending.drafts,
      );
      if (parsed.errors.length) {
        model = { ...model, errors: parsed.errors };
        render();
        return;
      }
      const changes = changedFlowAnswers(parsed.changes),
        signature = JSON.stringify(changes);
      if (!changes.length || signature === lastFlowAnswerSignature) return;
      lastFlowAnswerSignature = signature;
      drafts = pending.drafts;
      transition("answer", changes);
    });
  }
  function review(localDrafts) {
    if (model.status !== "Editing" || busy) return;
    expire();
    if (model.status !== "Editing") return;
    drafts = localDrafts;
    const parsed = validateChanges(model.fields, drafts);
    if (parsed.errors.length) {
      model = { ...model, errors: parsed.errors };
      render({ focusError: true });
      return;
    }
    if (activeFlow && model.screen?.needsAnswerRefresh) {
      const changes = changedFlowAnswers(parsed.changes);
      if (changes.length) {
        lastFlowAnswerSignature = JSON.stringify(changes);
        transition("answer", changes);
        return;
      }
    }
    transition(activeFlow ? "next" : "review", parsed.changes);
  }
  function transition(operation, changes) {
    if (closed || busy || !connected || !interaction) return;
    expire();
    const allowed =
      operation === "resume"
        ? ["Unknown", "Recoverable"]
        : operation === "confirm"
          ? ["Review"]
          : operation === "back"
            ? activeFlow
              ? ["Editing", "Review"]
              : ["Review"]
            : operation === "cancel"
              ? ["Editing", "Review"]
              : ["Editing"];
    if (!allowed.includes(model.status)) return;
    if (
      activeFlow &&
      ((operation === "next" && !model.screen?.canNext) ||
        (operation === "back" && !model.screen?.canBack) ||
        (operation === "cancel" && model.screen && !model.screen.canCancel))
    )
      return;
    const args = { interactionKey: interaction, operation };
    if (operation !== "resume" || activeFlow)
      args.expectedRevision = model.revision;
    if (operation === "review") args.changes = changes;
    if (activeFlow && ["next", "answer"].includes(operation))
      args.answers = flowAnswers(model, changes);
    if (operation === "confirm") {
      if (!grant || Date.parse(model.expiresAt) <= now()) return;
      args.reviewRevision = model.reviewRevision;
      args.reviewGrant = grant;
    }
    // Revoke the grant before Back/Cancel/Confirm is dispatched; only a fresh result restores it.
    grant = null;
    dispatch(
      activeFlow ? TOOLS.flowTransition : TOOLS.transition,
      args,
      operation,
    );
  }
  function refresh() {
    if (!identity || busy || !connected || closed) return;
    dispatch(TOOLS.refresh, { recordId: identity }, "refresh");
  }
  function disconnect() {
    if (closed) return;
    closed = true;
    connected = false;
    generation++;
    requestGeneration++;
    busy = false;
    revoke();
    cancel(timer);
    stopQaSubscription();
    deliveryQa?.dispose();
    model = { status: "Disconnected" };
    render();
  }
  app.ontoolinput = ({ arguments: args }) => {
    if (closed) return;
    // A complete new host input is an explicit context boundary, including the same record.
    if (TOOLS.search && typeof args?.query === "string") {
      reset();
      render();
    } else if (args?.recordId) {
      reset(recordId(args.recordId) ? args.recordId : null);
      render();
    }
  };
  app.ontoolresult = (result) => {
    if (closed) return;
    const raw = result?.structuredContent;
    // App-only related reads progress through their awaited call, never an unsolicited SDK notification.
    if (
      typeof raw?.contractVersion === "string" &&
      raw.contractVersion.startsWith("record-related-")
    )
      return;
    if (identity && raw?.recordId && raw.recordId !== identity) return;
    // Once bound, unsolicited success notifications cannot replace the interview,
    // a pending recovery target or a known receipt. Awaited calls own progression.
    // Explicit authoritative denial still clears historical presentation.
    if (interaction) {
      let denial;
      if (result?.isError) {
        try {
          denial = publicView(raw);
        } catch {
          denial = null;
        }
      }
      if (
        !["Rejected", "Conflict"].includes(denial?.status) ||
        denial.errors.some((error) => error.code === "OUTCOME_UNAVAILABLE")
      )
        return;
    }
    if (busy && !result?.isError) return;
    generation++;
    requestGeneration++;
    busy = false;
    accept(result, { host: true });
  };
  app.onhostcontextchanged = (context) => {
    if (!closed) {
      hostStyles(context);
      render();
    }
  };
  app.onclose = disconnect;
  app.onerror = () => {
    if (!closed) {
      requestGeneration++;
      if (model.receipt) refreshFailure();
      else unknown();
    }
  };
  app.onteardown = async () => {
    disconnect();
    return {};
  };
  const timer = repeat(expire, 1000);
  if (deliveryQa) stopQaSubscription = deliveryQa.subscribe(() => render());
  render();
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
      render();
      expire();
    })
    .catch(disconnect);
  return { disconnect };
}

// Adapter choice is trusted source code, never host/model input or options.
export function mountOpportunity(app, document, options) {
  return mountEditor(app, document, opportunityAdapter, options);
}
export function mountRecordEdit(app, document, options) {
  return mountEditor(app, document, recordAdapter, options);
}
