import { updateWorkspaceFit } from "./workspace.mjs";
import {
  registry,
  checkedFields,
  canonicalNumericValue,
  formatFieldValue,
} from "./fields.mjs";
import { resolveLayout } from "./layout.mjs";
const workspaces = new WeakMap();
// Reconcile in place: matching field controls never leave the document. Their
// readers retain touched/clear intent, while presentation and authority update.
function reconcile(old, fresh) {
  if (
    old.nodeType !== fresh.nodeType ||
    old.nodeName !== fresh.nodeName ||
    (fresh._fieldIdentity && old._fieldIdentity !== fresh._fieldIdentity)
  ) {
    old.replaceWith(fresh);
    return fresh;
  }
  if (old.nodeType === 3) {
    old.textContent = fresh.textContent;
    return old;
  }
  for (const attr of [...old.attributes])
    if (
      !fresh.hasAttribute(attr.name) &&
      !(old.nodeName === "DETAILS" && attr.name === "open")
    )
      old.removeAttribute(attr.name);
  for (const attr of [...fresh.attributes])
    old.setAttribute(attr.name, attr.value);
  if (old.matches("[data-field], [data-clear]")) return old;
  const key = (child) =>
    child.nodeType === 1
      ? child.getAttribute("data-field-box") ||
        child.getAttribute("data-section")
      : null;
  const children = [...old.childNodes],
    used = new Set();
  for (const [index, child] of [...fresh.childNodes].entries()) {
    const childKey = key(child);
    const previous = childKey
      ? children.find((item) => key(item) === childKey)
      : children[index];
    let live;
    if (previous && !used.has(previous)) {
      used.add(previous);
      live = reconcile(previous, child);
    } else live = child;
    if (old.childNodes[index] !== live)
      old.insertBefore(live, old.childNodes[index] || null);
  }
  for (const child of children) if (!used.has(child)) child.remove();
  return old;
}
// Receives only public checked presentation data and drafts. Event callbacks own execution.
export function renderScreen(root, model, callbacks = {}) {
  const doc = root.ownerDocument;
  let workspace = workspaces.get(root);
  if (!workspace) {
    workspace = { callbacks: {}, phase: null, key: null, fields: new Map() };
    workspaces.set(root, workspace);
  }
  workspace.callbacks = callbacks;
  callbacks = new Proxy(
    {},
    { get: (_, action) => workspace.callbacks[action] },
  );
  const samePhase =
    model.workspaceKey != null &&
    workspace.key === model.workspaceKey &&
    workspace.phase === model.status;
  const continuity = samePhase && model.status === "Editing";
  const oldReaders = continuity ? workspace.fields : new Map();
  const nextReaders = new Map();
  const publicFields = checkedFields(model.fields || []);
  const descriptorTypes = Object.fromEntries(
    publicFields.map((field) => [field.fieldApi, { dataType: field.dataType }]),
  );
  const fieldType = (api) =>
    Object.hasOwn(descriptorTypes, api)
      ? descriptorTypes[api]
      : Object.hasOwn(model.fieldTypes || {}, api)
        ? model.fieldTypes[api]
        : null;
  const node = (tag, text, attrs = {}) => {
    const e = doc.createElement(tag);
    if (text != null) e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const fragment = doc.createDocumentFragment();
  const status = node("p", model.message || model.status, {
    role: "status",
    "aria-live": "polite",
    "data-state": model.busyStatus || model.status,
    class: "status",
  });
  const headerRecord = model.currentCard || model;
  const header = node("header", null, { class: "record-header" });
  header.append(
    node("small", headerRecord.objectApiName || "", { class: "object-label" }),
    node("h1", headerRecord.recordName || "Cardstack"),
    status,
  );
  fragment.append(header);
  if (model.synthetic)
    fragment.prepend(node("p", model.synthetic, { class: "synthetic" }));
  const heading = node(
    "h2",
    {
      Editing: "Edit details",
      Review: "Review changes",
      Completed: "Completion receipt",
    }[model.status] ||
      model.objectApiName ||
      "Record workspace",
    { tabindex: "-1" },
  );
  fragment.append(heading);
  const button = (action, label, disabled = false) => {
    const b = node("button", label, { type: "button", "data-action": action });
    b.disabled = disabled;
    b.addEventListener("click", () => {
      if (!b.disabled && root.contains(b)) callbacks[action]?.();
    });
    return b;
  };
  if (
    (typeof CARDSTACK_DELIVERY_QA === "undefined" || CARDSTACK_DELIVERY_QA) &&
    model.deliveryQa?.enabled
  ) {
    const qa = model.deliveryQa,
      drawer = node("details", null, {
        "data-delivery-qa": "",
        class: "delivery-qa",
      });
    const labels = [
      qa.discardArmed ? "Discard armed" : null,
      qa.holdArmed ? "Hold armed" : null,
      qa.waiting ? "Native reply pending" : null,
      qa.held ? "Reply held" : null,
    ].filter(Boolean);
    drawer.append(
      node(
        "summary",
        "Developer delivery QA" +
          (labels.length ? " · " + labels.join(" · ") : ""),
      ),
      node(
        "p",
        "Controlled SDK-to-renderer interruption. Native execution and review/confirmation remain unchanged.",
      ),
    );
    const controls = node("div", null, { class: "delivery-qa-controls" });
    controls.append(
      button(
        "qa-discard",
        "Discard next Confirm reply",
        !model.qaReady || qa.discardArmed,
      ),
      button(
        "qa-hold",
        "Hold next related-page reply",
        !model.qaReady || qa.holdArmed || qa.waiting || qa.held,
      ),
      button("qa-release", "Release held reply", !qa.held),
      button("qa-reset", "Disarm / clear held reply", !model.qaReady),
    );
    drawer.append(controls);
    const form = node("form", null, { "data-qa-open": "" }),
      label = node("label", "Full 18-character record ID", {
        for: "qa-record-id",
      }),
      input = node("input", null, {
        id: "qa-record-id",
        "data-qa-record-id": "",
        type: "text",
        maxlength: "18",
        minlength: "18",
        required: "",
        autocomplete: "off",
      }),
      family = node("select", null, {
        "data-qa-family": "",
        "aria-label": "Installed native card family",
      }),
      open = node("button", "Open checked record", {
        type: "submit",
        "data-qa-open-record": "",
      });
    family.append(
      node("option", "Configured record", { value: "record" }),
      node("option", "Opportunity Stage card", { value: "opportunity" }),
    );
    input.disabled = family.disabled = open.disabled = !model.qaCanOpen;
    form.append(label, input, family, open);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (model.qaCanOpen && root.contains(form))
        callbacks.qaOpen?.(input.value, family.value);
    });
    drawer.append(form);
    fragment.append(drawer);
  }
  const display = (value) =>
    value === null ? "Cleared" : value === "" ? "Empty text" : value;
  function table(rows, parent) {
    const table = node("table"),
      head = node("tr");
    for (const title of ["Field", "Before", "After"])
      head.append(node("th", title, { scope: "col" }));
    const thead = node("thead");
    thead.append(head);
    table.append(thead);
    const body = node("tbody");
    for (const r of rows) {
      const tr = node("tr");
      tr.append(
        node("th", r.label, { scope: "row" }),
        node(
          "td",
          display(formatFieldValue(fieldType(r.fieldApi), r.beforeValue)),
        ),
        node(
          "td",
          display(formatFieldValue(fieldType(r.fieldApi), r.afterValue)),
        ),
      );
      body.append(tr);
    }
    table.append(body);
    parent.append(table);
  }
  function card(c, parent) {
    const sections = resolveLayout(c.fields || [], c.layout);
    for (const section of sections) {
      const group = node("section", null, { class: "record-section" });
      group.append(node("h3", section.label));
      const dl = node("dl");
      for (const api of section.fields) {
        const f = c.fields.find((field) => field.fieldApi === api);
        dl.append(
          node("dt", f.label),
          node(
            "dd",
            `${f.currencyCode ? f.currencyCode + " " : ""}${display(formatFieldValue(f, f.value))}`,
          ),
        );
      }
      group.append(dl);
      parent.append(group);
    }
  }
  if (model.status === "Discovery") {
    fragment.append(
      node(
        "p",
        model.searchStatus === "Empty"
          ? "No matching records."
          : model.searchStatus === "Rejected"
            ? "Search is unavailable. Try a known Salesforce ID."
            : "Select the record you intend to open.",
      ),
    );
    if (model.hasMore)
      fragment.append(node("p", "More matches exist. Narrow your search."));
    if (model.unavailableObjects.length)
      fragment.append(
        node("p", "Some configured objects are unavailable to search."),
      );
    if (model.searchIndexMayLag)
      fragment.append(
        node("p", "Recent record changes may take time to appear in search."),
      );
    for (const candidate of model.candidates) {
      const row = node("section", null, { class: "field-box" });
      row.append(
        node("h3", candidate.recordName),
        node("p", candidate.objectLabel),
        node("small", candidate.recordId),
      );
      for (const field of candidate.context)
        row.append(node("p", `${field.label}: ${field.value ?? "Empty"}`));
      const select = node("button", "Open record", {
        type: "button",
        "data-candidate": candidate.recordId,
        "aria-label": `Open ${candidate.objectLabel} ${candidate.recordName}`,
      });
      select.disabled = !model.ready;
      select.addEventListener("click", () => {
        if (!select.disabled && root.contains(select))
          callbacks.choose?.(candidate.recordId);
      });
      row.append(select);
      fragment.append(row);
    }
    const form = node("form");
    const label = node("label", "Find a record", { for: "record-query" });
    const input = node("input", null, {
      id: "record-query",
      type: "search",
      maxlength: "160",
      required: "",
      "data-search-query": "",
    });
    const submit = node("button", "Search", { type: "submit" });
    submit.disabled = !model.ready;
    form.append(label, input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (model.ready && root.contains(form)) callbacks.search?.(input.value);
    });
    fragment.append(form);
  }
  if (model.status === "Card") {
    card(model, fragment);
    if (model.breadcrumb) {
      const parent = button(
        "parent",
        `Back to ${model.breadcrumb.recordName}`,
        !model.ready,
      );
      parent.setAttribute("data-parent-record", model.breadcrumb.recordId);
      fragment.append(parent);
    }
    if (model.supportsRelated)
      fragment.append(button("related", "Related records", !model.ready));
    if (model.related) {
      const container = node("section", null, { "data-related": "" });
      container.append(node("h2", "Related records"));
      if (model.related.error)
        container.append(node("p", model.related.error, { role: "alert" }));
      if (!model.related.lists.length && !model.related.error)
        container.append(node("p", "No related lists are configured."));
      for (const list of model.related.lists) {
        const section = node("section");
        section.append(node("h3", list.label));
        const read = node("button", "Read / refresh list", {
          type: "button",
          "data-related-list": list.listKey,
        });
        read.disabled =
          !model.ready || model.relatedPending?.includes(list.listKey);
        read.addEventListener("click", () => {
          if (!read.disabled && root.contains(read))
            callbacks.relatedPage?.(list.listKey);
        });
        section.append(read);
        if (model.relatedPending?.includes(list.listKey))
          section.append(
            node("p", "Reading related records…", {
              "data-related-loading": list.listKey,
              role: "status",
            }),
          );
        const page = model.related.pages[list.listKey];
        if (page) {
          if (!page.rows.length)
            section.append(node("p", "No related records."));
          const table = node("table", null, {
            "data-related-rows": list.listKey,
          });
          const head = node("tr");
          head.append(node("th", "Record", { scope: "col" }));
          for (const column of page.columns)
            head.append(node("th", column.label, { scope: "col" }));
          const thead = node("thead");
          thead.append(head);
          table.append(thead);
          const tbody = node("tbody");
          for (const row of page.rows) {
            const tr = node("tr"),
              name = node("th", null, { scope: "row" });
            const open = node("button", row.recordName, {
              type: "button",
              "data-related-child": row.recordId,
            });
            open.disabled = !model.ready;
            open.addEventListener("click", () => {
              if (!open.disabled && root.contains(open))
                callbacks.relatedChild?.(list.listKey, row.recordId);
            });
            name.append(open);
            tr.append(name);
            row.cells.forEach((cell, index) =>
              tr.append(
                node(
                  "td",
                  formatFieldValue(
                    { ...page.columns[index], currencyCode: cell.currencyCode },
                    cell.value,
                  ) ?? "Empty",
                ),
              ),
            );
            tbody.append(tr);
          }
          table.append(tbody);
          section.append(table);
          if (page.hasMore) {
            const next = node("button", "Next page", {
              type: "button",
              "data-related-next": list.listKey,
            });
            next.disabled =
              !model.ready || model.relatedPending?.includes(list.listKey);
            next.addEventListener("click", () => {
              if (!next.disabled && root.contains(next))
                callbacks.relatedPage?.(list.listKey, true);
            });
            section.append(next);
          }
        }
        container.append(section);
      }
      fragment.append(container);
    }
    const actions = node("div", null, { class: "actions" });
    for (const a of model.actions || []) {
      const b = button("start", a.label, !model.ready);
      b.addEventListener("click", () => {
        if (!b.disabled && root.contains(b)) callbacks.launch?.(a.name);
      });
      actions.append(b);
    }
    if (!model.actions?.length)
      fragment.append(
        node("p", "No published edit action is available for this record."),
      );
    fragment.append(actions, button("refresh", "Refresh card", !model.ready));
  }
  let readDraft = () => ({});
  if (model.status === "Editing") {
    if (model.flow && model.screen) {
      fragment.append(node("h3", model.screen.label));
      for (const text of model.screen.plainTextBlocks)
        fragment.append(node("p", text));
    }
    const fields = publicFields,
      sections = resolveLayout(fields, model.layout);
    const form = node("form");
    form.noValidate = true;
    const readers = [];
    for (const section of sections) {
      const group = node("fieldset", null, { "data-section": section.id }),
        legend = node("legend", section.label);
      group.append(legend);
      const grid = node("div", null, {
        class: `field-grid columns-${section.columns}`,
      });
      group.append(grid);
      for (const api of section.fields) {
        const f = fields.find((f) => f.fieldApi === api),
          shape = registry[f.dataType];
        const box = node("div", null, {
            class: "field",
            "data-field-box": api,
          }),
          label = node(
            "label",
            `${f.label}${f.currencyCode ? " (" + f.currencyCode + ")" : ""}${f.required ? " *" : ""}`,
            { for: "field-" + api },
          );
        box.append(label);
        if (!shape) {
          box.append(
            node(
              "p",
              `${display(f.value)} — Editing unavailable for this field type.`,
            ),
          );
          grid.append(box);
          continue;
        }
        const input = node(shape.tag, null, {
          id: "field-" + api,
          "data-field": api,
        });
        const draft = model.drafts?.[api];
        let touched = false;
        input.addEventListener("input", () => (touched = true));
        input.addEventListener("change", () => (touched = true));
        const initial = draft?.operation === "set" ? draft.value : f.value;
        input.disabled = !model.editable;
        input.setAttribute("aria-required", String(f.required));
        if (shape.kind === "choice") {
          const keep = node("option", "Keep the current record value");
          keep.value = "";
          input.append(keep);
          if (
            f.value &&
            !f.choices.some((choice) => choice.value === f.value)
          ) {
            const current = node(
              "option",
              `Starting value: ${f.value} (unavailable for selection)`,
            );
            current.value = f.value;
            current.disabled = true;
            input.append(current);
          }
          for (const c of f.choices) {
            const o = node("option", c.label);
            o.value = c.value;
            input.append(o);
          }
          input.value =
            draft?.operation === "set"
              ? draft.value
              : draft?.operation === "clear"
                ? ""
                : (f.value ?? "");
        } else if (shape.kind === "checkbox") {
          input.type = "checkbox";
          input.checked = initial === "true";
        } else {
          if (shape.tag === "input")
            input.type = shape.kind === "date" ? "date" : "text";
          input.value = formatFieldValue(f, initial) ?? "";
          if (shape.kind === "date") {
            input.min = "0001-01-01";
            input.max = "9999-12-31";
          }
          if (["integer", "decimal"].includes(shape.kind))
            input.addEventListener("blur", () => {
              if (canonicalNumericValue(input.value, f.dataType) !== null)
                input.value = formatFieldValue(f, input.value);
            });
          if (["integer", "decimal"].includes(shape.kind))
            input.inputMode = shape.kind === "integer" ? "numeric" : "decimal";
          if (shape.tag === "textarea") input.rows = 3;
          input.maxLength = ["integer", "decimal"].includes(shape.kind)
            ? 5463
            : 4096;
        }
        const current = node(
          "small",
          `Starting value: ${display(formatFieldValue(f, f.value))}`,
        );
        box.append(input, current);
        let clear = null;
        if (f.canClear && !f.required) {
          const clearLabel = node("label", null, { class: "clear" });
          clear = node("input", null, { "data-clear": api, type: "checkbox" });
          clear.checked = draft?.operation === "clear";
          clear.disabled = !model.editable;
          clearLabel.append(clear, doc.createTextNode("Clear value"));
          box.append(clearLabel);
          clear.addEventListener("change", () => {
            input.disabled = clear.checked || !workspace.editable;
          });
          if (clear.checked) input.disabled = true;
        }
        const error = (model.errors || []).find((e) => e.fieldApi === api);
        if (error) {
          const message = node("p", error.message, {
            id: "error-" + api,
            class: "error",
          });
          box.append(message);
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", "error-" + api);
        }
        const original =
          shape.kind === "choice"
            ? input.value
            : shape.kind === "checkbox"
              ? initial === "true"
                ? "true"
                : "false"
              : (canonicalNumericValue(initial, f.dataType) ?? initial ?? "");
        const reader = () => {
          if (clear?.checked) return [api, { operation: "clear" }];
          const value =
            shape.kind === "checkbox"
              ? String(input.checked)
              : (canonicalNumericValue(input.value, f.dataType) ?? input.value);
          if (draft?.operation === "set" && value === draft.value)
            return [api, { operation: "set", value }];
          if (
            (value === original &&
              !(touched && shape.kind === "checkbox" && f.value === null)) ||
            (shape.kind === "choice" && value === "")
          )
            return [api, { operation: "keep" }];
          return [api, { operation: "set", value }];
        };
        // The checked descriptor is the authorization/shape boundary. Errors,
        // busy state and local draft snapshots are not a new field identity.
        const fingerprint = JSON.stringify([
          f.fieldApi,
          f.dataType,
          f.value,
          f.required,
          f.canClear,
          f.choices.map((c) => c.value),
        ]);
        box._fieldIdentity = fingerprint;
        const retained = oldReaders.get(api);
        const activeReader =
          retained?.fingerprint === fingerprint ? retained.reader : reader;
        nextReaders.set(api, { fingerprint, reader: activeReader });
        readers.push(activeReader);
        grid.append(box);
      }
      form.append(group);
    }
    readDraft = () => Object.fromEntries(readers.map((read) => read()));
    const actions = node("div", null, { class: "actions" }),
      review = node("button", model.flow ? "Next" : "Review changes", {
        type: "button",
        "data-action": "review",
      });
    review.disabled = !model.editable || (model.flow && !model.screen.canNext);
    actions.append(
      button(
        "cancel",
        "Cancel",
        !model.editable || (model.flow && !model.screen.canCancel),
      ),
    );
    if (model.flow && model.screen.canBack)
      actions.append(button("back", "Back", !model.editable));
    actions.append(review);
    form.append(actions);
    // Sandboxed previews prohibit native form submission. Review is a JS action;
    // the form supplies field grouping only and never navigates or dispatches it.
    const activateReview = () => {
      if (workspace.editable && root.contains(form))
        callbacks.review?.(workspace.readDraft());
    };
    review.addEventListener("click", () => {
      if (root.contains(review)) {
        if (workspace.editable) callbacks.review?.(workspace.readDraft());
      }
    });
    form.addEventListener("keydown", (event) => {
      const input = event.target;
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        input?.tagName !== "INPUT" ||
        input.type !== "text" ||
        input.disabled
      )
        return;
      event.preventDefault();
      activateReview();
    });
    if (model.flow && model.screen.needsAnswerRefresh) {
      const reproject = (event) => {
        if (
          workspace.editable &&
          event.target?.matches("[data-field], [data-clear]") &&
          root.contains(form)
        )
          callbacks.answer?.(
            workspace.readDraft(),
            event.target.getAttribute("data-field") ||
              event.target.getAttribute("data-clear"),
          );
      };
      form.addEventListener("change", reproject);
      form.addEventListener("focusout", reproject);
    }
    form.addEventListener("submit", (event) => event.preventDefault());
    fragment.append(form);
  }
  for (const error of (model.errors || []).filter((e) => !e.fieldApi))
    fragment.append(node("p", error.message, { class: "error" }));
  if (model.status === "Review") {
    if (model.layout && publicFields.length) {
      for (const section of resolveLayout(publicFields, model.layout)) {
        const rows = section.fields.flatMap((api) =>
          (model.diff || []).filter((row) => row.fieldApi === api),
        );
        if (!rows.length) continue;
        fragment.append(node("h3", section.label));
        table(rows, fragment);
      }
    } else table(model.diff || [], fragment);
    fragment.append(
      node("p", "Salesforce validates business rules when you save."),
    );
    const actions = node("div", null, { class: "actions" });
    actions.append(
      ...(model.busyStatus === "Saving"
        ? []
        : [button("cancel", "Cancel", !model.ready)]),
      button(
        "back",
        model.flow ? "Back to screen" : "Back to edit",
        !model.ready || (model.flow && !model.screen?.canBack),
      ),
      button(
        "confirm",
        model.saveDisabled
          ? "Save disabled in Studio preview"
          : "Confirm and save",
        !model.canConfirm || model.saveDisabled,
      ),
    );
    fragment.append(actions);
  }
  if (model.receipt) {
    const receipt = node("section", null, {
      "data-receipt": "",
      class: "receipt",
    });
    receipt.append(
      node(
        "h3",
        model.receipt.status === "noChanges"
          ? "No changes were needed"
          : "Reviewed changes saved",
      ),
      node(
        "p",
        `${model.receipt.actorDisplayName} · ${model.receipt.completedAt}`,
      ),
      node("small", `Receipt ${model.receipt.reference}`),
    );
    const details = node("details");
    details.append(node("summary", "View saved changes"));
    const savedRows =
      model.layout && publicFields.length
        ? resolveLayout(publicFields, model.layout).flatMap((section) =>
            section.fields.flatMap((api) =>
              (model.receipt.diff || []).filter((row) => row.fieldApi === api),
            ),
          )
        : model.receipt.diff || [];
    table(savedRows, details);
    receipt.append(details);
    fragment.append(receipt);
  }
  if (model.status === "Completed")
    fragment.append(
      button(
        "refresh",
        model.refreshing ? "Refreshing…" : "Refresh current record",
        !model.ready || model.refreshing,
      ),
    );
  if (model.currentCard) {
    const section = node("section", null, { "data-current-card": "" });
    section.append(node("h3", "Current record · fresh read"));
    card(model.currentCard, section);
    fragment.append(section);
  }
  if (
    ["Unknown", "Recoverable", "Saving"].includes(
      model.busyStatus || model.status,
    )
  )
    fragment.append(button("resume", "Check save status", !model.ready));
  if (["Cancelled", "Expired", "Conflict", "Rejected"].includes(model.status))
    fragment.append(button("refresh", "Refresh card", !model.ready));
  // Header/body/footer are stable across phases. The body owns scrolling and
  // the action bar remains outside it; no parent or conversation DOM is used.
  let shell = root.querySelector(".workspace");
  if (!shell) {
    shell = node("section", null, { class: "workspace" });
    shell.append(
      node("div", null, { class: "workspace-header" }),
      node("div", null, { class: "workspace-content" }),
      node("footer", null, { class: "workspace-actions" }),
    );
    root.replaceChildren(shell);
    const ResizeObserver = doc.defaultView.ResizeObserver;
    if (ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (!shell.isConnected) {
          observer.disconnect();
          return;
        }
        updateWorkspaceFit(doc, shell);
      });
      observer.observe(shell.children[0]);
      observer.observe(shell.children[2]);
    }
  }
  const headerSlot = shell.children[0],
    content = shell.children[1],
    footer = shell.children[2];
  const newHeader = fragment.querySelector("header");
  if (headerSlot.firstChild) reconcile(headerSlot.firstChild, newHeader);
  else headerSlot.append(newHeader);
  if (newHeader.parentNode !== headerSlot) newHeader.remove();
  const actions = fragment.querySelector(".actions");
  // Keep the editing form in the content; its action bar is moved to the footer.
  if (actions) actions.remove();
  const refresh = [
    ...fragment.querySelectorAll(
      "button[data-action=refresh], button[data-action=resume]",
    ),
  ];
  for (const b of refresh) b.remove();
  if (samePhase) {
    // The form's controls and listeners survive, including nullable-Boolean
    // touched state and unsubmitted clear intent.
    const freshContent = node("div", null, { class: "workspace-content" });
    freshContent.append(fragment);
    reconcile(content, freshContent);
    const clearControls = [...content.querySelectorAll("[data-clear]")];
    for (const clear of clearControls) {
      clear.disabled = !model.editable;
      content.querySelector(`[data-field="${clear.dataset.clear}"]`).disabled =
        clear.checked || !model.editable;
    }
  } else {
    content.replaceChildren(fragment);
    content.scrollTop = 0;
  }
  footer.replaceChildren(
    ...(actions ? [...actions.childNodes] : []),
    ...refresh,
  );
  shell.setAttribute(
    "aria-busy",
    String(!!model.busyStatus || !!model.refreshing),
  );
  updateWorkspaceFit(doc, shell);
  workspace.editable = !!model.editable;
  workspace.readDraft = readDraft;
  workspace.fields = nextReaders;
  workspace.phase = model.status;
  workspace.key = model.workspaceKey;
  const focus = (control, reveal = false) => {
    control.focus({ preventScroll: true });
    if (reveal) {
      const bounds = control.getBoundingClientRect(),
        viewport = content.getBoundingClientRect();
      if (bounds.top < viewport.top)
        content.scrollTop += bounds.top - viewport.top - 8;
      else if (bounds.bottom > viewport.bottom)
        content.scrollTop += bounds.bottom - viewport.bottom + 8;
    }
  };
  if (model.focusError) {
    const control = root.querySelector("[aria-invalid=true]");
    focus(control || content.querySelector("h2"), !!control);
  } else if (model.focusHeading) {
    content.scrollTop = 0;
    focus(content.querySelector("h2"));
  }
  return { readDraft };
}
