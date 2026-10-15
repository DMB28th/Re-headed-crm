// Public DTO projection for the existing Opportunity contracts. No retained authority.
import { checkedFields, boundedText, scalar } from './fields.mjs';
const FIELDS = ['StageName', 'CloseDate', 'Amount'];
const STATES = ['Editing', 'Review', 'Completed', 'Cancelled', 'Expired', 'Conflict', 'Rejected'];
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const revision = (x) => Number.isSafeInteger(x) && x > 0;
const key = (x) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const timestamp = (x) =>
  typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x) && Number.isFinite(Date.parse(x));
function recordId(id) {
  if (typeof id !== 'string' || !/^006[A-Za-z0-9]{15}$/.test(id)) return false;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  let suffix = '';
  for (let i = 0; i < 15; i += 5) {
    let mask = 0;
    for (let j = 0; j < 5; j++) if (/[A-Z]/.test(id[i + j])) mask |= 1 << j;
    suffix += alphabet[mask];
  }
  return id.slice(15) === suffix;
}
function publicErrors(rows) {
  if (!Array.isArray(rows) || rows.length > 10) throw Error('INVALID_VIEW');
  return rows.map((e) => {
    if (
      !object(e) ||
      !boundedText(e.message) ||
      typeof e.code !== 'string' ||
      !/^[A-Z_]{1,80}$/.test(e.code) ||
      (e.fieldApi != null && !FIELDS.includes(e.fieldApi))
    )
      throw Error('INVALID_VIEW');
    return { fieldApi: e.fieldApi ?? null, code: e.code, message: e.message };
  });
}
function publicDiff(rows) {
  if (!Array.isArray(rows) || rows.length > 3) throw Error('INVALID_VIEW');
  const seen = new Set();
  return rows.map((r) => {
    if (
      !object(r) ||
      !FIELDS.includes(r.fieldApi) ||
      seen.has(r.fieldApi) ||
      !boundedText(r.label) ||
      !scalar(r.beforeValue) ||
      !scalar(r.afterValue)
    )
      throw Error('INVALID_VIEW');
    seen.add(r.fieldApi);
    return {
      fieldApi: r.fieldApi,
      label: r.label,
      beforeValue: r.beforeValue,
      afterValue: r.afterValue,
    };
  });
}
function publicView(raw) {
  if (!object(raw)) throw Error('INVALID_VIEW');
  if (raw.contractVersion === 'opportunity-card/v1') {
    if (
      !recordId(raw.recordId) ||
      !boundedText(raw.recordName) ||
      !Array.isArray(raw.actions) ||
      raw.actions.length > 50
    )
      throw Error('INVALID_CARD');
    const fields = checkedFields(raw.fields);
    if (fields.some((f) => !FIELDS.includes(f.fieldApi))) throw Error('INVALID_CARD');
    const actions = raw.actions.map((a) => {
      if (!object(a) || !/^[A-Za-z0-9_-]{1,80}$/.test(a.name) || !boundedText(a.label) || a.type !== 'record-edit')
        throw Error('INVALID_CARD');
      return { name: a.name, label: a.label };
    });
    return {
      status: 'Card',
      recordId: raw.recordId,
      recordName: raw.recordName,
      fields,
      actions,
    };
  }
  if (raw.contractVersion !== 'opportunity-edit/v1' || !STATES.includes(raw.status)) throw Error('INVALID_VIEW');
  const errors = publicErrors(raw.errors ?? []);
  const view = {
    status: raw.status,
    errors,
    fields: checkedFields(raw.fields ?? []),
    diff: publicDiff(raw.diff ?? []),
  };
  if (['Editing', 'Review', 'Completed'].includes(raw.status)) {
    if (!recordId(raw.recordId) || !boundedText(raw.recordName) || !revision(raw.revision)) throw Error('INVALID_VIEW');
    Object.assign(view, {
      recordId: raw.recordId,
      recordName: raw.recordName,
      revision: raw.revision,
    });
  } else if (raw.recordId != null) {
    if (!recordId(raw.recordId) || !boundedText(raw.recordName) || !revision(raw.revision)) throw Error('INVALID_VIEW');
    Object.assign(view, {
      recordId: raw.recordId,
      recordName: raw.recordName,
      revision: raw.revision,
    });
  }
  if (raw.status === 'Editing') {
    if (
      !timestamp(raw.expiresAt) ||
      view.fields.length !== 3 ||
      view.fields.some((f, i) => f.fieldApi !== FIELDS[i]) ||
      raw.fields.some((f) => typeof f.required !== 'boolean' || typeof f.canClear !== 'boolean')
    )
      throw Error('INVALID_VIEW');
    view.expiresAt = raw.expiresAt;
  }
  if (raw.status === 'Review') {
    if (!timestamp(raw.expiresAt) || !revision(raw.reviewRevision) || view.diff.length === 0)
      throw Error('INVALID_VIEW');
    Object.assign(view, {
      expiresAt: raw.expiresAt,
      reviewRevision: raw.reviewRevision,
    });
  }
  if (raw.status === 'Completed') {
    const r = raw.receipt;
    if (
      !object(r) ||
      !/^(receipt-[a-f0-9]{32})$/.test(r.reference) ||
      !boundedText(r.actorDisplayName) ||
      !timestamp(r.completedAt) ||
      !['saved', 'noChanges'].includes(r.status)
    )
      throw Error('INVALID_RECEIPT');
    const diff = publicDiff(r.diff);
    if ((r.status === 'saved' && diff.length === 0) || (r.status === 'noChanges' && diff.length !== 0))
      throw Error('INVALID_RECEIPT');
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
