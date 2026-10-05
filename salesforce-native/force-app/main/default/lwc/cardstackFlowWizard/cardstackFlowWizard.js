import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getActiveFlows from '@salesforce/apex/CardstackStudioController.getActiveFlows';
import getFlowInputs from '@salesforce/apex/CardstackStudioController.getFlowInputs';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';

const KEY = 'flows';

/**
 * cardstackFlowWizard — 3-step guided flow setup for admins.
 * Step 1: pick an active Salesforce flow.
 * Step 2: configure label, render mode, and input mappings.
 * Step 3: preview the chat card and stage the draft.
 *
 * Emits `wizarddone` when the admin finishes or cancels, so the parent
 * can return to the flows list.
 */
export default class CardstackFlowWizard extends LightningElement {
    @track step = 1;
    @track flowSearch = '';
    @track selectedFlow = null;       // { apiName, label, description, processType }
    @track flowLabel = '';
    @track renderMode = 'form';
    @track inputMappings = [];        // [{ apiName, dataType, required, label, defaultValue, collectFromChat }]
    @track inputsLoading = false;
    @track staging = null;
    @track saving = false;

    wiredFlowsResult;

    @wire(getActiveFlows)
    wiredFlows(result) {
        this.wiredFlowsResult = result;
    }

    connectedCallback() {
        this.loadExisting();
    }

    async loadExisting() {
        try {
            this.staging = await getStagingInfo({ key: KEY });
        } catch {
            // Non-fatal; wizard works without existing config.
        }
    }

    // ---------- Step 1: pick flow ----------

    get flowsLoading() {
        return !this.wiredFlowsResult || (this.wiredFlowsResult.error === undefined && !this.wiredFlowsResult.data);
    }

    get allFlows() {
        return this.wiredFlowsResult?.data || [];
    }

    get filteredFlows() {
        const q = (this.flowSearch || '').toLowerCase().trim();
        const flows = this.allFlows;
        const selectedApi = this.selectedFlow?.apiName;
        const mapped = flows.map(f => ({
            ...f,
            selected: f.apiName === selectedApi,
            rowClass: f.apiName === selectedApi ? 'flow-item flow-selected' : 'flow-item'
        }));
        if (!q) return mapped.slice(0, 100);
        return mapped.filter(f =>
            (f.label || '').toLowerCase().includes(q) ||
            (f.apiName || '').toLowerCase().includes(q)
        ).slice(0, 100);
    }

    get hasFlows() {
        return this.allFlows.length > 0;
    }

    handleFlowSearch(e) {
        this.flowSearch = e.target.value;
    }

    handlePickFlow(e) {
        const apiName = e.currentTarget.dataset.apiname;
        const flow = this.allFlows.find(f => f.apiName === apiName);
        if (!flow) return;
        this.selectedFlow = { ...flow };
        this.flowLabel = flow.label || flow.apiName;
    }

    get canGoToStep2() {
        return !!this.selectedFlow;
    }

    get cannotGoToStep2() {
        return !this.canGoToStep2;
    }

    // ---------- Step 2: configure ----------

    get renderModeOptions() {
        return [
            { label: 'Form first — ask for inputs in chat, then run', value: 'form' },
            { label: 'Auto-run — run immediately when mentioned', value: 'auto' },
            { label: 'Confirmation — ask before running', value: 'confirm' }
        ];
    }

    async goToStep2() {
        if (!this.selectedFlow) return;
        this.step = 2;
        this.inputsLoading = true;
        try {
            const vars = await getFlowInputs({ flowApiName: this.selectedFlow.apiName });
            this.inputMappings = (vars || []).map(v => ({
                apiName: v.apiName,
                dataType: v.dataType,
                description: v.description,
                required: !!v.required,
                label: this.humanize(v.apiName),
                defaultValue: '',
                collectFromChat: true
            }));
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
            this.inputMappings = [];
        } finally {
            this.inputsLoading = false;
        }
    }

