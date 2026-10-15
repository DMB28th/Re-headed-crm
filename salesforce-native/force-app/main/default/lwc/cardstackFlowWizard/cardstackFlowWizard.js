import { LightningElement, track, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getActiveFlows from '@salesforce/apex/CardstackStudioController.getActiveFlows';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getFlowLaunchCards';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';
import getStagingInfoFresh from '@salesforce/apex/CardstackStudioController.getStagingInfoFresh';
import DraftDialog from 'c/cardstackDraftDialog';
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
    @track saveUnknown = false;
    savedInputs = '';
    _generation = 0;
    _pendingSave;
    @track checkingSavedState = false;
    _reconciliation;
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
        const generation = ++this._generation;
        const before = this.inputSnapshot();
        this.ready = false; this.error = ''; this.loadError = false;
        try {
            const staging = await getStagingInfo();
            if (generation !== this._generation || before !== this.inputSnapshot()) return;
            this.policies = this.parsePolicies(staging.draft?.Draft_Value__c ?? staging.liveValue);
            if (this.initialPolicy) {
                const apiName = this.initialPolicy.apiName || this.initialPolicy.flowApiName;
                this.selectedFlow = { apiName, label: this.initialPolicy.label || apiName };
                this.flowLabel = this.selectedFlow.label;
                this.step = 2;
            }
            this.savedInputs = this.inputSnapshot();
        } catch (e) { if (generation === this._generation) { this.loadError = true; this.error = 'Could not read existing launch cards. ' + this.msg(e); } }
        finally { if (generation === this._generation) this.ready = true; }
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
    get cannotStage() { return !this.selectedFlow || !this.flowLabel.trim() || !this.ready || this.saving || this.checkingSavedState || this.loadError || this.saveUnknown; }
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
    async goBack() { if (this.initialPolicy) { if (await this.requestLeave()) this.done(); } else this.step = 1; }
    buildPolicy() {
        const existing = this.policies.find(p => (p.apiName || p.flowApiName) === this.selectedFlow.apiName) || ((this.initialPolicy?.apiName || this.initialPolicy?.flowApiName) === this.selectedFlow.apiName ? this.initialPolicy : null) || {};
        return { ...existing, apiName: this.selectedFlow.apiName, label: this.flowLabel.trim(), launchMode: 'salesforce' };
    }
    inputSnapshot() { return JSON.stringify({apiName:this.selectedFlow?.apiName || '',label:this.flowLabel}); }
    get isDirty() { return this.inputSnapshot() !== (this.savedInputs || JSON.stringify({apiName:'',label:''})); }
    get statusLabel() { return this.saveUnknown ? 'Save outcome unknown' : this.saving ? 'Saving…' : this.isDirty ? 'Unsaved changes' : 'Saved inputs'; }
    get saveLabel() { return this.saving ? 'Saving…' : 'Save draft'; }
    @api
    get leaveReady() { return this.ready && !this.saving && !this.checkingSavedState && !this.saveUnknown && !this.isDirty; }
    @api
    async requestLeave() {
        if (this.saving || this.checkingSavedState || this.saveUnknown || !this.ready) return false;
        if (!this.isDirty) return true;
        const inputs = this.inputSnapshot(), generation = this._generation;
        const choice = await DraftDialog.open({size:'small',label:'Unsaved launch card',description:'Save a draft, discard working changes, or stay in this editor.'});
        if (generation !== this._generation || inputs !== this.inputSnapshot() || this.saving || this.checkingSavedState || this.saveUnknown || !this.ready) return false;
        if (choice === 'discard') {
            if (this.saving || this.saveUnknown) return false;
            const saved = JSON.parse(this.savedInputs || '{"apiName":"","label":""}');
            this.selectedFlow = saved.apiName ? {apiName:saved.apiName,label:saved.label} : null;
            this.flowLabel = saved.label;
            return true;
        }
        if (choice !== 'save') return false;
        await this.stagePolicy(false);
        return this.leaveReady;
    }
    async stagePolicy(closeWhenSaved = true) {
        if (this.cannotStage) return false;
        this.saving = true;
        this.error = '';
        const inputs = this.inputSnapshot();
        const selection = {...this.selectedFlow};
        const label = this.flowLabel.trim();
        const generation = this._generation;
        let attemptedWrite = false;
        try {
            // Fresh snapshot preserves other cards. Capture submitted inputs before waiting.
            const latest = await getStagingInfoFresh({key:KEY});
            if (generation !== this._generation) return false;
            const policies = this.parsePolicies(latest.draft?.Draft_Value__c ?? latest.liveValue);
            const existing = policies.find(p => (p.apiName || p.flowApiName) === selection.apiName) || ((this.initialPolicy?.apiName || this.initialPolicy?.flowApiName) === selection.apiName ? this.initialPolicy : null) || {};
            const policy = {...existing,apiName:selection.apiName,label,launchMode:'salesforce'};
            const index = policies.findIndex(p => (p.apiName || p.flowApiName) === policy.apiName);
            if (index < 0) policies.push(policy); else policies[index] = policy;
            const value = JSON.stringify(policies, null, 2);
            this._pendingSave = {value,inputs,generation};
            attemptedWrite = true;
            try { await saveDraft({ key: KEY, value }); }
            catch (error) { this.error = this.msg(error); }
            const confirmed = await this.reconcileSave();
            if (confirmed) {
                this.toast('Launch card saved', 'Review & Publish to update cards used in chat.', 'success');
                if (closeWhenSaved && !this.isDirty) this.done('saved');
                else this.dispatchEvent(new CustomEvent('configchange',{detail:{keys:[KEY],operation:'save'},bubbles:true,composed:true}));
            }
            return confirmed;
        } catch (error) {
            this.error = this.msg(error);
            if (attemptedWrite) this.saveUnknown = true;
            this.toast('Could not save launch card', this.error, 'error');
            return false;
        } finally { this.saving = false; }
    }
    reconcileSave(pending = this._pendingSave) {
        if (!pending || pending !== this._pendingSave) return Promise.resolve(false);
        if (this._reconciliation?.pending === pending) return this._reconciliation.promise;
        const entry = {pending};
        this._reconciliation = entry;
        this.checkingSavedState = true;
        entry.promise = this.readSavedState(pending).finally(() => {
            if (this._reconciliation === entry) { this._reconciliation = null; this.checkingSavedState = false; }
        });
        return entry.promise;
    }
    isCurrentSave(pending) { return pending === this._pendingSave && pending.generation === this._generation; }
    async readSavedState(pending) {
        try {
            const latest = await getStagingInfoFresh({key:KEY});
            if (!this.isCurrentSave(pending)) return false;
            const policies = this.parsePolicies(latest.draft?.Draft_Value__c ?? latest.liveValue);
            const confirmed = !!latest.draft && JSON.stringify(policies) === JSON.stringify(JSON.parse(pending.value));
            this.policies = policies;
            this.saveUnknown = false;
            this._pendingSave = null;
            if (confirmed) { this.savedInputs = pending.inputs; this.error = ''; }
            else this.error = this.error || 'Saved launch cards differ from this submission. Your inputs are retained. Review before retrying.';
            return confirmed;
        } catch (error) {
            if (!this.isCurrentSave(pending)) return false;
            this.saveUnknown = true;
            this.error = 'Save outcome unknown. Check saved state before retrying or leaving. ' + this.msg(error);
            return false;
        }
    }
    _savedStateCheck;
    checkSavedState() {
        if (this.saving) return Promise.resolve(false);
        const pending = this._pendingSave;
        if (this._savedStateCheck?.pending === pending) return this._savedStateCheck.promise;
        const check = {pending};
        this._savedStateCheck = check;
        check.promise = this.reconcileSave(pending).then(confirmed => {
            if (confirmed) this.dispatchEvent(new CustomEvent('configchange',{detail:{keys:[KEY],operation:'save'},bubbles:true,composed:true}));
            return confirmed;
        }).finally(() => { if (this._savedStateCheck === check) this._savedStateCheck = null; });
        return check.promise;
    }
    async cancel() { if (await this.requestLeave()) this.done(); }
    done(outcome = 'canceled') { this.dispatchEvent(new CustomEvent('wizarddone', { detail: { outcome }, bubbles: true, composed: true })); }
    msg(e) { return e?.body?.message || e?.message || 'Could not load Salesforce flows.'; }
    toast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
}
