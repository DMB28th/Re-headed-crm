import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getCrmObjects from '@salesforce/apex/CardstackStudioController.getCrmObjects';
import getConfigValue from '@salesforce/apex/CardstackStudioController.getConfigValue';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';
import getObjectFields from '@salesforce/apex/CardstackStudioController.getObjectFields';

/**
 * cardstackObjectConfig — per-object Studio section.
 * Object picker + audience picker, then five sub-tabs:
 * Layouts (JSON editor + staging), Lists (JSON editor + staging),
 * Actions (enable/disable toggles parsed from the layout), Assignment
 * (audience -> layout mapping), Permissions (write policy editor).
 */
export default class CardstackObjectConfig extends LightningElement {
    @track selectedObject = '';
    @track audience = 'default';
    @track staging = {};
    @track draftValues = { layout: '', lists: '' };
    @track newAudience = '';
    @track actionDraftValues = [];

    wiredObjectsResult;

    @wire(getCrmObjects)
    wiredObjects(result) {
        this.wiredObjectsResult = result;
    }

    get objectOptions() {
        const { data } = this.wiredObjectsResult || {};
        if (!data) return [];
        return data.map(o => ({ label: `${o.label} (${o.api})`, value: o.api }));
    }

    get selectedObjectLabel() {
        const opt = this.objectOptions.find(o => o.value === this.selectedObject);
        return opt ? opt.label : this.selectedObject;
    }

    get audienceOptions() {
        const base = [{ label: 'Default (everyone)', value: 'default' }];
        (this.extraAudiences || []).forEach(a =>
            base.push({ label: a, value: a })
        );
        return base;
    }

    // ---------- Config keys ----------

    get layoutKey() {
        return `layout:${this.selectedObject}:${this.audience}`;
    }

    get listsKey() {
        return `exposures:${this.selectedObject}`;
    }

    // ---------- Staging ----------

