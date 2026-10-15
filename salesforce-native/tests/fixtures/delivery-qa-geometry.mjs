import { mountRecordEdit } from '../../ui/opportunity-edit/controller.mjs';
import { applyWorkspaceContext } from '../../ui/opportunity-edit/workspace.mjs';

// Local presentation fixture. No Salesforce, host bridge, network, storage, or writes.
export const genericCaseCard = () => ({ structuredContent: {
  contractVersion: 'record-card/v1', objectApiName: 'Case',
  recordId: '500000000000001AAA', recordName: 'Synthetic Case 000001',
  status: 'Card', errors: [], diff: [], revision: 1, expiresAt: '2026-10-14T23:59:00Z',
  fields: [
    ['Subject', 'Subject', 'STRING', 'Synthetic sizing fixture'],
    ['Description', 'Description', 'TEXTAREA', 'Read-only local QA drawer geometry.'],
    ['SuppliedEmail', 'Contact email', 'EMAIL', 'fixture@example.test'],
    ['SuppliedPhone', 'Contact phone', 'PHONE', '+1 555 0100'],
  ].map(([fieldApi, label, dataType, value]) => ({ fieldApi, label, dataType, value,
    ...(['EMAIL', 'PHONE'].includes(dataType) ? { length: 80 } : {}), required: fieldApi === 'Subject', canClear: fieldApi !== 'Subject', choices: [] })),
  actions: [{ name: 'syntheticCaseEdit', label: 'Edit Case', type: 'record-edit' }],
}, _meta: { 'cardstack/recordEdit': { interactionKey: 'a'.repeat(64), reviewGrant: null } } });

const sdk = {
  connect: async () => {},
  callServerTool: async () => { throw new Error('Read-only local sizing fixture has no native tools.'); },
};
const controller = mountRecordEdit(sdk, document, {
  deliveryQaEnabled: true,
  hostStyles: context => applyWorkspaceContext(document, context),
});
applyWorkspaceContext(document, { containerDimensions: { width: 760, height: 500 } });
sdk.ontoolresult(genericCaseCard());
const measure = document.createElement('button');
measure.type = 'button'; measure.textContent = 'Measure local workspace';
measure.dataset.geometryMeasure = '';
const output = document.createElement('output'); output.dataset.geometry = '';
measure.addEventListener('click', () => {
  const root = document.querySelector('#root');
  const rect = root.getBoundingClientRect();
  output.textContent = JSON.stringify({ height: rect.height, width: rect.width,
    scrollHeight: root.scrollHeight, clientHeight: root.clientHeight,
    drawerPresent: !!root.querySelector('[data-delivery-qa]') });
});
document.body.append(measure, output);
addEventListener('pagehide', () => controller.disconnect(), { once: true });
