/**
 * Payload assembly lives in @cardstack/core (core/assemble.ts) so Studio's
 * live preview shares the exact codepath. Re-exported here for server code.
 */
export {
  buildRecordCardPayload,
  buildResultsTablePayload,
  fieldNotes,
  provenanceFor,
  type PayloadSource,
} from "@cardstack/core";
