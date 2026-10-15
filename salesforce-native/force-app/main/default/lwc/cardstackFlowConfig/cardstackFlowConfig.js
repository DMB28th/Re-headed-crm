import { LightningElement, track, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getFlowLaunchCards';
import getStagingInfoFresh from '@salesforce/apex/CardstackStudioController.getStagingInfoFresh';
import getActiveFlows from '@salesforce/apex/CardstackStudioController.getActiveFlows';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';
const KEY = 'flows';
export default class CardstackFlowConfig extends LightningElement {
    @track staging = null;
    @track policies = [];
    @track showWizard = false;
    @track initialPolicy = null;
    @track search = '';
    @track loading = false;
    @track error = '';
    wiredFlowsResult;
    _loadRequest = 0;
    _refreshNeeded = false;
    @wire(getActiveFlows)
    wiredFlows(result) { this.wiredFlowsResult = result; }
    connectedCallback() { this.load(); }
    parsePolicies(raw) {
        const parsed = JSON.parse(raw || '[]');
        if (!Array.isArray(parsed)) throw new Error('Saved launch cards must be a list.');
        return parsed;
    }
    @api
    refreshPending() { return this._refreshNeeded ? this.refresh([KEY]) : Promise.resolve(); }
    @api
    refresh(keys = []) {
        if (!keys.includes(KEY)) return Promise.resolve();
        this._refreshNeeded = true;
        return this.load(true);
    }
    async load(fresh = false) {
        const request = ++this._loadRequest;
        this.loading = true; this.error = '';
        try {
            const staging = fresh ? await getStagingInfoFresh({key:KEY}) : await getStagingInfo();
            if (request !== this._loadRequest) return;
            const policies = this.parsePolicies(staging.draft?.Draft_Value__c ?? staging.liveValue);
            this.staging = staging;
            this.policies = policies;
            this._refreshNeeded = false;
        } catch (e) { if (request === this._loadRequest) this.error = this.msg(e); }
        finally { if (request === this._loadRequest) this.loading = false; }
    }
    get flowRows() {
        let live = []; try { live = this.parsePolicies(this.staging?.liveValue); } catch { /* visible load error handles bad working data */ }
        const q = this.search.toLowerCase().trim();
        return this.policies.map(p => {
            const apiName = p.apiName || p.flowApiName;
            const published = live.find(f => (f.apiName || f.flowApiName) === apiName);
            const changed = !published || JSON.stringify(published) !== JSON.stringify(p);
            const definition = this.wiredFlowsResult?.data?.find(f => f.apiName === apiName);
            return { ...p, apiName, label: p.label || definition?.label || apiName,
                status: this.staging?.draft && changed ? 'Draft' : 'Published',
                statusClass: this.staging?.draft && changed ? 'slds-badge slds-theme_warning' : 'slds-badge slds-theme_success',
                availability: this.wiredFlowsResult?.data ? definition ? 'Active in Salesforce' : 'Flow is not active or available' : 'Checking Salesforce…' };
        }).filter(p => !q || (p.label + ' ' + p.apiName).toLowerCase().includes(q));
    }
    get hasCards() { return this.policies.length > 0; }
    get hasDraft() { return !!this.staging?.draft; }
    get draftMessage() { return 'Flow launch card changes are saved as a draft. Review and publish to update the cards used in chat.'; }
    handleSearch(e) { this.search = e.target.value; }
    @api
    async requestLeave() {
        if (!this.showWizard) return true;
        const wizard = this.template.querySelector('c-cardstack-flow-wizard');
        if (!wizard?.requestLeave || !await wizard.requestLeave()) return false;
        return this.template.querySelector('c-cardstack-flow-wizard') === wizard && wizard.leaveReady === true;
    }
    @api
    async openWizard() { if (!await this.requestLeave()) return; this.initialPolicy = null; this.showWizard = true; }
    editCard(e) { this.initialPolicy = this.policies.find(p => (p.apiName || p.flowApiName) === e.currentTarget.dataset.api); this.showWizard = true; }
    async removeCard(e) {
        const apiName = e.currentTarget.dataset.api;
        try {
            const latest = await getStagingInfo();
            const policies = this.parsePolicies(latest.draft?.Draft_Value__c ?? latest.liveValue);
            await saveDraft({ key: KEY, value: JSON.stringify(policies.filter(p => (p.apiName || p.flowApiName) !== apiName), null, 2) });
            this.toast('Removal staged', 'Publish the draft to remove this launch card. The Salesforce flow remains available.', 'success');
            await this.load();
            this.notifyConfigChange();
        } catch (e) { this.toast('Could not stage removal', this.msg(e), 'error'); }
    }
    async handleWizardDone(event) {
        this.showWizard = false;
        // The wizard's acknowledged write is independent of a follow-up read.
        if (event?.detail?.outcome === 'saved') this.notifyConfigChange();
        await this.load();
    }
    notifyConfigChange() { this.dispatchEvent(new CustomEvent('configchange', { detail: { keys: [KEY], operation: 'save' }, bubbles: true, composed: true })); }
    openPublish() { this.dispatchEvent(new CustomEvent('navigatetab', { detail: { tab: 'publish' }, bubbles: true, composed: true })); }
    msg(e) { return e?.body?.message || e?.message || 'Could not load launch cards.'; }
    toast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
}
