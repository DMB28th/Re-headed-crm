// Object-neutral public DTO projection. Native/published authority stays on the server.
import {
  checkedFields,
  boundedText,
  scalar,
  nativeNumericValue,
  calendar,
} from "./fields.mjs";

import { resolveLayout } from "./layout.mjs";

function checkedLayout(fields, layout) {
  if (layout == null) return undefined;
  return { version: 1, sections: resolveLayout(fields, layout) };
}

const STATES = [
  "Editing",
  "Review",
  "Completed",
  "Cancelled",
  "Expired",
  "Conflict",
  "Rejected",
];
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const revision = (x) => Number.isSafeInteger(x) && x > 0;
const key = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const timestamp = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x) &&
  Number.isFinite(Date.parse(x));
function recordId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9]{18}$/.test(id)) return false;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  let suffix = "";
  for (let i = 0; i < 15; i += 5) {
    let mask = 0;
    for (let j = 0; j < 5; j++) if (/[A-Z]/.test(id[i + j])) mask |= 1 << j;
    suffix += alphabet[mask];
  }
  return id.slice(15) === suffix;
}
const objectApi = (name) =>
  typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name);
const genericTypes = [
  "STRING",
  "TEXTAREA",
  "BOOLEAN",
  "INTEGER",
  "DATE",
  "DECIMAL",
  "DOUBLE",
  "CURRENCY",
  "EMAIL",
  "PHONE",
  "URL",
  "PICKLIST",
];
function fieldValue(field, value) {
  if (value === null) return field.dataType !== "BOOLEAN";
  if (field.dataType === "BOOLEAN") return ["true", "false"].includes(value);
  if (field.dataType === "DATE") return calendar(value);
  if (["INTEGER", "DECIMAL", "DOUBLE", "CURRENCY"].includes(field.dataType))
    return (
      /^-?(?:\d+)(?:\.\d+)?$/.test(value) &&
      nativeNumericValue(value, field) !== null
    );
  return (
    scalar(value) &&
    (!["EMAIL", "PHONE", "URL", "PICKLIST"].includes(field.dataType) ||
      value.length <= field.length)
  );
}
function genericFields(rows) {
  const fields = checkedFields(rows);
  if (
    fields.length < 1 ||
    fields.length > 20 ||
    rows.some(
      (f) =>
        typeof f.required !== "boolean" ||
        typeof f.canClear !== "boolean" ||
        !genericTypes.includes(f.dataType) ||
        !fieldValue(f, f.value) ||
        (["INTEGER", "DECIMAL", "DOUBLE", "CURRENCY"].includes(f.dataType) &&
          (!Number.isInteger(f.precision) ||
            f.precision < 1 ||
            f.precision > 28 ||
            !Number.isInteger(f.scale) ||
            f.scale < 0 ||
            f.scale > f.precision)) ||
        (f.dataType === "INTEGER" && f.scale !== 0) ||
        (f.dataType === "CURRENCY" && !/^[A-Z]{3}$/.test(f.currencyCode)) ||
        (f.dataType === "BOOLEAN" &&
          (f.canClear || !["true", "false"].includes(f.value))) ||
        (f.required && f.canClear) ||
        (["EMAIL", "PHONE", "URL", "PICKLIST"].includes(f.dataType) &&
          (!Number.isSafeInteger(f.length) ||
            f.length < 1 ||
            f.length > 131072)) ||
        (f.dataType === "PICKLIST" &&
          f.choices?.some((choice) => choice.value.length > f.length)) ||
        (f.dataType !== "PICKLIST" && (f.choices ?? []).length),
    )
  )
    throw Error("INVALID_FIELDS");
  return fields;
}
function publicErrors(rows, fields) {
  if (!Array.isArray(rows) || rows.length > 10) throw Error("INVALID_VIEW");
  return rows.map((e) => {
    if (
      !object(e) ||
      !boundedText(e.message) ||
      typeof e.code !== "string" ||
      !/^[A-Z_]{1,80}$/.test(e.code) ||
      (e.fieldApi != null && !fields.includes(e.fieldApi))
    )
      throw Error("INVALID_VIEW");
    return { fieldApi: e.fieldApi ?? null, code: e.code, message: e.message };
  });
}
function publicDiff(rows, fields, historicalReceipt = false) {
  if (!Array.isArray(rows) || rows.length > 20) throw Error("INVALID_VIEW");
  const seen = new Set();
  return rows.map((r) => {
    if (
      !object(r) ||
      !fields.some((f) => f.fieldApi === r.fieldApi) ||
      seen.has(r.fieldApi) ||
      !boundedText(r.label) ||
      !scalar(r.beforeValue) ||
      !scalar(r.afterValue)
    )
      throw Error("INVALID_VIEW");
    const field = fields.find((f) => f.fieldApi === r.fieldApi);
    if (!fieldValue(field, r.beforeValue) || !fieldValue(field, r.afterValue))
      throw Error("INVALID_VIEW");
    if (
      !historicalReceipt &&
      field.dataType === "PICKLIST" &&
      r.afterValue !== null &&
      r.afterValue !== r.beforeValue &&
      !field.choices.some((choice) => choice.value === r.afterValue)
    )
      throw Error("INVALID_VIEW");
    if (
      field.dataType === "BOOLEAN" &&
      ![r.beforeValue, r.afterValue].every((value) =>
        ["true", "false"].includes(value),
      )
    )
      throw Error("INVALID_VIEW");
    if (r.afterValue === null && (!field.canClear || field.required))
      throw Error("INVALID_VIEW");
    seen.add(r.fieldApi);
    return {
      fieldApi: r.fieldApi,
      label: r.label,
      beforeValue: r.beforeValue,
      afterValue: r.afterValue,
    };
  });
}
function discoveryView(raw) {
  if (
    !object(raw) ||
    !["Matches", "Empty", "Rejected"].includes(raw.status) ||
    !["hasMore", "needsSelection", "searchIndexMayLag"].every(
      (key) => typeof raw[key] === "boolean",
    ) ||
    !["searchedObjects", "unavailableObjects"].every(
      (key) =>
        Array.isArray(raw[key]) &&
        raw[key].length <= 12 &&
        raw[key].every(objectApi),
    ) ||
    !Array.isArray(raw.candidates) ||
    raw.candidates.length > 10 ||
    (raw.status === "Matches") !== raw.candidates.length > 0 ||
    (raw.status === "Rejected" && !/^[A-Z_]{1,80}$/.test(raw.errorCode))
  )
    throw Error("INVALID_DISCOVERY");
  const seen = new Set();
  const candidates = raw.candidates.map((row) => {
    if (
      !object(row) ||
      !recordId(row.recordId) ||
      !objectApi(row.objectApiName) ||
      !boundedText(row.objectLabel) ||
      !boundedText(row.recordName) ||
      seen.has(row.recordId) ||
      !Array.isArray(row.context) ||
      row.context.length > 2
    )
      throw Error("INVALID_DISCOVERY");
    seen.add(row.recordId);
    const context = row.context.map((field) => {
      if (
        !object(field) ||
        !objectApi(field.fieldApi) ||
        !boundedText(field.label) ||
        !scalar(field.value)
      )
        throw Error("INVALID_DISCOVERY");
      return {
        fieldApi: field.fieldApi,
        label: field.label,
        value: field.value,
      };
    });
    return {
      recordId: row.recordId,
      objectApiName: row.objectApiName,
      objectLabel: row.objectLabel,
      recordName: row.recordName,
      context,
    };
  });
  return {
    status: "Discovery",
    searchStatus: raw.status,
    candidates,
    hasMore: raw.hasMore,
    needsSelection: raw.needsSelection,
    searchIndexMayLag: raw.searchIndexMayLag,
    searchedObjects: [...raw.searchedObjects],
    unavailableObjects: [...raw.unavailableObjects],
  };
}
function publicView(raw) {
  if (!object(raw)) throw Error("INVALID_VIEW");
  if (raw.contractVersion === "record-discovery/v1") return discoveryView(raw);
  if (raw.contractVersion === "record-card/v1") {
    if (
      !recordId(raw.recordId) ||
      !boundedText(raw.recordName) ||
      !Array.isArray(raw.actions) ||
      raw.actions.length > 50
    )
      throw Error("INVALID_CARD");
    if (!objectApi(raw.objectApiName)) throw Error("INVALID_CARD");
    const fields = genericFields(raw.fields);
    const actions = raw.actions.map((a) => {
      if (
        !object(a) ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(a.name) ||
        !boundedText(a.label) ||
        !["record-edit", "screen-flow"].includes(a.type)
      )
        throw Error("INVALID_CARD");
      return {
        name: a.name,
        label: a.label,
        ...(a.type === "screen-flow" ? { type: a.type } : {}),
      };
    });
    return {
      status: "Card",
      objectApiName: raw.objectApiName,
      recordId: raw.recordId,
      recordName: raw.recordName,
      fields,
      layout: checkedLayout(fields, raw.layout),
      actions,
    };
  }
  if (raw.contractVersion !== "record-edit/v1" || !STATES.includes(raw.status))
    throw Error("INVALID_VIEW");
  const carriesIdentity =
    ["Editing", "Review", "Completed"].includes(raw.status) ||
    raw.recordId != null;
  if (carriesIdentity && !objectApi(raw.objectApiName))
    throw Error("INVALID_VIEW");
  if (
    !carriesIdentity &&
    raw.objectApiName != null &&
    !objectApi(raw.objectApiName)
  )
    throw Error("INVALID_VIEW");
  const fields = carriesIdentity
    ? genericFields(raw.fields)
    : checkedFields(raw.fields ?? []);
  // Completion carries historical outcome only; fresh options require Refresh/start.
  if (raw.status === "Completed")
    for (const field of fields) field.choices = [];
  const names = fields.map((f) => f.fieldApi);
  const errors = publicErrors(raw.errors ?? [], names);
  const view = {
    status: raw.status,
    errors,
    fields,
    layout: checkedLayout(fields, raw.layout),
    diff: publicDiff(raw.diff ?? [], fields),
  };
  if (["Editing", "Review", "Completed"].includes(raw.status)) {
    if (
      !recordId(raw.recordId) ||
      !boundedText(raw.recordName) ||
      !revision(raw.revision)
    )
      throw Error("INVALID_VIEW");
    Object.assign(view, {
      objectApiName: raw.objectApiName,
      recordId: raw.recordId,
      recordName: raw.recordName,
      revision: raw.revision,
    });
  } else if (raw.recordId != null) {
    if (
      !recordId(raw.recordId) ||
      !boundedText(raw.recordName) ||
      !revision(raw.revision)
    )
      throw Error("INVALID_VIEW");
    Object.assign(view, {
      objectApiName: raw.objectApiName,
      recordId: raw.recordId,
      recordName: raw.recordName,
      revision: raw.revision,
    });
  }
  if (raw.status === "Editing") {
    if (
      !timestamp(raw.expiresAt) ||
      raw.fields.some(
        (f) =>
          typeof f.required !== "boolean" || typeof f.canClear !== "boolean",
      )
    )
      throw Error("INVALID_VIEW");
    view.expiresAt = raw.expiresAt;
  }
  if (raw.status === "Review") {
    if (
      !timestamp(raw.expiresAt) ||
      !revision(raw.reviewRevision) ||
      view.diff.length === 0
    )
      throw Error("INVALID_VIEW");
    Object.assign(view, {
      expiresAt: raw.expiresAt,
      reviewRevision: raw.reviewRevision,
    });
  }
  if (raw.status === "Completed") {
    const r = raw.receipt;
    if (
      !object(r) ||
      !/^(receipt-[a-f0-9]{32})$/.test(r.reference) ||
      !boundedText(r.actorDisplayName) ||
      !timestamp(r.completedAt) ||
      !["saved", "noChanges"].includes(r.status)
    )
      throw Error("INVALID_RECEIPT");
    // A Completed receipt is a bounded historical outcome, never selectable authority.
    const diff = publicDiff(r.diff, fields, true);
    if (
      (r.status === "saved" && diff.length === 0) ||
      (r.status === "noChanges" && diff.length !== 0)
    )
      throw Error("INVALID_RECEIPT");
    view.receipt = {
      reference: r.reference,
      actorDisplayName: r.actorDisplayName,
      completedAt: r.completedAt,
      status: r.status,
      diff,
    };
  }
  return view;
}

export { publicView, recordId, key };