    async loadStaging() {
        if (!this.selectedObject) return;
        try {
            const [layout, lists] = await Promise.all([
                getStagingInfo({ key: this.layoutKey }),
                getStagingInfo({ key: this.listsKey })
            ]);
            this.staging = { layout, lists };
            // Pre-fill editors with draft if present, else live.
            this.draftValues = {
                layout: this.pretty(layout.draft?.Draft_Value__c ?? layout.liveValue ?? this.sampleLayout()),
                lists: this.pretty(lists.draft?.Draft_Value__c ?? lists.liveValue ?? this.sampleLists())
            };
            this.parseActions(layout);
            this.parsePermissions(layout);
            this.buildAssignmentRows();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    get layoutStatusLabel() {
        const s = this.staging.layout;
        if (!s) return '';
        if (s.draft) return `Draft staged (${s.draft.Name})`;
        if (s.liveValue) return 'Published';
        return 'Not configured';
    }

    get layoutStatusClass() {
        const s = this.staging.layout;
        if (s?.draft) return 'slds-badge slds-theme_warning';
        if (s?.liveValue) return 'slds-badge slds-theme_success';
        return 'slds-badge';
    }

    get listsStatusLabel() {
        const s = this.staging.lists;
        if (!s) return '';
        if (s.draft) return `Draft staged (${s.draft.Name})`;
        if (s.liveValue) return 'Published';
        return 'Not configured';
    }

    get listsStatusClass() {
        const s = this.staging.lists;
        if (s?.draft) return 'slds-badge slds-theme_warning';
        if (s?.liveValue) return 'slds-badge slds-theme_success';
        return 'slds-badge';
    }

    // ---------- Layout tab ----------

    handleObjectChange(e) {
        this.selectedObject = e.detail.value;
        this.audience = 'default';
        this.extraAudiences = [];
        this.loadStaging();
    }

    handleAudienceChange(e) {
        this.audience = e.detail.value;
        this.loadStaging();
    }

    handleDraftEdit(e) {
        this.draftValues = { ...this.draftValues, [e.target.dataset.key]: e.target.value };
    }

    async stageLayout() {
        await this.stage(this.layoutKey, this.draftValues.layout, 'Layout');
    }

    async stageLists() {
        await this.stage(this.listsKey, this.draftValues.lists, 'Lists');
    }

    async stage(key, value, label) {
        try {
            JSON.parse(value || '{}');
        } catch {
            this.toast('Invalid JSON', `${label} draft is not valid JSON.`, 'error');
            return;
        }
        try {
            await saveDraft({ key, value });
            this.toast('Draft staged', `${label} draft saved. Publish it in the Publish Center.`, 'success');
            this.loadStaging();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    async loadLiveLayout() {
        try {
            const v = await getConfigValue({ key: this.layoutKey });
            this.draftValues = { ...this.draftValues, layout: this.pretty(v ?? this.sampleLayout()) };
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    async loadLiveLists() {
        try {
            const v = await getConfigValue({ key: this.listsKey });
            this.draftValues = { ...this.draftValues, lists: this.pretty(v ?? this.sampleLists()) };
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    // ---------- Actions tab ----------

    @track actionToggles = [];
    actionColumns = [
        { label: 'Action', fieldName: 'label', type: 'text' },
        { label: 'Type', fieldName: 'type', type: 'text' },
        { label: 'Enabled', fieldName: 'enabled', type: 'boolean', editable: true }
    ];

    parseActions(staging) {
        this.actionToggles = [];
        try {
            const cfg = JSON.parse(staging?.liveValue || staging?.draft?.Draft_Value__c || '{}');
            (cfg.actions || []).forEach((a, i) => {
                this.actionToggles.push({
                    name: a.name || `action-${i}`,
                    label: a.label || a.name || `Action ${i + 1}`,
                    type: a.type || 'unknown',
                    enabled: a.enabled !== false
                });
            });
        } catch { /* leave empty */ }
    }

    async handleActionToggleSave(e) {
        const updates = e.detail.draftValues;
        try {
            const staging = this.staging.layout;
            const raw = staging.draft?.Draft_Value__c ?? staging.liveValue ?? '{}';
            const cfg = JSON.parse(raw);
            cfg.actions = cfg.actions || [];
            updates.forEach(u => {
                const a = cfg.actions.find(x => (x.name || '') === u.name);
                if (a) a.enabled = u.enabled;
            });
            await saveDraft({ key: this.layoutKey, value: JSON.stringify(cfg, null, 2) });
            this.actionDraftValues = [];
            this.toast('Draft staged', 'Action toggles saved as a layout draft.', 'success');
            this.loadStaging();
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
    }

    // ---------- Assignment tab ----------

    @track extraAudiences = [];
    assignmentColumns = [
        { label: 'Audience', fieldName: 'audience' },
        { label: 'Layout key', fieldName: 'layoutKey' },
        { label: 'Status', fieldName: 'status' }
    ];

    buildAssignmentRows() {
        const rows = [{
            audience: 'default',
            layoutKey: this.layoutKey,
            status: this.staging.layout?.liveValue ? 'Published' : 'Not configured'
        }];
        (this.extraAudiences || []).forEach(a => {
            rows.push({
                audience: a,
                layoutKey: `layout:${this.selectedObject}:${a}`,
                status: 'Audience defined — configure its layout via the audience picker'
            });
        });
        this.assignmentRows = rows;
    }

    @track assignmentRows = [];

    handleNewAudienceInput(e) {
        this.newAudience = e.target.value;
    }

    addAudience() {
        const name = (this.newAudience || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!name) {
            this.toast('Invalid name', 'Use letters, numbers, dashes.', 'error');
            return;
        }
        if (name === 'default' || (this.extraAudiences || []).includes(name)) {
            this.toast('Duplicate', 'That audience already exists.', 'error');
            return;
        }
        this.extraAudiences = [...(this.extraAudiences || []), name];
        this.newAudience = '';
        this.buildAssignmentRows();
        this.toast('Audience added', `Pick "${name}" in the audience picker to configure its layout.`, 'success');
    }

    // ---------- Permissions tab ----------

    @track permissions = null;
    @track denylistText = '';

    parsePermissions(staging) {
        this.permissions = null;
        this.denylistText = '';
        try {
            const cfg = JSON.parse(staging?.liveValue || staging?.draft?.Draft_Value__c || '{}');
            if (cfg.permissions) {
                this.permissions = {
                    writeEnabled: !!cfg.permissions.writeEnabled
                };
                this.denylistText = (cfg.permissions.fieldDenylist || []).join('\n');
            }
        } catch { /* leave null */ }
    }

    handleWriteToggle(e) {
        this.permissions = { ...this.permissions, writeEnabled: e.target.checked };
    }

    handleDenylistEdit(e) {
        this.denylistText = e.target.value;
    }

    async stagePermissions() {
        try {
            const staging = this.staging.layout;
            const raw = staging.draft?.Draft_Value__c ?? staging.liveValue ?? this.sampleLayout();
            const cfg = JSON.parse(raw);
            cfg.permissions = {
                writeEnabled: !!this.permissions.writeEnabled,
                fieldDenylist: this.denylistText.split('\n').map(s => s.trim()).filter(Boolean)
            };
            await saveDraft({ key: this.layoutKey, value: JSON.stringify(cfg, null, 2) });
            this.toast('Draft staged', 'Permissions saved as a layout draft.', 'success');
            this.loadStaging();
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
    }

    // ---------- Helpers ----------

    pretty(json) {
        try {
            return JSON.stringify(JSON.parse(json), null, 2);
        } catch {
            return json || '';
        }
    }

    sampleLayout() {
        return JSON.stringify({
            name: 'default',
            recordCard: {
                sections: [{ label: 'Details', columns: 2, fields: [{ api: 'Name', editable: false }] }]
            },
            actions: [],
            permissions: { writeEnabled: false, fieldDenylist: [] }
        }, null, 2);
    }

    sampleLists() {
        return JSON.stringify({
            views: [],
            customLists: []
        }, null, 2);
    }

    msg(e) {
        return e?.body?.message || e?.message || 'Unknown error';
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
