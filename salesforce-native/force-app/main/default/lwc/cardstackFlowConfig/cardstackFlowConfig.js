import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import getConfigValue from '@salesforce/apex/CardstackStudioController.getConfigValue';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';

const KEY = 'flows';

/**
 * cardstackFlowConfig — flow render-mode policies.
 * JSON editor + staging, with a read-only table of current policies.
 */
export default class CardstackFlowConfig extends LightningElement {
    @track staging = null;
    @track draftValue = '';
    @track showWizard = false;

    columns = [
        { label: 'Flow API Name', fieldName: 'apiName' },
        { label: 'Render Mode', fieldName: 'mode' },
        { label: 'Label', fieldName: 'label' }
    ];

    connectedCallback() {
        this.load();
    }

    async load() {
        try {
            this.staging = await getStagingInfo({ key: KEY });
            const raw = this.staging.draft?.Draft_Value__c ?? this.staging.liveValue;
            this.draftValue = this.pretty(raw ?? this.sample());
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    get flowRows() {
        try {
            const arr = JSON.parse(this.staging?.liveValue || '[]');
            return Array.isArray(arr) ? arr.map((f, i) => ({
                apiName: f.apiName || f.flowApiName || `flow-${i}`,
                mode: f.renderMode || f.mode || 'form',
                label: f.label || ''
            })) : [];
        } catch {
            return [];
        }
    }

    get statusLabel() {
        if (this.staging?.draft) return `Draft staged (${this.staging.draft.Name})`;
        if (this.staging?.liveValue) return 'Published';
        return 'Not configured';
    }

    get statusClass() {
        if (this.staging?.draft) return 'slds-badge slds-theme_warning';
        if (this.staging?.liveValue) return 'slds-badge slds-theme_success';
        return 'slds-badge';
    }

    handleEdit(e) {
        this.draftValue = e.target.value;
    }

    @api
    openWizard() {
        this.showWizard = true;
    }

    handleWizardDone() {
        this.showWizard = false;
        this.load();
    }

    async stage() {
        try { JSON.parse(this.draftValue || '[]'); }
        catch {
            this.toast('Invalid JSON', 'The draft is not valid JSON.', 'error');
            return;
        }
        try {
            await saveDraft({ key: KEY, value: this.draftValue });
            this.toast('Draft staged', 'Publish it in the Publish Center.', 'success');
            this.load();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    async loadLive() {
        try {
            const v = await getConfigValue({ key: KEY });
            this.draftValue = this.pretty(v ?? this.sample());
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    pretty(json) {
        try { return JSON.stringify(JSON.parse(json), null, 2); }
        catch { return json || ''; }
    }

    sample() {
        return JSON.stringify([
            { apiName: 'My_Flow', renderMode: 'form', label: 'My Flow' }
        ], null, 2);
    }

    msg(e) { return e?.body?.message || e?.message || 'Unknown error'; }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
