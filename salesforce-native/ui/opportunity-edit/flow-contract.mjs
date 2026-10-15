// Presentation-only normalization of the distinct native Flow family. No plan or authority crosses this seam.
import { publicView as recordView } from "./record-contract.mjs";
import {
  checkedFields,
  boundedText,
  scalar,
  calendar,
  nativeNumericValue,
} from "./fields.mjs";
import { resolveLayout } from "./layout.mjs";
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const api = (x) =>
  typeof x === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(x);
const sectionId = (x) =>
  typeof x === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(x);
function fail() {
  throw Error("INVALID_FLOW_VIEW");
}
function screenView(raw) {
  if (
    !object(raw) ||
    !boundedText(raw.label) ||
    !Array.isArray(raw.inputs) ||
    raw.inputs.length > 20 ||
    !Array.isArray(raw.sections) ||
    raw.sections.length > 20 ||
    !Array.isArray(raw.plainTextBlocks) ||
    raw.plainTextBlocks.length > 40 ||
    !raw.plainTextBlocks.every((x) => boundedText(x, 4096)) ||
    !["canNext", "canBack", "canCancel"].every(
      (k) => typeof raw[k] === "boolean",
    )
  )
    fail();
  if (
    raw.needsAnswerRefresh != null &&
    typeof raw.needsAnswerRefresh !== "boolean"
  )
    fail();
  const sections = new Map();
  for (const section of raw.sections) {
    if (
      !object(section) ||
      !sectionId(section.sectionId) ||
      sections.has(section.sectionId) ||
      !boundedText(section.label) ||
      ![1, 2].includes(section.columns) ||
      !Number.isSafeInteger(section.depth) ||
      section.depth < 1 ||
      section.depth > 4 ||
      (section.parentId != null && !sectionId(section.parentId))
    )
      fail();
    sections.set(section.sectionId, { ...section, fields: [] });
  }
  for (const section of sections.values()) {
    const parent =
      section.parentId == null ? null : sections.get(section.parentId);
    if (
      (section.parentId != null && !parent) ||
      (parent && parent.depth + 1 !== section.depth) ||
      (!parent && section.depth !== 1)
    )
      fail();
  }
  const seen = new Set(),
    inputTypes = {},
    ungrouped = [];
  const fields = raw.inputs.map((input) => {
    if (
      !object(input) ||
      !api(input.inputId) ||
      seen.has(input.inputId) ||
      !boundedText(input.label) ||
      !["String", "Boolean", "Integer", "Decimal", "Date"].includes(
        input.type,
      ) ||
      typeof input.required !== "boolean" ||
      typeof input.allowClear !== "boolean" ||
      !Number.isSafeInteger(input.scale) ||
      input.scale < 0 ||
      input.scale > 18 ||
      !Array.isArray(input.choices) ||
      input.choices.length > 100 ||
      new Set(input.choices).size !== input.choices.length ||
      !input.choices.every(
        (x) => typeof x === "string" && x.length > 0 && x.length <= 256,
      ) ||
      (input.sectionId != null && !sections.has(input.sectionId)) ||
      (input.required && input.allowClear)
    )
      fail();
    seen.add(input.inputId);
    inputTypes[input.inputId] = input.type;
    if (input.sectionId == null) ungrouped.push(input.inputId);
    else sections.get(input.sectionId).fields.push(input.inputId);
    let value = input.value,
      dataType = {
        String: "STRING",
        Boolean: "PICKLIST",
        Integer: "INTEGER",
        Decimal: "DECIMAL",
        Date: "DATE",
      }[input.type];
    let choices = input.choices.map((value) => ({ value, label: value }));
    if (input.type === "Boolean") {
      if (value !== null && typeof value !== "boolean") fail();
      if (input.choices.length) fail();
      value = value === null ? null : String(value);
      choices = [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ];
    } else if (!scalar(value)) fail();
    if (choices.length) dataType = "PICKLIST";
    const field = {
      fieldApi: input.inputId,
      label: input.label,
      value,
      dataType,
      required: input.required,
      canClear: input.allowClear,
      choices,
    };
    if (dataType === "PICKLIST") field.length = 256;
    if (["INTEGER", "DECIMAL"].includes(dataType)) {
      field.precision = 28;
      field.scale = input.type === "Integer" ? 0 : input.scale;
      if (value !== null && nativeNumericValue(value, field) === null) fail();
    }
    if (input.type === "Date" && value !== null && !calendar(value)) fail();
    if (
      dataType === "PICKLIST" &&
      value !== null &&
      !choices.some((choice) => choice.value === value)
    )
      fail();
    return field;
  });
  const layout = {
    version: 1,
    sections: [...sections.values()]
      .filter((s) => s.fields.length)
      .map((s) => ({
        id: s.sectionId,
        label: s.label,
        columns: s.columns,
        fields: s.fields,
      })),
  };
  if (ungrouped.length)
    layout.sections.unshift({
      id: "FlowUngrouped",
      label: raw.label,
      columns: 1,
      fields: ungrouped,
    });
  resolveLayout(fields, layout);
  return {
    fields: checkedFields(fields),
    layout,
    inputTypes,
    screen: {
      label: raw.label,
      plainTextBlocks: [...raw.plainTextBlocks],
      canNext: raw.canNext,
      canBack: raw.canBack,
      canCancel: raw.canCancel,
      needsAnswerRefresh: raw.needsAnswerRefresh ?? false,
    },
  };
}
export function publicFlowView(raw) {
  if (!object(raw) || raw.contractVersion !== "screen-flow/v1") fail();
  if (raw.status === "Editing") {
    const screen = screenView(raw.screen);
    // Empty display-only screens remain navigable; record presentation requires at least one descriptor.
    const validated = recordView({
      ...raw,
      contractVersion: "record-edit/v1",
      fields: screen.fields.length
        ? screen.fields
        : [
            {
              fieldApi: "FlowDisplayOnly",
              label: "",
              value: null,
              dataType: "STRING",
              required: false,
              canClear: true,
              choices: [],
            },
          ],
      layout: undefined,
    });
    return { ...validated, ...screen, flow: true };
  }
  const view = recordView({ ...raw, contractVersion: "record-edit/v1" });
  const screen = raw.status === "Review" ? screenView(raw.screen) : null;
  return { ...view, flow: true, ...(screen ? { screen: screen.screen } : {}) };
}
export function flowAnswers(view, changes) {
  if (
    !view.flow ||
    view.status !== "Editing" ||
    !Array.isArray(changes) ||
    changes.length > 20
  )
    fail();
  const seen = new Set();
  return changes.map((change) => {
    if (
      !object(change) ||
      !Object.hasOwn(view.inputTypes, change.fieldApi) ||
      seen.has(change.fieldApi) ||
      !["keep", "set", "clear"].includes(change.operation)
    )
      fail();
    seen.add(change.fieldApi);
    const answer = { inputId: change.fieldApi, operation: change.operation };
    if (change.operation === "set") {
      if (!scalar(change.value) || change.value === null) fail();
      answer.value =
        view.inputTypes[change.fieldApi] === "Boolean"
          ? change.value === "true"
            ? true
            : change.value === "false"
              ? false
              : fail()
          : change.value;
    }
    return answer;
  });
}
