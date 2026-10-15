import { LightningElement, api } from 'lwc';
import hasManageConnections from '@salesforce/customPermission/Cardstack_Manage_Connections';
import loadForUi from '@salesforce/apex/CardstackConnectionSetupController.loadForUi';
import saveForUi from '@salesforce/apex/CardstackConnectionSetupController.saveForUi';
import checkForUi from '@salesforce/apex/CardstackConnectionSetupController.checkForUi';
import observeForUi from '@salesforce/apex/CardstackConnectionSetupController.observeForUi';
import exportSummary from '@salesforce/apex/CardstackConnectionSetupController.exportSummary';
import { STEPS, createState, parseView, parseReceipt, parseSupportSummary, acceptView, editDraft, recordFailure, savePayload, connectionSummary, recovery, setupStages, nextSetupStage } from 'c/cardstackConnectionSetupModel';

/** Admin configuration and actor-scoped evidence remain distinct from manual guide history. */
export default class CardstackConnectionSetup extends LightningElement {
    state = createState();
    client = 'claude';
    expanded = true;
    selectedStage = '';
    focusStage = false;
    busy = false;
    receiptReference = '';
    observation = null;
    supportSummary = '';
    clientOptions = [{label:'Claude',value:'claude'},{label:'ChatGPT',value:'chatgpt'}];
    connectedCallback() { this.initialize(); }
    async initialize() {
        if (!hasManageConnections) {
            for (const client of ['claude','chatgpt']) recordFailure(this.state,client,new Error('NOT_AUTHORIZED'));
            this.changed(); return;
        }
        this.busy = true;
        await Promise.all(['claude','chatgpt'].map(client => this.read(client, false)));
        this.busy = false;
    }
    async read(client, discard) {
        try {
            const view = parseView(await loadForUi({client}));
            if (view.client !== client) throw new Error('INVALID_RESPONSE');
            acceptView(this.state,view,discard);
        } catch (error) { recordFailure(this.state,client,error); }
        this.changed();
    }
    changed() {
        this.state = {...this.state};
        this.dispatchEvent(new CustomEvent('connectionchange',{detail:connectionSummary(this.state),bubbles:true,composed:true}));
    }
    @api openStage(stageKey) {
        if (!STEPS.includes(stageKey)) return;
        if (['claude','chatgpt'].includes(stageKey) && this.client !== stageKey) this.switchClient({detail:{value:stageKey}});
        this.selectedStage = stageKey;
        this.expanded = true;
        this.focusStage = true;
    }
    renderedCallback() {
        if (!this.focusStage || !this.canRenderGuide) return;
        const heading = this.template.querySelector('[data-stage-heading]');
        if (heading) { heading.focus(); this.focusStage = false; }
    }
    get stageKey() { return this.selectedStage || nextSetupStage(this.entry); }
    get stageNavigation() { return setupStages(this.entry).map(stage => ({...stage,label:`${stage.title} — ${stage.status}`,variant:stage.key === this.stageKey ? 'brand' : 'neutral',current:stage.key === this.stageKey ? 'step' : null})); }
    get activeStage() { return setupStages(this.entry).find(stage => stage.key === this.stageKey); }
    get isInstallationStage() { return this.stageKey === 'installation'; }
    get isSiteStage() { return this.stageKey === 'site'; }
    get isClientStage() { return ['claude','chatgpt'].includes(this.stageKey); }
    get isVerifyStage() { return this.stageKey === 'verify'; }
    get isNextGateStage() { return this.stageKey === 'nextGate'; }
    get isLastStage() { return this.isNextGateStage; }
    get currentRecovery() {
        const stage = setupStages(this.entry).find(item => ['blocked','stale'].includes(item.status));
        return stage ? {title:stage.title,...stage.recovery} : null;
    }
    selectStage(event) { this.openStage(event.currentTarget.dataset.stage); }
    nextStage() {
        const index = STEPS.indexOf(this.stageKey);
        if (index < STEPS.length - 1) this.openStage(STEPS[index + 1]);
    }
    get entry() { return this.state.clients[this.client]; }
    get draft() { return this.entry.draft || {}; }
    get view() { return this.entry.view || {}; }
    get statuses() {
        return connectionSummary(this.state).clients.map(entry => ({...entry,label:entry.client === 'claude' ? 'Claude' : 'ChatGPT'}));
    }
    get denied() { return !this.entry.authorized; }
    get disabled() { return this.busy || this.denied || !this.entry.draft; }
    get canRenderGuide() { return this.expanded && !this.denied && !!this.entry.draft; }
    get toggleLabel() { return this.expanded ? 'Collapse connection guide' : 'Expand connection guide'; }
    get callbacksText() { return (this.draft.callbacks || []).join('\n'); }
    get isDirect() { return this.view.transportKind === 'direct-org-api/v1'; }
    get isSiteTransport() { return !this.isDirect; }
    get isChatgpt() { return this.client === 'chatgpt'; }
    get errorMessage() {
        const code = this.entry.error;
        if (!code) return '';
        if (code === 'STALE_SETUP') return 'Saved configuration changed. Your draft is preserved. Compare revisions, then explicitly discard and reload before editing again.';
        if (code === 'NOT_AUTHORIZED') return 'Connection setup requires Cardstack Admin. Ask your administrator to inspect your assigned access.';
        if (code === 'INVALID_SETUP') return 'Check the public client ID, exact HTTPS callbacks and selected transport enrollment. Enable only after required values are present.';
        return 'The request could not be verified. Your draft is preserved. Check the saved configuration before retrying; a lost response does not prove the save failed.';
    }
    get versions() { return Object.entries(this.view.versions || {}).map(([name,value]) => ({name,value})); }
    get evidence() {
        return (this.view.checks || []).map((check,index) => ({...check,key:`${check.stage}-${index}`,time:check.checkedAt || 'No evidence time',recovery:recovery(check.stage,check.errorCode,this.view.transportKind),showRecovery:check.status !== 'Pass'}));
    }
    get steps() {
        const labels = ['Check installation','Prepare the Site','Configure Claude','Configure ChatGPT','Connect and verify','Ready for next gate'];
        return STEPS.map((key,index) => ({key,label:`${index+1}. ${labels[index]} — instructions reviewed`,done:this.draft.stepStates?.[key] === true}));
    }
    get recoveryRows() {
        return [
            ['redirect','Redirect mismatch','oauthPolicy','REDIRECT_MISMATCH'],
            ['guest','Guest 401 after consent','oauthPolicy','GUEST_401'],
            ['named','Named 403','permissions','NAMED_403'],
            ['metadata','Metadata or issuer mismatch','site','METADATA_MISMATCH'],
            ['expired','Expired or revoked authorization','oauthPolicy','TOKEN_EXPIRED'],
            ['ui','Tools work but UI fails','htmlLoading','UI_LOAD_FAILED'],
            ['stale','Contract or setup changed','configuration','STALE_SETUP'],
            ['unknownSave','Save outcome unknown','configuration','SAVE_OUTCOME_UNKNOWN']
        ].map(([key,symptom,stage,code]) => ({key,symptom,...recovery(stage,code,this.view.transportKind)}));
    }
    get observationText() { return this.observation ? `Operator observation saved for ${this.observation.client}, revision ${this.observation.configurationRevision}, backend checked ${this.observation.checkedAt}. This is operator observation, not host attestation.` : ''; }
    toggleGuide() { this.expanded = !this.expanded; }
    switchClient(event) { if (['claude','chatgpt'].includes(this.selectedStage)) this.selectedStage = event.detail.value; this.client = event.detail.value; this.receiptReference = ''; this.observation = null; this.supportSummary = ''; }
    changeField(event) {
        const field = event.target.dataset.field;
        const value = field === 'enabledIntent' ? event.target.checked : field === 'callbacks' ? event.target.value.split(/\r?\n/) : event.target.value;
        editDraft(this.state,this.client,field,value); this.changed();
    }
    changeStep(event) {
        editDraft(this.state,this.client,'stepStates',{...this.draft.stepStates,[event.target.dataset.step]:event.target.checked}); this.changed();
    }
    async save() {
        if (this.disabled) return;
        const valid = [...this.template.querySelectorAll('lightning-input, lightning-textarea')].every(input => input.reportValidity());
        if (!valid) return;
        const client = this.client; this.busy = true;
        try {
            const result = parseView(await saveForUi({inputJson:JSON.stringify(savePayload(this.state,client))}));
            if (result.client !== client) throw new Error('INVALID_RESPONSE');
            acceptView(this.state,result,true);
            await this.read(client,false);
        } catch (error) { recordFailure(this.state,client,error); }
        this.busy = false; this.changed();
    }
    async check() {
        if (this.disabled) return;
        const client=this.client; this.busy=true;
        try { const result=parseView(await checkForUi({client})); if(result.client !== client) throw new Error('INVALID_RESPONSE'); acceptView(this.state,result); }
        catch(error) { recordFailure(this.state,client,error); }
        this.busy=false; this.changed();
    }
    async reload() {
        if (this.busy || this.denied) return;
        const client=this.client; this.busy=true; await this.read(client,true); this.busy=false;
    }
    changeReceipt(event) { this.receiptReference=event.target.value; }
    async observe() {
        if (this.disabled || !/^check_[a-f0-9]{64}$/.test(this.receiptReference)) return;
        const client=this.client, receiptReference=this.receiptReference; this.busy=true;
        try {
            const result=parseReceipt(await observeForUi({receiptReference}));
            if (result.client !== client) throw new Error('INVALID_RESPONSE');
            if (this.client === client) { this.observation=result; this.receiptReference=''; }
            await this.read(client,false);
        } catch(error) { recordFailure(this.state,client,error); }
        this.busy=false; this.changed();
    }
    async exportSafeSummary() {
        if (this.disabled) return;
        const client=this.client; this.busy=true;
        try {
            const result=JSON.stringify(parseSupportSummary(await exportSummary({client})),null,2);
            if (this.client === client) this.supportSummary=result;
        } catch(error) { recordFailure(this.state,client,error); }
        this.busy=false; this.changed();
    }
    navigateToObjects() { this.dispatchEvent(new CustomEvent('navigatetab',{detail:{tab:'objects'},bubbles:true,composed:true})); }
}
