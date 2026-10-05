import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';

const KEY = 'screens';

/**
 * cardstackCustomScreens — custom screen definitions for the flow runtime.
 * List + per-screen JSON editor, staged as one draft.
 */
export default class CardstackCustomScreens extends LightningElement {
    @track staging = null;
    @track screens = [];
    @track editing = null;
    @track editingJson = '';

    connectedCallback() {
        this.load();
    }

    async load() {
        try {
            this.staging = await getStagingInfo({ key: KEY });
            const raw = this.staging.draft?.Draft_Value__c ?? this.staging.liveValue ?? '[]';
            const arr = JSON.parse(raw);
            this.screens = Array.isArray(arr) ? arr : [];
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    get screenList() {
        return this.screens.map((s, i) => ({
            name: s.name || `screen-${i}`,
            label: s.label || s.name || `Screen ${i + 1}`
        }));
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

    selectScreen(e) {
        const name = e.currentTarget.dataset.name;
        const found = this.screens.find(s => (s.name || '') === name);
        if (found) {
            this.editing = { ...found };
            this.editingJson = JSON.stringify(found.config || found, null, 2);
        }
    }

    newScreen() {
        this.editing = { name: '', label: '', config: { elements: [] } };
        this.editingJson = JSON.stringify({ elements: [] }, null, 2);
    }

    handleNameEdit(e) { this.editing = { ...this.editing, name: e.target.value }; }
    handleLabelEdit(e) { this.editing = { ...this.editing, label: e.target.value }; }
    handleJsonEdit(e) { this.editingJson = e.target.value; }

    saveScreen() {
        if (!this.editing.name?.trim()) {
            this.toast('Invalid', 'Screen name is required.', 'error');
            return;
        }
        let config;
        try { config = JSON.parse(this.editingJson || '{}'); }
        catch {
            this.toast('Invalid JSON', 'Screen definition is not valid JSON.', 'error');
            return;
        }
        const updated = {
            name: this.editing.name.trim(),
            label: this.editing.label?.trim() || this.editing.name.trim(),
            config
        };
        const idx = this.screens.findIndex(s => (s.name || '') === updated.name);
        if (idx >= 0) {
            this.screens = this.screens.map((s, i) => i === idx ? updated : s);
        } else {
            this.screens = [...this.screens, updated];
        }
        this.editing = null;
        this.editingJson = '';
        this.toast('Screen saved', 'Stage the draft to persist it.', 'success');
    }

    deleteScreen() {
        if (!this.editing?.name) return;
        this.screens = this.screens.filter(s => (s.name || '') !== this.editing.name);
        this.editing = null;
        this.editingJson = '';
        this.toast('Screen removed', 'Stage the draft to persist it.', 'success');
    }

    async stage() {
        try {
            await saveDraft({ key: KEY, value: JSON.stringify(this.screens, null, 2) });
            this.toast('Draft staged', 'Publish it in the Publish Center.', 'success');
            this.load();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    msg(e) { return e?.body?.message || e?.message || 'Unknown error'; }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
