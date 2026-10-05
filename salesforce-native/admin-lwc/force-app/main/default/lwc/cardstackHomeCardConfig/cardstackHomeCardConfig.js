import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import getConfigValue from '@salesforce/apex/CardstackStudioController.getConfigValue';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';

const KEY = 'homecard';

/**
 * cardstackHomeCardConfig — home dashboard card editor with live preview.
 */
export default class CardstackHomeCardConfig extends LightningElement {
    @track staging = null;
    @track draftValue = '';

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

    get preview() {
        try {
            const cfg = JSON.parse(this.draftValue || '{}');
            return {
                title: cfg.title || '',
                subtitle: cfg.subtitle || '',
                sections: (cfg.sections || []).map(s => ({
                    label: s.label || 'Section',
                    items: (s.items || []).map(it => ({
                        label: it.label || it.api || '',
                        value: it.value || it.api || ''
                    }))
                }))
            };
        } catch {
            return { title: '', subtitle: '', sections: [] };
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

    async stage() {
        try { JSON.parse(this.draftValue || '{}'); }
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
        return JSON.stringify({
            title: 'My CRM',
            subtitle: 'Good morning',
            sections: [
                {
                    label: 'Today',
                    items: [
                        { label: 'Open opportunities', api: 'openOpps', value: '12' },
                        { label: 'Tasks due', api: 'tasksDue', value: '5' }
                    ]
                }
            ]
        }, null, 2);
    }

    msg(e) { return e?.body?.message || e?.message || 'Unknown error'; }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
