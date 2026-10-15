import * as opportunity from "./contract.mjs";
import * as record from "./record-contract.mjs";
const adapter = (contract, prefix, privateMetaKey) =>
  Object.freeze({
    publicView: contract.publicView,
    recordId: contract.recordId,
    privateMetaKey,
    tools: Object.freeze({
      open: `${prefix}_open`,
      ...(prefix === "cardstack_record"
        ? {
            search: "cardstack_record_search",
            relatedDefinitions: "cardstack_record_related_definitions",
            relatedPage: "cardstack_record_related_page",
            relatedOpenChild: "cardstack_record_related_open_child",
            flowStart: "cardstack_record_flow_start",
            flowTransition: "cardstack_record_flow_transition",
          }
        : {}),
      start: `${prefix}_edit_start`,
      transition: `${prefix}_edit_transition`,
      refresh: `${prefix}_refresh`,
    }),
  });
export const opportunityAdapter = adapter(
  opportunity,
  "cardstack_opportunity",
  "cardstack/opportunityEdit",
);
export const recordAdapter = adapter(
  record,
  "cardstack_record",
  "cardstack/recordEdit",
);
