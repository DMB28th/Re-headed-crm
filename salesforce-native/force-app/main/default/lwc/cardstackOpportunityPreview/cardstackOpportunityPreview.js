import recordAuthoring from 'c/cardstackRecordAuthoring';
import { LightningElement, api } from 'lwc';
import previewResource from '@salesforce/resourceUrl/CardstackOpportunityPreviewUi';

// Presentation-only boundary: values are fixed synthetic examples, never record data.
const APIS = ['StageName', 'CloseDate', 'Amount'];
const FIELDS = [
    { fieldApi: 'StageName', label: 'Stage', value: 'Discovery', dataType: 'PICKLIST', required: true, canClear: false, choices: [{ label: 'Discovery', value: 'Discovery' }, { label: 'Closed won', value: 'Closed Won' }] },
    { fieldApi: 'CloseDate', label: 'Close date', value: '2026-11-30', dataType: 'DATE', required: true, canClear: false, choices: [] },
    { fieldApi: 'Amount', label: 'Amount', value: '10000', dataType: 'CURRENCY', currencyCode: 'USD', required: false, canClear: true, choices: [] }
];
const text = (value, length) => typeof value === 'string' && value.length > 0 && value.length <= length && !/[\u0000-\u001f\u007f<>]/.test(value);
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
function checkedLayout(value, apis = APIS) {
    if (value == null) return null;
    if (!keys(value, ['version', 'sections']) || value.version !== 1 || !Array.isArray(value.sections) || !value.sections.length || value.sections.length > 20) throw new Error('Invalid layout');
    const seen = new Set(), ids = new Set();
    for (const section of value.sections) {
        if (!keys(section, ['id', 'label', 'columns', 'fields']) || !text(section.id, 80) || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(section.id) || ids.has(section.id) || !text(section.label, 160) || ![1, 2].includes(section.columns) || !Array.isArray(section.fields) || !section.fields.length) throw new Error('Invalid section');
        ids.add(section.id);
        for (const field of section.fields) {
            if (!apis.includes(field) || seen.has(field)) throw new Error('Invalid field reference');
            seen.add(field);
        }
    }
    if (seen.size !== apis.length) throw new Error('Missing field reference');
    return JSON.parse(JSON.stringify(value));
}
export default class CardstackOpportunityPreview extends LightningElement {
    resourceUrl = previewResource;
    errorMessage = '';
    _layout = null;
    _scenario = 'Opportunity';
    @api
    get scenario() { return this._scenario; }
    set scenario(value) {
        this._scenario = value;
        try {
            if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value || '')) throw new Error('Invalid scenario');
            this._layout = checkedLayout(this._layout, this.previewFields.map(f => f.fieldApi)); this.errorMessage = ''; this.sendPreview();
        } catch { this.errorMessage = 'Synthetic preview unavailable: invalid scenario or layout.'; }
    }
    _fields = null;
    _nativeKeyPrefix = '006';
    @api
    get nativeKeyPrefix() { return this._nativeKeyPrefix; }
    set nativeKeyPrefix(value) { this._nativeKeyPrefix = value; try { recordAuthoring.syntheticId(value); this.errorMessage = ''; this.sendPreview(); } catch { this.errorMessage = 'Synthetic preview unavailable: invalid native key prefix.'; } }
    @api
    get fields() { return this._fields; }
    set fields(value) {
        try { this._fields = recordAuthoring.checkedPreviewFields(value); this.errorMessage = ''; this.sendPreview(); }
        catch { this._fields = []; this.errorMessage = 'Synthetic preview unavailable: invalid fields.'; }
    }
    get previewFields() { return this._fields || (this._scenario === 'Opportunity' ? FIELDS : []); }
    _loaded = false;
    _disconnected = false;
    @api
    get layout() { return this._layout; }
    set layout(value) {
        try { if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(this._scenario || '')) throw new Error('Invalid scenario'); this._layout = checkedLayout(value, this.previewFields.map(f => f.fieldApi)); this.errorMessage = ''; this.sendPreview(); }
        catch { this._layout = {}; this.errorMessage = 'Synthetic preview unavailable: invalid layout. Fix section and field references.'; }
    }
    connectedCallback() {
        this._disconnected = false;
        this._onMessage = event => this.handlePreviewMessage(event);
        window.addEventListener('message', this._onMessage);
    }
    disconnectedCallback() {
        this._disconnected = true;
        this._loaded = false;
        window.removeEventListener('message', this._onMessage);
    }
    handleFrameLoad() { if (!this._disconnected) { this._loaded = true; this.sendPreview(); } }
    sendPreview() {
        if (!this._loaded || this._disconnected || this.errorMessage) return;
        if (!this.previewFields.length) { this.errorMessage = 'Synthetic preview unavailable: native fields have not loaded.'; return; }
        const selected = this.previewFields;
        try {
            if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(this._scenario || '')) throw Error('Invalid scenario');
            recordAuthoring.syntheticId(this._nativeKeyPrefix);
            if (this._fields == null && (this._scenario !== 'Opportunity' || this._nativeKeyPrefix !== '006')) throw Error('Invalid Stage identity');
            checkedLayout(this._layout, selected.map(f => f.fieldApi));
        } catch { this.errorMessage = 'Synthetic preview unavailable: invalid layout.'; return; }
        const frame = this.template.querySelector('iframe');
        if (frame?.contentWindow) frame.contentWindow.postMessage({ type: 'cardstack-preview/v1', scenario: this._scenario, objectApiName: this._scenario, nativeKeyPrefix: this._nativeKeyPrefix, recordId: recordAuthoring.syntheticId(this._nativeKeyPrefix), mode: this._fields ? 'record-edit' : 'opportunity-stage', fields: JSON.parse(JSON.stringify(selected)), layout: this._layout }, '*');
    }
    handlePreviewMessage(event) {
        const frame = this.template.querySelector('iframe');
        if (this._disconnected || event.source !== frame?.contentWindow) return;
        // The bridge-free preview emits no messages. Even frame messages grant no actions.
    }
}
