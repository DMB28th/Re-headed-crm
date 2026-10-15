// Checked, read-only related projection. Continuation positions stay in MCP metadata.
import { recordId } from "./record-contract.mjs";
import {
  boundedText,
  scalar,
  calendar,
  nativeNumericValue,
} from "./fields.mjs";
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const api = (x) =>
  typeof x === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(x);
const listKey = (x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(x);
const fingerprint = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const types = [
  "STRING",
  "TEXTAREA",
  "BOOLEAN",
  "INTEGER",
  "DATE",
  "DATETIME",
  "TIME",
  "DECIMAL",
  "DOUBLE",
  "CURRENCY",
  "PERCENT",
  "EMAIL",
  "PHONE",
  "URL",
  "PICKLIST",
];
const numeric = ["INTEGER", "DECIMAL", "DOUBLE", "CURRENCY", "PERCENT"];
function fail() {
  throw Error("INVALID_RELATED_PAGE");
}
function identity(raw) {
  if (
    !object(raw) ||
    !recordId(raw.recordId) ||
    !api(raw.objectApiName) ||
    !boundedText(raw.recordName)
  )
    fail();
  return {
    recordId: raw.recordId,
    objectApiName: raw.objectApiName,
    recordName: raw.recordName,
  };
}
function columns(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) fail();
  const seen = new Set();
  return raw.map((c) => {
    if (
      !object(c) ||
      !api(c.fieldApi) ||
      c.fieldApi === "Id" ||
      seen.has(c.fieldApi) ||
      !boundedText(c.label) ||
      !types.includes(c.dataType)
    )
      fail();
    seen.add(c.fieldApi);
    const result = {
      fieldApi: c.fieldApi,
      label: c.label,
      dataType: c.dataType,
    };
    if (numeric.includes(c.dataType)) {
      if (
        !Number.isSafeInteger(c.precision) ||
        c.precision < 1 ||
        c.precision > 28 ||
        !Number.isSafeInteger(c.scale) ||
        c.scale < 0 ||
        c.scale > c.precision ||
        (c.dataType === "INTEGER" && c.scale !== 0)
      )
        fail();
      result.precision = c.precision;
      result.scale = c.scale;
    }
    return result;
  });
}
function list(raw) {
  if (
    !object(raw) ||
    !listKey(raw.listKey) ||
    !api(raw.relationship) ||
    !api(raw.childObjectApiName) ||
    !boundedText(raw.label) ||
    !fingerprint(raw.definitionFingerprint)
  )
    fail();
  return {
    listKey: raw.listKey,
    relationship: raw.relationship,
    childObjectApiName: raw.childObjectApiName,
    label: raw.label,
    definitionFingerprint: raw.definitionFingerprint,
    columns: columns(raw.columns),
  };
}
export function publicRelatedDefinitions(raw) {
  if (
    !object(raw) ||
    raw.contractVersion !== "record-related-definitions/v1" ||
    !Array.isArray(raw.lists) ||
    raw.lists.length > 6
  )
    fail();
  const seen = new Set();
  return {
    contractVersion: raw.contractVersion,
    parent: identity(raw.parent),
    lists: raw.lists.map((r) => {
      const checked = list(r);
      if (
        seen.has(checked.listKey) ||
        !Number.isSafeInteger(r.pageSize) ||
        r.pageSize < 1 ||
        r.pageSize > 50
      )
        fail();
      seen.add(checked.listKey);
      return { ...checked, pageSize: r.pageSize };
    }),
  };
}
function value(c, cell) {
  if (!scalar(cell.value)) fail();
  if (cell.value === null) return;
  if (c.dataType === "BOOLEAN" && !["true", "false"].includes(cell.value))
    fail();
  if (c.dataType === "DATE" && !calendar(cell.value)) fail();
  if (
    c.dataType === "DATETIME" &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(cell.value) ||
      !Number.isFinite(Date.parse(cell.value)))
  )
    fail();
  if (
    c.dataType === "TIME" &&
    !/^\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/.test(cell.value)
  )
    fail();
  if (
    numeric.includes(c.dataType) &&
    (!/^-?\d+(?:\.\d+)?$/.test(cell.value) ||
      nativeNumericValue(cell.value, {
        ...c,
        dataType: c.dataType === "PERCENT" ? "DECIMAL" : c.dataType,
      }) === null)
  )
    fail();
}
export function publicRelatedPage(raw) {
  if (
    !object(raw) ||
    raw.contractVersion !== "record-related-page/v1" ||
    !Array.isArray(raw.rows) ||
    raw.rows.length > 50 ||
    typeof raw.hasMore !== "boolean"
  )
    fail();
  const checked = list(raw),
    seen = new Set();
  const rows = raw.rows.map((r) => {
    if (
      !object(r) ||
      !recordId(r.recordId) ||
      seen.has(r.recordId) ||
      !boundedText(r.recordName) ||
      !Array.isArray(r.cells) ||
      r.cells.length !== checked.columns.length
    )
      fail();
    seen.add(r.recordId);
    return {
      recordId: r.recordId,
      recordName: r.recordName,
      cells: r.cells.map((cell, i) => {
        const c = checked.columns[i];
        if (!object(cell) || cell.fieldApi !== c.fieldApi) fail();
        value(c, cell);
        const result = { fieldApi: cell.fieldApi, value: cell.value };
        if (c.dataType === "CURRENCY") {
          if (!/^[A-Z]{3}$/.test(cell.currencyCode)) fail();
          result.currencyCode = cell.currencyCode;
        }
        return result;
      }),
    };
  });
  if (raw.hasMore && rows.length === 0) fail();
  return {
    contractVersion: raw.contractVersion,
    parent: identity(raw.parent),
    ...checked,
    rows,
    hasMore: raw.hasMore,
  };
}
function request(raw, keys, required) {
  if (
    !object(raw) ||
    Object.keys(raw).some((k) => !keys.includes(k)) ||
    required.some((k) => !Object.hasOwn(raw, k)) ||
    !recordId(raw.parentId) ||
    !listKey(raw.listKey)
  )
    throw Error("INVALID_REQUEST");
}
export function relatedPageRequest(raw) {
  request(raw, ["parentId", "listKey", "cursor"], ["parentId", "listKey"]);
  if (
    raw.cursor != null &&
    (typeof raw.cursor !== "string" ||
      raw.cursor.length < 1 ||
      raw.cursor.length > 2048)
  )
    throw Error("INVALID_REQUEST");
  return {
    parentId: raw.parentId,
    listKey: raw.listKey,
    ...(raw.cursor == null ? {} : { cursor: raw.cursor }),
  };
}
export function relatedChildRequest(raw) {
  request(
    raw,
    ["parentId", "listKey", "childId"],
    ["parentId", "listKey", "childId"],
  );
  if (!recordId(raw.childId)) throw Error("INVALID_REQUEST");
  return { parentId: raw.parentId, listKey: raw.listKey, childId: raw.childId };
}
