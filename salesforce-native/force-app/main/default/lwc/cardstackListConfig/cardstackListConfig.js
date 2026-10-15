import { LightningElement, api } from 'lwc';
import getStudioListCatalog from '@salesforce/apex/CardstackStudioController.getStudioListCatalog';
import getStagingInfoFresh from '@salesforce/apex/CardstackStudioController.getStagingInfoFresh';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';
import DraftDialog from 'c/cardstackDraftDialog';
import { parseExposure, migrateExposure, setExposure, serializeExposure, exposureFingerprint, exposureRows } from 'c/cardstackListConfigModel';

export default class CardstackListConfig extends LightningElement {
    _objectApi;
    _generation = 0;
    _refreshRequest = 0;
    _editRevision = 0;
    _connected = false;
    _pendingSave;
    _reconciliation;
    _baseline;
    model;
    catalog = [];
    savedJson;
    liveJson;
    draftId;
    retainedJson;
    search = '';
    loading = false;
    saving = false;
    checkingSavedState = false;
    saveUnknown = false;
    error = '';
    catalogError = '';
    @api
    get objectApi() { return this._objectApi; }
    set objectApi(value) {
        if (value === this._objectApi) return;
        this._objectApi = value;
        ++this._generation;
        this.model = undefined;
        this.catalog = [];
        this.savedJson = undefined;
        this.liveJson = undefined;
        this.draftId = undefined;
        this.retainedJson = undefined;
        this._baseline = undefined;
        this._pendingSave = undefined;
        this._reconciliation = undefined;
        this.loading = false;
        this.saving = false;
        this.checkingSavedState = false;
        this.saveUnknown = false;
        this.error = '';
        this.catalogError = '';
        this.search = '';
        if (this._connected && value) this.refresh();
    }
    connectedCallback() { this._connected = true; if (this.objectApi) this.refresh(); }
    disconnectedCallback() { this._connected = false; ++this._generation; }
    @api
    async refresh() {
        if (!this.objectApi) return;
        if (this._pendingSave) { await this.checkSavedState(); return; }
        const generation = this._generation, request = ++this._refreshRequest, revision = this._editRevision;
        const objectApi = this.objectApi;
        const dirtyBefore = this.isDirty;
        this.loading = true;
        try {
            const [catalogResult,stateResult] = await Promise.allSettled([
                getStudioListCatalog({objectApi}),getStagingInfoFresh({key:`exposures:${objectApi}`})
            ]);
            if (generation !== this._generation || request !== this._refreshRequest) return;
            this.catalogError = catalogResult.status === 'fulfilled' && Array.isArray(catalogResult.value) ? '' : 'List metadata unavailable. Refresh before editing.';
            if (catalogResult.status === 'fulfilled' && Array.isArray(catalogResult.value)) this.catalog = catalogResult.value;
            if (stateResult.status !== 'fulfilled') throw stateResult.reason;
            const state = stateResult.value;
            const raw = state.draft?.Draft_Value__c ?? state.liveValue ?? null;
            const parsed = parseExposure(raw,this.catalog,objectApi);
            this.savedJson = parsed.mode === 'unavailable' ? raw : serializeExposure(parsed);
            this.liveJson = state.liveValue ?? null;
            this.draftId = state.draft?.Id;
            this._baseline = exposureFingerprint(parsed);
            this.retainedJson = raw ?? 'No configured policy.';
            if (revision === this._editRevision && !dirtyBefore) this.model = parsed;
            else if (!this.model) this.model = parsed;
            else this.model = {...this.model,catalog:this.catalog};
            this.error = '';
        } catch (error) {
            if (generation === this._generation && request === this._refreshRequest) this.error = 'Saved list state unavailable. ' + this.message(error);
        } finally {
            if (generation === this._generation && request === this._refreshRequest) this.loading = false;
        }
    }
    get canEdit() { return this.model?.mode === 'v1' && !this.catalogError; }
    get controlsDisabled() { return !this.canEdit; }
    get isDirty() { return !!this.model && exposureFingerprint(this.model) !== this._baseline; }
    get saveDisabled() { return !this.canEdit || this.loading || this.saving || this.checkingSavedState || this.saveUnknown || !this.isDirty; }
    get hasPolicyChoices() { return this.model?.mode === 'v1'; }
    get migrationDisabled() { return this.loading || !!this.catalogError; }
    get isLegacy() { return this.model?.mode === 'legacy'; }
    get allowAdHoc() { return this.model?.working?.allowAdHoc === true; }
    get rows() {
        const query = this.search.toLowerCase().trim();
        return this.model ? exposureRows(this.model).filter(row => row.enabled || !query || `${row.choiceLabel} ${row.description}`.toLowerCase().includes(query)) : [];
    }
    get modeMessage() {
        if (this.isLegacy) return 'Legacy exposure settings are not enforced. Start explicit configuration, choose lists, then save and Review & Publish. Migration starts with no named lists and unnamed requests disabled.';
        if (this.model?.mode === 'unavailable') return this.model.issues.join(' ');
        return 'Version 1: only enabled named lists are allowed after publishing. Empty selections deny all named lists. A draft has no runtime effect.';
    }
    get workingStatus() { return this.saveUnknown ? 'Save outcome unknown' : this.saving ? 'Saving…' : this.isDirty ? 'Unsaved changes' : this.draftId ? 'Draft saved' : this.liveJson ? 'Published' : 'Not configured'; }
    get savedStatus() { return this.draftId ? 'Saved draft · Review & Publish to update chat' : 'No saved draft'; }
    get liveStatus() {
        const live = parseExposure(this.liveJson,this.catalog,this.objectApi);
        return live.mode === 'legacy' ? 'Published runtime uses legacy behavior until explicit policy is published.' : live.mode === 'v1' ? 'Published version 1 policy is live.' : 'Published policy is unavailable; runtime fails closed.';
    }
    get reviewDisabled() { return !this.draftId || this.saving || this.saveUnknown || this.checkingSavedState; }
    startMigration() {
        if (!this.isLegacy || this.loading || this.catalogError) return;
        try { this.model = migrateExposure(this.model); ++this._editRevision; this.error = ''; }
        catch (error) { this.error = this.message(error); }
    }
    handleSearch(event) { this.search = event.target.value; }
    handleSelection(event) {
        if (!this.canEdit) return;
        try { this.model = setExposure(this.model,event.currentTarget.dataset.kind,event.currentTarget.dataset.key,event.target.checked); ++this._editRevision; }
        catch (error) { this.error = this.message(error); }
    }
    handleAdHoc(event) {
        if (!this.canEdit) return;
        this.model = {...this.model,working:{...this.model.working,allowAdHoc:event.target.checked}};
        ++this._editRevision;
    }
    @api
    async save() {
        if (this.saveDisabled) return false;
        const value = serializeExposure(this.model);
        const pending = {value,fingerprint:exposureFingerprint(this.model),key:`exposures:${this.objectApi}`,objectApi:this.objectApi,generation:this._generation};
        this._pendingSave = pending;
        this.saving = true;
        this.error = '';
        let writeError;
        try { await saveDraft({key:pending.key,value}); }
        catch (error) { writeError = error; }
        try {
            const confirmed = await this.reconcileSave(pending);
            if (!confirmed && writeError && this.isCurrentSaveGeneration(pending) && !this.saveUnknown) this.error = this.message(writeError) + ' Working selections retained.';
            return confirmed;
        } finally { if (this.isCurrentSaveGeneration(pending)) this.saving = false; }
    }
    isCurrentSaveGeneration(pending) { return pending.generation === this._generation && pending.objectApi === this.objectApi; }
    reconcileSave(pending = this._pendingSave) {
        if (!pending || pending !== this._pendingSave) return Promise.resolve(false);
        if (this._reconciliation?.pending === pending) return this._reconciliation.promise;
        const entry = {pending};
        this._reconciliation = entry;
        this.checkingSavedState = true;
        entry.promise = this.readSavedState(pending).finally(() => {
            if (this._reconciliation === entry) { this._reconciliation = undefined; this.checkingSavedState = false; }
        });
        return entry.promise;
    }
    async readSavedState(pending) {
        try {
            const state = await getStagingInfoFresh({key:pending.key});
            if (!this.isCurrentSaveGeneration(pending) || pending !== this._pendingSave) return false;
            const parsed = parseExposure(state.draft?.Draft_Value__c ?? state.liveValue ?? null,this.catalog,this.objectApi);
            this.savedJson = parsed.mode === 'unavailable' ? state.draft?.Draft_Value__c ?? state.liveValue : serializeExposure(parsed);
            this.liveJson = state.liveValue ?? null;
            this.draftId = state.draft?.Id;
            this.retainedJson = this.savedJson;
            this._baseline = exposureFingerprint(parsed);
            this.saveUnknown = false;
            this._pendingSave = undefined;
            const confirmed = !!state.draft && parsed.mode === 'v1' && this._baseline === pending.fingerprint;
            this.error = confirmed ? '' : 'Saved draft does not match this submission. Working selections retained; review the current saved draft before retrying.';
            if (confirmed) this.dispatchEvent(new CustomEvent('configchange',{detail:{keys:[pending.key],operation:'save'},bubbles:true,composed:true}));
            return confirmed;
        } catch (error) {
            if (!this.isCurrentSaveGeneration(pending) || pending !== this._pendingSave) return false;
            this.saveUnknown = true;
            this.error = 'Save outcome unknown. Working selections retained. Check saved state before retrying or leaving. ' + this.message(error);
            return false;
        }
    }
    checkSavedState() { return this.saving ? Promise.resolve(false) : this.reconcileSave(); }
    /** Synchronous final guard for a parent that awaited its own draft work. */
    @api
    get leaveReady() { return !this.loading && !this.saving && !this.saveUnknown && !this.checkingSavedState && !this.isDirty; }
    @api
    async requestLeave() {
        if (this.loading || this.saving || this.saveUnknown || this.checkingSavedState) return false;
        if (!this.isDirty) return true;
        const generation = this._generation, revision = this._editRevision;
        const choice = await DraftDialog.open({size:'small',label:'Unsaved list changes',description:'Save a draft, discard working changes, or stay in this editor.'});
        if (generation !== this._generation || this.loading || this.saving || this.saveUnknown || this.checkingSavedState) return false;
        if (choice === 'discard') {
            if (revision !== this._editRevision) return false;
            this.model = parseExposure(this.savedJson || null,this.catalog,this.objectApi);
            ++this._editRevision;
            return true;
        }
        if (choice !== 'save') return false;
        return await this.save() && this.leaveReady;
    }
    openPublish() {
        if (this.reviewDisabled) return;
        this.dispatchEvent(new CustomEvent('navigatetab',{detail:{tab:'publish',draftId:this.draftId},bubbles:true,composed:true}));
    }
    message(error) { return error?.body?.message || error?.message || String(error); }
}