    humanize(apiName) {
        return (apiName || '')
            .replace(/__c$/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    handleLabelInput(e) {
        this.flowLabel = e.target.value;
    }

    handleRenderModeChange(e) {
        this.renderMode = e.detail.value;
    }

    handleInputLabel(e) {
        const api = e.currentTarget.dataset.api;
        this.inputMappings = this.inputMappings.map(m =>
            m.apiName === api ? { ...m, label: e.target.value } : m
        );
    }

    handleInputDefault(e) {
        const api = e.currentTarget.dataset.api;
        this.inputMappings = this.inputMappings.map(m =>
            m.apiName === api ? { ...m, defaultValue: e.target.value } : m
        );
    }

    handleInputCollectToggle(e) {
        const api = e.currentTarget.dataset.api;
        this.inputMappings = this.inputMappings.map(m =>
            m.apiName === api ? { ...m, collectFromChat: e.target.checked } : m
        );
    }

    get hasInputs() {
        return this.inputMappings.length > 0;
    }

    get canGoToStep3() {
        return !!(this.flowLabel || '').trim();
    }

    get cannotGoToStep3() {
        return !this.canGoToStep3;
    }

    // ---------- Step 3: preview & save ----------

    get previewInputs() {
        return this.inputMappings.filter(m => m.collectFromChat);
    }

    get renderModeLabel() {
        const opt = this.renderModeOptions.find(o => o.value === this.renderMode);
        return opt ? opt.label : this.renderMode;
    }

    buildPolicy() {
        return {
            apiName: this.selectedFlow.apiName,
            label: (this.flowLabel || '').trim() || this.selectedFlow.label,
            renderMode: this.renderMode,
            inputs: this.inputMappings.map(m => ({
                apiName: m.apiName,
                label: m.label,
                dataType: m.dataType,
                required: m.required,
                collectFromChat: m.collectFromChat,
                defaultValue: m.defaultValue
            }))
        };
    }

    async stagePolicy() {
        if (!this.canGoToStep3) {
            this.toast('Missing label', 'Give the flow a chat label.', 'error');
            return;
        }
        this.saving = true;
        try {
            const raw = this.staging?.draft?.Draft_Value__c ?? this.staging?.liveValue;
            let policies = [];
            try {
                const parsed = JSON.parse(raw || '[]');
                policies = Array.isArray(parsed) ? parsed : [];
            } catch { /* start fresh */ }
            const policy = this.buildPolicy();
            const idx = policies.findIndex(p =>
                (p.apiName || p.flowApiName) === policy.apiName
            );
            if (idx >= 0) {
                policies[idx] = policy;
            } else {
                policies.push(policy);
            }
            await saveDraft({ key: KEY, value: JSON.stringify(policies, null, 2) });
            this.toast('Draft staged', `"${policy.label}" staged. Publish it in the Publish Center.`, 'success');
            this.done();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        } finally {
            this.saving = false;
        }
    }

    // ---------- Navigation ----------

    get isStep1() { return this.step === 1; }
    get isStep2() { return this.step === 2; }
    get isStep3() { return this.step === 3; }

    get step1Class() { return this.step === 1 ? 'slds-is-active' : this.step > 1 ? 'slds-is-complete' : ''; }
    get step2Class() { return this.step === 2 ? 'slds-is-active' : this.step > 2 ? 'slds-is-complete' : ''; }
    get step3Class() { return this.step === 3 ? 'slds-is-active' : ''; }

    goBack() {
        if (this.step > 1) this.step -= 1;
    }

    goToStep3() {
        if (this.canGoToStep3) this.step = 3;
    }

    cancel() {
        this.done();
    }

    done() {
        this.dispatchEvent(new CustomEvent('wizarddone', { bubbles: true, composed: true }));
    }

    msg(e) { return e?.body?.message || e?.message || 'Unknown error'; }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
