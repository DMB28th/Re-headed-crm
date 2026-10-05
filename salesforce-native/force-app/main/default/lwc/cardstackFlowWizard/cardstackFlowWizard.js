import { LightningElement, track, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getActiveFlows from '@salesforce/apex/CardstackStudioController.getActiveFlows';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getFlowLaunchCards';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';
const KEY = 'flows';
export default class CardstackFlowWizard extends LightningElement {
    @api initialPolicy;
    @track step = 1;
    @track flowSearch = '';
    @track selectedFlow = null;
    @track flowLabel = '';
    @track saving = false;
    @track ready = false;
    @track error = '';
    loadError = false;
    policies = [];
    wiredFlowsResult;
    @wire(getActiveFlows)
    wiredFlows(result) { this.wiredFlowsResult = result; }
    connectedCallback() { this.loadExisting(); }
    parsePolicies(raw) {
        const parsed = JSON.parse(raw || '[]');
        if (!Array.isArray(parsed)) throw new Error('Saved launch cards must be a list.');
        return parsed;
    }
    async loadExisting() {
        this.ready = false; this.error = ''; this.loadError = false;
        try {
            const staging = await getStagingInfo();
            this.policies = this.parsePolicies(staging.draft?.Draft_Value__c ?? staging.liveValue);
            if (this.initialPolicy) {
                const apiName = this.initialPolicy.apiName || this.initialPolicy.flowApiName;
                this.selectedFlow = { apiName, label: this.initialPolicy.label || apiName };
                this.flowLabel = this.selectedFlow.label;
                this.step = 2;
            }
        } catch (e) { this.loadError = true; this.error = 'Could not read existing launch cards. ' + this.msg(e); }
        finally { this.ready = true; }
    }
    get flowsLoading() { return !this.wiredFlowsResult || (!this.wiredFlowsResult.data && !this.wiredFlowsResult.error); }
    get flowLoadError() { return this.wiredFlowsResult?.error ? this.msg(this.wiredFlowsResult.error) : ''; }
    get allFlows() { return (this.wiredFlowsResult?.data || []).filter(f => ['Flow', 'AutoLaunchedFlow'].includes(f.processType)); }
    get filteredFlows() {
        const q = this.flowSearch.toLowerCase().trim();
        return this.allFlows.filter(f => !q || (f.label + ' ' + f.apiName).toLowerCase().includes(q)).map(f => ({ ...f,
            typeLabel: f.processType === 'Flow' ? 'Screen flow' : 'Autolaunched flow',
            selected: f.apiName === this.selectedFlow?.apiName,
            rowClass: f.apiName === this.selectedFlow?.apiName ? 'flow-choice selected' : 'flow-choice' }));
    }
    get hasFlows() { return this.allFlows.length > 0; }
    get isStep1() { return this.step === 1; }
    get isStep2() { return this.step === 2; }
    get stepTitle() { return this.step === 1 ? '1. Choose flow' : '2. Review launch card'; }
    get cannotContinue() { return !this.selectedFlow || !this.ready || this.loadError; }
    get cannotStage() { return !this.selectedFlow || !this.flowLabel.trim() || !this.ready || this.saving || this.loadError; }
    handleFlowSearch(e) { this.flowSearch = e.target.value; }
    handlePickFlow(e) {
        const flow = this.allFlows.find(f => f.apiName === e.currentTarget.dataset.apiname);
        if (!flow) return;
        if (flow.apiName !== this.selectedFlow?.apiName) {
            const existing = this.policies.find(p => (p.apiName || p.flowApiName) === flow.apiName);
            this.flowLabel = existing?.label || flow.label || flow.apiName;
        }
        this.selectedFlow = { ...flow };
    }
    handleLabelInput(e) { this.flowLabel = e.target.value; }
    goToReview() { if (!this.cannotContinue) this.step = 2; }
    get backLabel() { return this.initialPolicy ? 'Back to cards' : 'Choose a different flow'; }
    goBack() { if (this.initialPolicy) this.done(); else this.step = 1; }
    buildPolicy() {
        const existing = this.policies.find(p => (p.apiName || p.flowApiName) === this.selectedFlow.apiName) || ((this.initialPolicy?.apiName || this.initialPolicy?.flowApiName) === this.selectedFlow.apiName ? this.initialPolicy : null) || {};
        return { ...existing, apiName: this.selectedFlow.apiName, label: this.flowLabel.trim(), launchMode: 'salesforce' };
    }
    async stagePolicy() {
        if (this.cannotStage) return;
        this.saving = true;
        try {
            // Re-read before saving so other cards staged during this editor session survive.
            const latest = await getStagingInfo();
            this.policies = this.parsePolicies(latest.draft?.Draft_Value__c ?? latest.liveValue);
            const policy = this.buildPolicy();
            const index = this.policies.findIndex(p => (p.apiName || p.flowApiName) === policy.apiName);
            const policies = [...this.policies];
            if (index < 0) policies.push(policy); else policies[index] = policy;
            await saveDraft({ key: KEY, value: JSON.stringify(policies, null, 2) });
            this.toast('Launch card staged', 'Publish the draft to make this card name available in chat.', 'success');
            this.done();
        } catch (e) { this.error = this.msg(e); this.toast('Could not stage launch card', this.error, 'error'); }
        finally { this.saving = false; }
    }
    cancel() { this.done(); }
    done() { this.dispatchEvent(new CustomEvent('wizarddone', { bubbles: true, composed: true })); }
    msg(e) { return e?.body?.message || e?.message || 'Could not load Salesforce flows.'; }
    toast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
}
