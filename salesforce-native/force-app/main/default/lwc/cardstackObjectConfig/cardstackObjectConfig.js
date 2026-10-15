import recordAuthoring from 'c/cardstackRecordAuthoring';
import getRecordEditCapability from '@salesforce/apex/CardstackStudioController.getRecordEditCapability';
import getPublishedFlowPlans from '@salesforce/apex/CardstackStudioController.getPublishedFlowPlans';
import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCrmObjects from '@salesforce/apex/CardstackStudioController.getCrmObjects';
import getConfigValue from '@salesforce/apex/CardstackStudioController.getConfigValue';
import getStagingInfoFresh from '@salesforce/apex/CardstackStudioController.getStagingInfoFresh';
import getObjectFields from '@salesforce/apex/CardstackStudioController.getObjectFields';
import getStudioFieldCatalog from '@salesforce/apex/CardstackStudioController.getStudioFieldCatalog';
import DraftDialog from 'c/cardstackDraftDialog';
import { draftState, readiness } from 'c/cardstackStudioModel';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';

/**
 * cardstackObjectConfig — per-object Studio section.
 *
 * Object picker with the default layout, then four sub-tabs:
 * - Layouts: VISUAL builder with Salesforce-style SECTIONS + Highlights Panel
 *   (section cards with 2-column field grids, inline label editing,
 *   move-fields-between-sections, live preview, validation, diff, JSON export)
 *   + staging.
 * - Lists: declarative exposure editor with its own draft/leave boundary.
 * - Actions: visual toggles with icons/descriptions.
 * - Permissions: write policy editor (unchanged behavior, wired to builder model).
 *
 * Layout model (new shape):
 *   { highlights: [{api,label,type}], sections: [{label, fields:[{api,label,type,editable,column}]}] }
 * Old flat `{fields:[...]}` configs and legacy `recordCard.sections` configs are
 * migrated on load into the new shape.
 */
export default class CardstackObjectConfig extends LightningElement {
    @track selectedObject = '';
    @track staging = {};
    @track draftValues = { lists: '' };

    // ----- Visual builder state (sections model) -----
    @track workingHighlights = [];   // [{ key, api, label, type, valid, rowClass }]
    @track workingSections = [];     // [{ key, label, fields: [{key,api,label,type,editable,valid,column,...}] }]
    @track targetSectionKey = '';    // picker "+" adds here
    @track workingActions = [];      // [{ name, label, type, description, iconName, enabled }]
    @track workingPermissions = { writeEnabled: false, fieldDenylist: [] };
    @track hasDraft = false;
    @track fieldSearch = '';
    @track previewHasConfig = true;
    @track showPreview = false;
    @track showJson = false;
    @track showDiff = false;
    @track showAdvanced = false;
    @track loading = false;
    @track objectSearch = '';
    @track objectDropdownOpen = false;
    @track activeSubview = 'layouts';
    @track saving = false;
    @track saveUnknown = false;
    @track saveError = '';
    @track restrictionSearch = '';
    savedLayoutJson;
    savedListsJson;
    _loadGeneration = 0;
    _openGeneration = 0;
    _refreshRequest = 0;
    _refreshing = false;
    _refreshKeys = new Set();
    _pendingSave;
    @track checkingSavedState = false;
    _reconciliation;
    dragApi = null;
    dragKey = null;
    dragSectionKey = null;

    // Preview model (raw; sample values attached in getters)
    _previewHighlights = [];
    _previewSections = [];

    // ----- New-action form -----
    @track newAction = { name: '', label: '', type: '', description: '', enabled: true, mappings: [] };
    @track _actionEdit = null;
    @track publishedFlows = [];
    @track interpretedFlows = [];
    @track interpretedFlowCatalogError = '';
    @track interpretedFlowHasMore = false;
    _flowCatalogGeneration = 0;
    @wire(getConfigValue, { key: 'flows' })
    wiredPublishedFlows({ data }) {
        try { const parsed = data ? JSON.parse(data) : []; this.publishedFlows = Array.isArray(parsed) ? parsed : []; } catch { this.publishedFlows = []; }
    }

    wiredObjectsResult;
    wiredFieldsResult;

    @wire(getCrmObjects)
    wiredObjects(result) {
        this.wiredObjectsResult = result;
    }

    wiredFields(result) {
        this.wiredFieldsResult = result;
        if (result.data) {
            const validate = (f, highlight) => {
                const valid = !!this.fieldMap[(f.api || '').toUpperCase()];
                return { ...f, valid, rowClass: highlight
                    ? (valid ? 'hl-chip' : 'hl-chip hl-invalid')
                    : (valid ? 'layout-row' : 'layout-row row-invalid') };
            };
            this.workingHighlights = this.workingHighlights.map(f => validate(f, true));
            this.workingSections = this.workingSections.map(s => ({ ...s, fields: s.fields.map(f => validate(f, false)) }));
            this.syncPreview();
        }
    }

    // ---------- Searchable object picker ----------

    get filteredObjects() {
        const q = (this.objectSearch || '').toLowerCase().trim();
        const opts = this.objectOptions;
        if (!q) return opts.slice(0, 50);
        return opts.filter(o =>
            o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
        ).slice(0, 50);
    }

    get objectPickerLabel() {
        return this.selectedObject ? this.selectedObjectLabel : 'Select an object…';
    }

    get objectsLoading() {
        return !this.wiredObjectsResult || (this.wiredObjectsResult.error === undefined && !this.wiredObjectsResult.data);
    }

    get objectsLoadError() {
        return !!this.wiredObjectsResult?.error;
    }

    handleObjectSearch(e) {
        this.objectSearch = e.target.value;
        this.objectDropdownOpen = true;
    }

    handleObjectFocus() {
        this.objectDropdownOpen = true;
    }

    handleObjectBlur(event) {
        if (event.relatedTarget?.closest('.obj-picker')) return;
        this.objectDropdownOpen = false;
    }

    handleObjectSelect(e) { return this.openObject(e.currentTarget.dataset.value); }

    @api
    async openObject(objectApi) {
        if (!objectApi) return;
        if (objectApi === this.selectedObject) { await this.refreshPending(); return; }
        const generation = ++this._openGeneration;
        if (!await this.requestLeave() || generation !== this._openGeneration) return;
        this.resetWorkingState();
        this.selectedObject = objectApi;
        this.objectSearch = '';
        this.objectDropdownOpen = false;
        this.fieldSearch = '';
        await Promise.all([this.loadStaging(), this.loadFieldCatalog(objectApi), this.loadRecordEditCapability(objectApi), this.loadInterpretedFlows(objectApi)]);
    }

    /** Publication/discard reconciles baselines without replacing unfinished inputs. */
    @api
    refreshPending() { return this.refresh([...this._refreshKeys]); }

    @api
    async refresh(keys = []) {
        if (!this.selectedObject) return false;
        if (keys.some(key => key.startsWith('flow-plan:'))) await this.loadInterpretedFlows(this.selectedObject);
        const relevant = keys.filter(key => key === this.layoutKey || key === this.listsKey || key === 'flows');
        if (!relevant.length) return false;
        relevant.forEach(key => this._refreshKeys.add(key));
        if (!this._refreshKeys.size || this.saving || this.checkingSavedState || this.saveUnknown || this._pendingSave || this.loading && !this._refreshing) return false;
        const affected = [...this._refreshKeys];
        const objectApi = this.selectedObject, generation = this._loadGeneration, request = ++this._refreshRequest;
        const inputs = this.leaveInputSnapshot(), dirty = this.hasUnsavedWork;
        const listsBefore = this.draftValues.lists, listsDirty = this.listsDirty;
        const child = this.listEditor;
        this._refreshing = true;
        this.loading = true;
        try {
            const results = await Promise.all(affected.map(key => key === this.listsKey && child
                ? child.refresh().then(() => undefined) : getStagingInfoFresh({key})));
            if (generation !== this._loadGeneration || objectApi !== this.selectedObject || request !== this._refreshRequest) return false;
            const preserveInputs = dirty || inputs !== this.leaveInputSnapshot();
            affected.forEach((key, index) => {
                const state = results[index];
                if (key === this.layoutKey) {
                    const raw = state.draft?.Draft_Value__c ?? state.liveValue;
                    this.staging = {...this.staging, layout:state};
                    this.savedLayoutJson = this.normalizedLayout(raw);
                    this.liveLayout = this.parseLayoutOnly(state.liveValue);
                    this.hasDraft = !!state.draft;
                    if (!preserveInputs) { this.parseWorkingModel(raw); this.syncPreview(); }
                } else if (key === this.listsKey && !child) {
                    this.staging = {...this.staging, lists:state};
                    this.savedListsJson = this.pretty(state.draft?.Draft_Value__c ?? state.liveValue ?? this.sampleLists());
                    if (!listsDirty && listsBefore === this.draftValues.lists) this.draftValues = {lists:this.savedListsJson};
                } else if (key === 'flows') this.wiredPublishedFlows({data:state.liveValue});
            });
            affected.forEach(key => this._refreshKeys.delete(key));
            this.saveError = '';
            return true;
        } catch (error) {
            if (generation === this._loadGeneration && objectApi === this.selectedObject && request === this._refreshRequest) this.saveError = 'Saved card state could not refresh. Working inputs retained. ' + this.msg(error);
            return false;
        } finally {
            if (generation === this._loadGeneration && objectApi === this.selectedObject && request === this._refreshRequest) { this.loading = false; this._refreshing = false; }
        }
    }

    recordEditCapability = null;
    recordEditUnavailableReason = 'Native edit metadata has not loaded.';
    _capabilityRequest = 0;
    async loadRecordEditCapability(objectApi) {
        const generation = this._loadGeneration, request = ++this._capabilityRequest;
        this.recordEditCapability = null;
        this.recordEditUnavailableReason = 'Loading native edit metadata…';
        try {
            const result = await getRecordEditCapability({objectApi});
            if (objectApi !== this.selectedObject || generation !== this._loadGeneration || request !== this._capabilityRequest) return;
            this.recordEditCapability = recordAuthoring.descriptor(result, objectApi);
            this.recordEditUnavailableReason = result.eligible ? '' : `Native edit unavailable: ${result.exclusionReason}`;
        } catch (error) {
            if (objectApi === this.selectedObject && generation === this._loadGeneration && request === this._capabilityRequest) { this.recordEditCapability = null; this.recordEditUnavailableReason = 'Native edit metadata unavailable. ' + this.msg(error); }
        }
    }
    get recordEditFieldNotices() { return (this.recordEditCapability?.fields || []).filter(field => !field.eligible).map(field => `${field.label} (${field.fieldApi}): ${field.exclusionReason}`); }
    get recordEditNoticeRows() { return this.recordEditFieldNotices.map((message,index) => ({key:`native-exclusion-${index}`,message})); }

    async loadFieldCatalog(objectApi) {
        const generation = this._loadGeneration;
        try {
            const [catalog, constraints] = await Promise.all([getStudioFieldCatalog({objectApi}),getObjectFields({objectApi})]);
            if (this.selectedObject !== objectApi || generation !== this._loadGeneration) return;
            if (!Array.isArray(catalog)) throw new Error('Field metadata is unavailable.');
            this.wiredFields({data:catalog.map(field => ({...constraints.find(info => info.api === field.api),...field}))});
        } catch (error) {
            if (this.selectedObject === objectApi && generation === this._loadGeneration) this.wiredFields({error});
        }
    }

    handleObjectKeydown(e) {
        if (e.key === 'Escape') {
            this.objectDropdownOpen = false;
        } else if (e.key === 'Enter') {
            const first = this.filteredObjects[0];
            if (first && this.objectDropdownOpen) {
                e.preventDefault();
                this.handleObjectSelect({ currentTarget: { dataset: { value: first.value } } });
            }
        }
    }

    async handleClearObject() {
        const generation = ++this._openGeneration;
        if (!await this.requestLeave() || generation !== this._openGeneration) return;
        this.resetWorkingState();
        this.selectedObject = '';
        this.objectSearch = '';
    }

    resetWorkingState() {
        ++this._loadGeneration;
        ++this._refreshRequest;
        this._refreshKeys.clear();
        this._refreshing = false;
        this.loading = false;
        this.staging = {};
        this._actionTableOriginals.clear();
        this.actionDraftValues = [];
        this.savedLayoutJson = undefined;
        this.savedListsJson = undefined;
        this.workingHighlights = [];
        this.workingSections = [];
        this.workingActions = [];
        this.workingPermissions = { writeEnabled: false, fieldDenylist: [] };
        this.permissions = null;
        this.denylistText = '';
        this.draftValues = { lists: '' };
        this.preservedLayout = {};
        this.targetSectionKey = '';
        this.wiredFieldsResult = undefined;
        this.recordEditCapability = null; this.recordEditUnavailableReason = 'Native edit metadata has not loaded.'; ++this._capabilityRequest;
        this.cancelActionEdit();
        this._previewHighlights = [];
        this._previewSections = [];
        this.saveError = '';
        this.hasDraft = false;
    }

    get leaveBusy() { return this.saving || this.checkingSavedState || this.saveUnknown || this.loading; }
    get childLeaveReady() { const lists = this.listEditor; return !lists || lists.leaveReady === true; }
    get leaveReady() { return !this.leaveBusy && !this.hasUnsavedWork && this.childLeaveReady; }
    leaveInputSnapshot() {
        return JSON.stringify([this.selectedObject, this._loadGeneration, this.buildLayoutJson(),
            this.newAction, this.actionDraftValues, this.draftValues, this.denylistText, this.restrictionError]);
    }

    @api
    async requestLeave() {
        if (this.leaveBusy) return false;
        // Resolve the child's native choice once. Later parent awaits only check
        // current readiness; they never save or discard newer child inputs.
        const lists = this.listEditor;
        if (lists && (!lists.requestLeave || !await lists.requestLeave())) return false;
        if (this.leaveBusy || !this.childLeaveReady) return false;
        if (!this.hasUnsavedWork) return this.leaveReady;
        const inputs = this.leaveInputSnapshot();
        const choice = await DraftDialog.open({ size: 'small', label: 'Unsaved card changes', description: 'Save a draft, discard working changes, or stay in this editor.' });
        if (this.leaveBusy || !this.childLeaveReady || inputs !== this.leaveInputSnapshot()) return false;
        if (choice === 'discard') {
            this.restoreSavedInputs();
            return this.leaveReady;
        }
        if (choice !== 'save') return false;
        if (this.hasNewActionInputs) {
            await this.addAction();
            if (this.leaveBusy || !this.childLeaveReady) return false;
        }
        if (this.hasNewActionInputs) return false;
        if (this.isDirty && !await this.persistWorkingModel()) return false;
        if (this.leaveBusy || !this.childLeaveReady) return false;
        if (this.listsDirty && !await this.stageLists()) return false;
        return this.leaveReady;
    }

    restoreSavedInputs() {
        this.parseWorkingModel(this.savedLayoutJson ?? this.staging.layout?.draft?.Draft_Value__c ?? this.staging.layout?.liveValue);
        this.draftValues = { lists: this.savedListsJson ?? this.pretty(this.staging.lists?.draft?.Draft_Value__c ?? this.staging.lists?.liveValue ?? this.sampleLists()) };
        this.cancelActionEdit();
        this.syncPreview();
    }

    get hasNewActionInputs() { return !!(this.newAction.name || this.newAction.label || this.newAction.type || this.newAction.description || this.newAction.mappings?.length); }
    get listEditor() { return this.template?.querySelector('c-cardstack-list-config'); }
    get listsDirty() { return !this.listEditor && !!this.selectedObject && this.draftValues.lists !== (this.savedListsJson ?? this.pretty(this.staging.lists?.draft?.Draft_Value__c ?? this.staging.lists?.liveValue ?? this.sampleLists())); }
    get hasUnsavedWork() { return !!this.selectedObject && (this.isDirty || this.listsDirty || this.hasNewActionInputs || !!this.restrictionError); }

    // ---------- Pickers ----------

    get objectOptions() {
        const { data } = this.wiredObjectsResult || {};
        if (!data) return [];
        return data.map(o => ({ label: `${o.label} (${o.api})`, value: o.api }));
    }

    get selectedObjectLabel() {
        const opt = this.objectOptions.find(o => o.value === this.selectedObject);
        return opt ? opt.label : this.selectedObject;
    }

    /** Short friendly label (no API suffix), used for default section names. */
    objectShortLabel() {
        const data = this.wiredObjectsResult?.data || [];
        const found = data.find(o => o.api === this.selectedObject);
        return found?.label || this.selectedObject;
    }

    get layoutKey() {
        return `layout:${this.selectedObject}:default`;
    }

    get listsKey() {
        return `exposures:${this.selectedObject}`;
    }

    // ---------- Field schema ----------

    /** api (uppercased) -> { api, label, type } */
    get fieldMap() {
        const map = {};
        const data = this.wiredFieldsResult?.data || [];
        data.forEach(f => { map[(f.api || '').toUpperCase()] = f; });
        return map;
    }

    get fieldsLoading() {
        return !this.wiredFieldsResult || this.wiredFieldsResult.error === undefined && !this.wiredFieldsResult.data;
    }

    get fieldsLoadError() { return this.wiredFieldsResult?.error ? this.msg(this.wiredFieldsResult.error) : ''; }
    refreshFieldCatalog() { return this.loadFieldCatalog(this.selectedObject); }

    typeCategory(type) {
        const t = (type || '').toUpperCase();
        if (['STRING', 'TEXTAREA', 'EMAIL', 'PHONE', 'URL', 'ID', 'ENCRYPTEDSTRING'].includes(t)) return 'Text';
        if (['INTEGER', 'DOUBLE', 'CURRENCY', 'PERCENT', 'LONG'].includes(t)) return 'Number';
        if (['DATE', 'DATETIME', 'TIME'].includes(t)) return 'Date & Time';
        if (['PICKLIST', 'MULTIPICKLIST'].includes(t)) return 'Picklist';
        if (t === 'REFERENCE') return 'Lookup';
        if (t === 'BOOLEAN') return 'Checkbox';
        return 'Other';
    }

    /** All field apis currently used (highlights + every section), uppercased. */
    get usedApis() {
        const s = new Set();
        this.workingHighlights.forEach(h => s.add((h.api || '').toUpperCase()));
        this.allWorkingFields.forEach(f => s.add((f.api || '').toUpperCase()));
        return s;
    }

    /** Flattened section fields across all sections. */
    get allWorkingFields() {
        const out = [];
        (this.workingSections || []).forEach(sec =>
            (sec.fields || []).forEach(f => out.push({ ...f, sectionKey: sec.key, sectionLabel: sec.label }))
        );
        return out;
    }

    get totalFieldCount() {
        return this.allWorkingFields.length;
    }

    get groupedFields() {
        const data = this.wiredFieldsResult?.data || [];
        const q = (this.fieldSearch || '').toLowerCase();
        const added = this.usedApis;
        const groups = {};
        data.forEach(f => {
            if (q && !(f.label || '').toLowerCase().includes(q) && !(f.api || '').toLowerCase().includes(q)) return;
            const cat = this.typeCategory(f.type);
            (groups[cat] = groups[cat] || []).push({
                ...f,
                added: added.has((f.api || '').toUpperCase())
            });
        });
        const order = ['Text', 'Number', 'Date & Time', 'Picklist', 'Lookup', 'Checkbox', 'Other'];
        return order.filter(c => groups[c]?.length).map(c => ({ category: c, fields: groups[c] }));
    }

    // ---------- Staging / working model ----------

    async loadStaging() {
        if (!this.selectedObject) return;
        const generation = ++this._loadGeneration;
        const objectApi = this.selectedObject;
        const before = this.buildLayoutJson();
        const actionInputsBefore = JSON.stringify([this.newAction,this._actionEdit]);
        const listsBefore = this.draftValues.lists;
        const childOwnsLists = !!this.listEditor;
        this.loading = true;
        this.saveError = '';
        try {
            const [layout, lists, flows] = await Promise.all([
                getStagingInfoFresh({ key: `layout:${objectApi}:default` }),
                childOwnsLists ? Promise.resolve(undefined) : getStagingInfoFresh({ key: `exposures:${objectApi}` }),
                getStagingInfoFresh({ key: 'flows' })
            ]);
            if (generation !== this._loadGeneration || objectApi !== this.selectedObject) return false;
            if (before !== this.buildLayoutJson() || actionInputsBefore !== JSON.stringify([this.newAction,this._actionEdit]) || !childOwnsLists && listsBefore !== this.draftValues.lists) {
                this.saveError = 'Inputs changed during loading. Your working changes are retained; reload after saving or discarding them.';
                return false;
            }
            this.staging = { layout, lists };
            this.wiredPublishedFlows({ data: flows.liveValue });
            this.hasDraft = !!layout.draft;
            const workingJson = layout.draft?.Draft_Value__c ?? layout.liveValue;
            this.parseWorkingModel(workingJson);
            this.savedLayoutJson = this.buildLayoutJson();
            this.liveLayout = this.parseLayoutOnly(layout.liveValue);
            if (!childOwnsLists) {
                this.savedListsJson = this.pretty(lists.draft?.Draft_Value__c ?? lists.liveValue ?? this.sampleLists());
                this.draftValues = { lists: this.savedListsJson };
            }
            this.syncPreview();
            this.previewHasConfig = true;
            return true;
        } catch (e) {
            if (generation === this._loadGeneration) { this.saveError = this.msg(e); this.toast('Could not load card', this.saveError, 'error'); }
            return false;
        } finally {
            if (generation === this._loadGeneration) this.loading = false;
        }
    }

    parseWorkingModel(jsonStr) {
        this.cancelActionEdit();
        this._actionTableOriginals.clear();
        this.actionDraftValues = [];
        let cfg = {};
        try { cfg = JSON.parse(jsonStr || '{}'); } catch { /* fall through */ }
        this.preservedLayout = cfg;
        this.workingActions = (Array.isArray(cfg.actions) ? cfg.actions.filter(a => a && typeof a === 'object') : []).map((a, i) => this.normalizeAction(a, i));
        this.workingPermissions = {
            writeEnabled: !!cfg.permissions?.writeEnabled,
            fieldDenylist: Array.isArray(cfg.permissions?.fieldDenylist) ? cfg.permissions.fieldDenylist.filter(api => typeof api === 'string') : []
        };
        this.retainedDenylist = [...this.workingPermissions.fieldDenylist];
        this.restrictionError = '';
        this.denylistText = this.workingPermissions.fieldDenylist.join('\n');
        this.permissions = { writeEnabled: this.workingPermissions.writeEnabled };

        const parsed = this.parseLayoutOnly(jsonStr);
        this.workingHighlights = parsed.highlights;
        this.workingSections = parsed.sections;
        this.targetSectionKey = this.workingSections.length
            ? this.workingSections[this.workingSections.length - 1].key
            : '';
        this.refreshSectionMeta();
    }

    /**
     * Parse any known layout shape into the new {highlights, sections} model.
     * - New shape: {highlights, sections}
     * - Legacy recordCard.sections: labels preserved
     * - Old flat {fields}: migrated into one "{Object} Information" section
     */
    parseLayoutOnly(jsonStr) {
        let cfg = {};
        try { cfg = JSON.parse(jsonStr || '{}'); } catch { return { highlights: [], sections: [] }; }
        if (Array.isArray(cfg.sections) && cfg.sections.length) {
            return {
                highlights: this.enrichHighlights(Array.isArray(cfg.highlights) ? cfg.highlights : []),
                sections: cfg.sections.filter(s => s && typeof s === 'object').map((s, i) => this.makeSection(
                    s.label || `Section ${i + 1}`,
                    this.enrichFields(Array.isArray(s.fields) ? s.fields : []), s.columns
                ))
            };
        }
        if (cfg.recordCard && Array.isArray(cfg.recordCard.sections) && cfg.recordCard.sections.length) {
            return {
                highlights: [],
                sections: cfg.recordCard.sections.filter(s => s && typeof s === 'object').map((s, i) => this.makeSection(
                    s.label || s.title || `Section ${i + 1}`,
                    this.enrichFields(Array.isArray(s.fields) ? s.fields : []), s.columns
                ))
            };
        }
        const flat = this.enrichFields(this.extractFields(cfg));
        return {
            highlights: this.enrichHighlights(Array.isArray(cfg.highlights) ? cfg.highlights : []),
            sections: flat.length
                ? [this.makeSection(`${this.objectShortLabel()} Information`, flat)]
                : []
        };
    }

    /** Accept the old flat `fields` array (legacy helper for migration). */
    extractFields(cfg) {
        if (Array.isArray(cfg.fields)) return cfg.fields;
        return [];
    }

    makeSection(label, fields, columns) {
        const count = [1, 2, 3].includes(Number(columns)) ? Number(columns)
            : (fields || []).some(f => f.column === 'center') ? 3 : 2;
        return { key: this.uid(), label: label || 'Section', columns: count,
            fields: (fields || []).map(f => ({ ...f, column: count === 1 ? 'full'
                : count === 2 && f.column === 'center' ? 'right' : f.column })) };
    }

    get sectionColumnOptions() {
        return [{ label: '1 column', value: '1' }, { label: '2 columns', value: '2' }, { label: '3 columns', value: '3' }];
    }

    sectionColumnNames(section) {
        return section.columns === 1 ? ['full'] : section.columns === 3 ? ['left', 'center', 'right'] : ['left', 'right'];
    }

    get paletteFields() {
        return this.groupedFields.flatMap(g => g.fields.map(f => ({ ...f,
            draggable: f.added ? 'false' : 'true', paletteClass: f.added ? 'palette-field palette-used' : 'palette-field' })));
    }

    handleSectionColumnsChange(e) {
        const section = this.workingSections.find(s => s.key === e.currentTarget.dataset.key);
        const count = Number(e.detail.value);
        if (!section || ![1, 2, 3].includes(count)) return;
        section.columns = count;
        section.fields = section.fields.map(f => ({ ...f, column: count === 1 ? 'full'
            : count === 2 && f.column === 'center' ? 'right' : f.column }));
        this.refreshSectionMeta(); this.syncPreview();
    }

    /** Attach per-section "move to" options (other sections). Called after any section change. */
    refreshSectionMeta() {
        (this.workingSections || []).forEach(s => {
            s.moveOptions = this.workingSections
                .filter(o => o.key !== s.key)
                .map(o => ({ label: o.label || 'Untitled section', value: o.key }));
        });
        // Reassign to trigger reactivity on @track array children.
        this.workingSections = [...this.workingSections];
    }

    enrichFields(rawFields) {
        const map = this.fieldMap;
        return (rawFields || []).map(f => {
            const api = f.api || f.name || '';
            const meta = map[(api || '').toUpperCase()];
            const valid = !!meta && !!api;
            const column = this.normalizeColumn(f.column);
            return {
                key: this.uid(),
                api,
                label: f.label || meta?.label || api,
                type: f.type || meta?.type || 'UNKNOWN',
                editable: !!f.editable && !f.readOnly,
                required: !!f.required && !f.readOnly,
                readOnly: !!f.readOnly,
                column,
                ...this.columnVariants(column),
                valid,
                rowClass: valid ? 'layout-row' : 'layout-row row-invalid'
            };
        });
    }

    enrichHighlights(raw) {
        const map = this.fieldMap;
        return (raw || []).map(h => {
            const api = h.api || h.name || '';
            const meta = map[(api || '').toUpperCase()];
            const valid = !!meta && !!api;
            return {
                key: this.uid(),
                api,
                label: h.label || meta?.label || api,
                type: h.type || meta?.type || 'UNKNOWN',
                editable: !!h.editable && !h.readOnly,
                required: !!h.required && !h.readOnly,
                readOnly: !!h.readOnly,
                valid,
                rowClass: valid ? 'hl-chip' : 'hl-chip hl-invalid'
            };
        });
    }

    columnVariants(column) {
        return {
            colLeftVariant: column === 'left' ? 'brand' : 'bare',
            colRightVariant: column === 'right' ? 'brand' : 'bare',
            colFullVariant: column === 'full' ? 'brand' : 'bare'
        };
    }

    normalizeColumn(c) {
        return (c === 'left' || c === 'center' || c === 'right' || c === 'full') ? c : 'full';
    }

    columnLabel(c) {
        return c === 'left' ? 'Left' : c === 'center' ? 'Middle' : c === 'right' ? 'Right' : 'Full width';
    }

    uid() {
        return 'f' + Math.random().toString(36).slice(2, 9);
    }

    buildLayoutJson() {
        return this.serializeLayout(this.preservedLayout, this.workingHighlights, this.workingSections, this.workingActions, this.workingPermissions);
    }

    normalizedLayout(json) {
        let cfg = {};
        try { cfg = JSON.parse(json || '{}'); } catch { return json; }
        const parsed = this.parseLayoutOnly(json);
        return this.serializeLayout(cfg, parsed.highlights, parsed.sections, (Array.isArray(cfg.actions) ? cfg.actions : []).map((action, index) => this.normalizeAction(action, index)), { writeEnabled: !!cfg.permissions?.writeEnabled, fieldDenylist: Array.isArray(cfg.permissions?.fieldDenylist) ? cfg.permissions.fieldDenylist : [] });
    }

    serializeLayout(original, highlights, sections, actions, permissions) {
        const preserved = { ...(original || {}) };
        // These known legacy shapes are replaced by the current sections model.
        delete preserved.fields;
        if (preserved.recordCard) {
            preserved.recordCard = { ...preserved.recordCard };
            delete preserved.recordCard.sections;
            delete preserved.recordCard.fields;
        }
        return JSON.stringify({
            ...preserved,
            name: 'default',
            highlights: highlights.map(h => ({
                api: h.api, label: h.label, type: h.type,
                editable: !!h.editable, required: !!h.required, readOnly: !!h.readOnly
            })),
            sections: sections.map(s => ({
                label: s.label,
                columns: s.columns,
                fields: s.fields.map(f => ({
                    api: f.api, label: f.label, type: f.type,
                    editable: f.editable, required: !!f.required, readOnly: !!f.readOnly, column: f.column
                }))
            })),
            actions: actions.map(a => ({
                ...a, iconName: undefined, name: a.name, label: a.label, type: a.type,
                description: a.description, enabled: a.enabled
            })),
            permissions: {
                ...(original?.permissions || {}),
                writeEnabled: !!permissions.writeEnabled,
                fieldDenylist: [...permissions.fieldDenylist]
            }
        }, null, 2);
    }

    get generatedJson() {
        return this.pretty(this.buildLayoutJson());
    }

    get previewToggleLabel() { return this.showPreview ? 'Hide preview' : 'Preview card'; }
    togglePreview() { this.showPreview = !this.showPreview; }

    // ---------- Builder interactions ----------

    handleFieldSearch(e) {
        this.fieldSearch = e.target.value;
    }

    // ----- Highlights -----

    get highlightFieldOptions() {
        const data = this.wiredFieldsResult?.data || [];
        return data
            .filter(f => !this.usedApis.has((f.api || '').toUpperCase()))
            .map(f => ({ label: `${f.label} (${f.api})`, value: f.api }))
            .slice(0, 100);
    }

    get highlightsFull() {
        return this.workingHighlights.length >= 7;
    }

    handleAddHighlight(e) {
        const api = e.detail.value;
        if (!api || this.isFieldAdded(api)) return;
        if (this.workingHighlights.length >= 7) {
            this.toast('Highlights full', 'Up to 7 highlight fields.', 'info');
            return;
        }
        const [added] = this.enrichHighlights([{ api }]);
        if (!added) return;
        this.workingHighlights = [...this.workingHighlights, added];
        this.syncPreview();
    }

    handleRemoveHighlight(e) {
        const key = e.currentTarget.dataset.key;
        this.workingHighlights = this.workingHighlights.filter(h => h.key !== key);
        this.syncPreview();
    }

    // ----- Sections -----

    get sectionViews() {
        return (this.workingSections || []).map(s => ({ ...s,
            columnValue: String(s.columns), hasMultipleColumns: s.columns !== 1,
            showFullWidth: s.columns !== 1 && s.fields.some(f => f.column === 'full'),
            gridClass: 'section-grid columns-' + s.columns,
            fullFields: s.fields.filter(f => f.column === 'full'),
            columnViews: this.sectionColumnNames(s).map(column => ({ key: column,
                label: this.columnLabel(column), sectionKey: s.key,
                fields: s.fields.filter(f => f.column === column) }))
        }));
    }

    get hasSections() {
        return (this.workingSections || []).length > 0;
    }

    get sectionTargetOptions() {
        return (this.workingSections || []).map(s => ({
            label: s.label || 'Untitled section',
            value: s.key
        }));
    }

    handleAddSection() {
        const n = (this.workingSections || []).length + 1;
        const s = this.makeSection(`Section ${n}`, []);
        this.workingSections = [...this.workingSections, s];
        this.targetSectionKey = s.key;
        this.refreshSectionMeta();
        this.syncPreview();
    }

    handleRemoveSection(e) {
        const key = e.currentTarget.dataset.key;
        this.workingSections = this.workingSections.filter(s => s.key !== key);
        if (this.targetSectionKey === key) {
            this.targetSectionKey = this.workingSections.length
                ? this.workingSections[this.workingSections.length - 1].key
                : '';
        }
        this.refreshSectionMeta();
        this.syncPreview();
    }

    handleSectionLabelChange(e) {
        const key = e.currentTarget.dataset.key;
        const s = this.workingSections.find(x => x.key === key);
        if (s) {
            s.label = e.target.value;
            this.refreshSectionMeta();
            this.syncPreview();
        }
    }

    handleTargetSectionChange(e) {
        this.targetSectionKey = e.detail.value;
    }

    ensureSection() {
        if (!this.workingSections.length) {
            const s = this.makeSection(`${this.objectShortLabel()} Information`, []);
            this.workingSections = [s];
            this.targetSectionKey = s.key;
            this.refreshSectionMeta();
        }
        if (!this.workingSections.some(s => s.key === this.targetSectionKey)) {
            this.targetSectionKey = this.workingSections[this.workingSections.length - 1].key;
        }
    }

    findField(key, sectionKey) {
        const sec = this.workingSections.find(s => s.key === sectionKey);
        if (!sec) return null;
        return { section: sec, index: sec.fields.findIndex(f => f.key === key) };
    }

    // ----- Fields -----

    isFieldAdded(api) {
        return this.usedApis.has((api || '').toUpperCase());
    }

    addField(api) {
        const meta = this.fieldMap[(api || '').toUpperCase()];
        if (!meta) return;
        if (this.isFieldAdded(meta.api)) {
            this.toast('Already added', `${meta.label} is already in the layout.`, 'info');
            return;
        }
        this.ensureSection();
        const sec = this.workingSections.find(s => s.key === this.targetSectionKey)
            || this.workingSections[this.workingSections.length - 1];
        sec.fields = [...sec.fields, {
            key: this.uid(), api: meta.api, label: meta.label,
            type: meta.type, editable: false, column: 'full',
            ...this.columnVariants('full'),
            valid: true, rowClass: 'layout-row'
        }];
        this.refreshSectionMeta();
        this.syncPreview();
    }

    handleAddFieldClick(e) {
        this.addField(e.currentTarget.dataset.api);
    }

    removeField(key, sectionKey) {
        const found = this.findField(key, sectionKey);
        if (!found || found.index < 0) return;
        found.section.fields = found.section.fields.filter(f => f.key !== key);
        this.refreshSectionMeta();
        this.syncPreview();
    }

    handleRemoveField(e) {
        const ds = e.currentTarget.dataset;
        this.removeField(ds.key, ds.section);
    }

    moveField(key, sectionKey, dir) {
        const found = this.findField(key, sectionKey);
        if (!found) return;
        const arr = [...found.section.fields];
        const i = found.index;
        if (i < 0) return;
        const positions = arr.map((f, index) => f.column === arr[i].column ? index : -1).filter(index => index >= 0);
        const target = positions.indexOf(i) + dir;
        if (target < 0 || target >= positions.length) return;
        const j = positions[target];
        [arr[i], arr[j]] = [arr[j], arr[i]];
        found.section.fields = arr;
        this.refreshSectionMeta();
        this.syncPreview();
    }

    handleMoveUp(e) {
        const ds = e.currentTarget.dataset;
        this.moveField(ds.key, ds.section, -1);
    }

    handleMoveDown(e) {
        const ds = e.currentTarget.dataset;
        this.moveField(ds.key, ds.section, 1);
    }

    handleMoveFieldSection(e) {
        const ds = e.currentTarget.dataset;
        const toKey = e.detail.value;
        if (!toKey) return;
        const found = this.findField(ds.key, ds.section);
        const toSec = this.workingSections.find(s => s.key === toKey);
        if (!found || found.index < 0 || !toSec || toSec.key === ds.section) return;
        const [moved] = found.section.fields.splice(found.index, 1);
        found.section.fields = [...found.section.fields];
        toSec.fields = [...toSec.fields, moved];
        this.refreshSectionMeta();
        this.syncPreview();
        this.toast('Moved', `"${moved.label}" moved to "${toSec.label || 'Untitled section'}".`, 'success');
    }

    setFieldColumn(key, sectionKey, column) {
        const col = this.normalizeColumn(column);
        const found = this.findField(key, sectionKey);
        if (!found || found.index < 0) return;
        found.section.fields = found.section.fields.map(f =>
            f.key === key ? { ...f, column: col, ...this.columnVariants(col) } : f
        );
        this.refreshSectionMeta();
        this.syncPreview();
    }

    handleColumnLeft(e) {
        const ds = e.currentTarget.dataset;
        this.setFieldColumn(ds.key, ds.section, 'left');
    }

    handleColumnRight(e) {
        const ds = e.currentTarget.dataset;
        this.setFieldColumn(ds.key, ds.section, 'right');
    }

    handleColumnFull(e) {
        const ds = e.currentTarget.dataset;
        this.setFieldColumn(ds.key, ds.section, 'full');
    }

    handleEditableToggle(e) {
        const ds = e.currentTarget.dataset;
        const found = this.findField(ds.key, ds.section);
        if (!found || found.index < 0) return;
        found.section.fields = found.section.fields.map(f =>
            f.key === ds.key ? { ...f, editable: e.target.checked } : f
        );
    }

    // HTML5 drag-to-order (within a section)
    handleDragStart(e) {
        const ds = e.currentTarget.dataset;
        this.dragApi = ds.api || null;
        this.dragKey = ds.key || null;
        this.dragSectionKey = ds.section || null;
        if (this.dragApi && this.isFieldAdded(this.dragApi)) { e.preventDefault(); return; }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dragApi || this.dragKey || '');
        e.stopPropagation();
    }

    handleDragOver(e) {
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

    handleDrop(e) {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.classList.remove('drag-over');
        const ds = e.currentTarget.dataset;
        if (this.dragKey && this.dragKey === ds.key) { this.handleDragEnd(); return; }
        const highlightTarget = ds.section === 'highlights';
        const target = this.workingSections.find(s => s.key === ds.section);
        if ((!highlightTarget && !target) || (highlightTarget && this.highlightsFull && this.dragSectionKey !== 'highlights')) {
            this.handleDragEnd(); return;
        }
        let field;
        if (this.dragApi) {
            if (this.isFieldAdded(this.dragApi) || !this.fieldMap[this.dragApi.toUpperCase()]) { this.handleDragEnd(); return; }
            [field] = this.enrichFields([{ api: this.dragApi }]);
        } else if (this.dragSectionKey === 'highlights') {
            field = this.workingHighlights.find(f => f.key === this.dragKey);
            if (field) this.workingHighlights = this.workingHighlights.filter(f => f.key !== this.dragKey);
        } else {
            const source = this.findField(this.dragKey, this.dragSectionKey);
            if (source && source.index >= 0) {
                [field] = source.section.fields.splice(source.index, 1);
                source.section.fields = [...source.section.fields];
            }
        }
        if (!field) { this.handleDragEnd(); return; }
        if (highlightTarget) {
            field = { ...field, rowClass: field.valid ? 'hl-chip' : 'hl-chip hl-invalid' };
            const index = this.workingHighlights.findIndex(f => f.key === ds.key);
            const fields = [...this.workingHighlights]; fields.splice(index < 0 ? fields.length : index, 0, field);
            this.workingHighlights = fields;
        } else {
            const allowed = [...this.sectionColumnNames(target), 'full'];
            const column = allowed.includes(ds.column) ? ds.column : allowed[0];
            field = { ...field, column, rowClass: field.valid ? 'layout-row' : 'layout-row row-invalid' };
            const fields = [...target.fields]; const index = fields.findIndex(f => f.key === ds.key);
            fields.splice(index < 0 ? fields.length : index, 0, field); target.fields = fields;
        }
        this.handleDragEnd(); this.refreshSectionMeta(); this.syncPreview();
    }

    handleDragEnd() { this.dragApi = null; this.dragKey = null; this.dragSectionKey = null; }

    handleFieldEdit(e) {
        const { key, section, action, value } = e.detail;
        const found = this.findField(key, section);
        if (!found || found.index < 0) return;
        if (action === 'remove') { this.removeField(key, section); return; }
        if (action === 'up' || action === 'down') { this.moveField(key, section, action === 'up' ? -1 : 1); return; }
        if (action === 'section') {
            const target = this.workingSections.find(s => s.key === value);
            if (!target || target.key === section) return;
            const [moved] = found.section.fields.splice(found.index, 1);
            moved.column = this.sectionColumnNames(target).includes(moved.column) ? moved.column : 'full';
            target.fields = [...target.fields, moved];
        } else {
            const field = found.section.fields[found.index];
            if (action === 'label') field.label = value || field.api;
            if (action === 'editable') {
                field.editable = value;
                if (value) field.readOnly = false;
            }
            if (action === 'required') {
                field.required = !field.required;
                if (field.required) { field.readOnly = false; field.editable = true; }
            }
            if (action === 'readOnly') {
                field.readOnly = !field.readOnly;
                if (field.readOnly) { field.required = false; field.editable = false; }
            }
            if (action === 'column') field.column = value;
        }
        this.refreshSectionMeta(); this.syncPreview();
    }

    // ---------- Validation ----------

    get hasInvalidFields() {
        return this.workingHighlights.some(h => !h.valid)
            || this.allWorkingFields.some(f => !f.valid);
    }

    get invalidCount() {
        return this.workingHighlights.filter(h => !h.valid).length
            + this.allWorkingFields.filter(f => !f.valid).length;
    }

    get invalidCountText() {
        const n = this.invalidCount;
        return `${n} invalid field${n === 1 ? '' : 's'}`;
    }

    get cannotStage() {
        return !this.canStage || this.saveDisabled || !!this.restrictionError;
    }

    get diffToggleLabel() {
        return this.showDiff ? 'Hide changes' : 'Show changes vs published';
    }

    get jsonToggleLabel() {
        return this.showJson ? 'Hide JSON' : 'View JSON';
    }

    get canStage() {
        return !!this.selectedObject && (this.totalFieldCount > 0 || this.workingHighlights.length > 0) && !this.hasInvalidFields;
    }

    canonicalLayout(hl, sections) {
        return JSON.stringify({
            h: (hl || []).map(x => [(x.api || '').toUpperCase(), x.label || '', !!x.editable, !!x.required, !!x.readOnly]),
            s: (sections || []).map(s => ({
                label: s.label || '',
                columns: s.columns,
                f: (s.fields || []).map(f =>
                    (f.api || '').toUpperCase() + '|' + (f.label || '') + '|' + !!f.editable + '|' + !!f.required + '|' + !!f.readOnly + '|' + (f.column || 'full'))
            }))
        });
    }

    get isDirty() {
        if (!this.selectedObject) return false;
        const baseline = this.savedLayoutJson ?? this.normalizedLayout(this.staging.layout?.draft?.Draft_Value__c ?? this.staging.layout?.liveValue);
        return this.buildLayoutJson() !== baseline;
    }

    get editorState() {
        return draftState({ workingJson: this.buildLayoutJson(), savedJson: this.staging.layout?.draft ? this.savedLayoutJson : null,
            liveJson: this.staging.layout?.liveValue ? this.savedLayoutJson : null, busy: this.saving, error: this.saveError });
    }
    get workingStatusLabel() { return this.saveUnknown ? 'Save outcome unknown' : this.saving ? 'Saving…' : this.hasUnsavedWork ? 'Unsaved changes' : this.editorState.label; }
    get savedStatusLabel() { return this.staging.layout?.draft ? 'Draft saved · Review & Publish to update chat' : 'No saved draft'; }
    get liveStatusLabel() { return this.staging.layout?.liveValue ? 'Published card is live' : 'No published card'; }
    get saveLabel() { return this.saving ? 'Saving…' : 'Save draft'; }
    get saveDisabled() { return this.saving || this.checkingSavedState || this.saveUnknown || this.loading; }
    get readinessItems() {
        const layout = JSON.parse(this.buildLayoutJson());
        if (this.preservedLayout?.permissions?.fieldDenylist != null && !Array.isArray(this.preservedLayout.permissions.fieldDenylist)) layout.permissions.fieldDenylist = this.preservedLayout.permissions.fieldDenylist;
        if (Array.isArray(this.preservedLayout?.sections) && this.preservedLayout.sections.some(section => !section || !Array.isArray(section.fields))) layout.sections = this.preservedLayout.sections;
        const errors = this.workingActions.flatMap(action => action.type === 'record-edit' ? this.recordActionErrors(action, true) : []);
        return readiness({layout, fieldMetadata: this.wiredFieldsResult?.data, actionErrors: errors}).map(item => ({...item,
            target: {...item.target, ...(item.target.tab === 'objects' ? {objectApi:this.selectedObject} : {})}}));
    }
    handleSubviewActive(event) { this.activeSubview = event.target.value; }
    handleReadinessNavigate(event) {
        const target = event.detail || {};
        if (target.tab !== 'objects') { this.dispatchEvent(new CustomEvent('navigatetab', {detail:target,bubbles:true,composed:true})); return; }
        if (target.action === 'save') { this.stageLayout(); return; }
        this.openSubview(target.action);
    }
    @api
    openSubview(action) { if (['fields','permissions','actions','lists'].includes(action)) this.activeSubview = action === 'fields' ? 'layouts' : action; }
    openPublish() { this.dispatchEvent(new CustomEvent('navigatetab', {detail:{tab:'publish',draftId:this.staging.layout?.draft?.Id},bubbles:true,composed:true})); }

    get relatedListDefinitions() {
        const configuration = this.preservedLayout || {};
        return Array.isArray(configuration.relatedLists) ? configuration.relatedLists
            : !Object.prototype.hasOwnProperty.call(configuration,'relatedLists') && Array.isArray(configuration.recordCard?.relatedLists) ? configuration.recordCard.relatedLists : [];
    }
    handleRelatedChange(event) {
        if (this.saveDisabled || !Array.isArray(event.detail?.value)) return;
        this.preservedLayout = {...this.preservedLayout, relatedLists:event.detail.value};
    }

    // ---------- Diff ----------

    flatFieldList(sections) {
        const out = [];
        (sections || []).forEach(s =>
            (s.fields || []).forEach(f => out.push({ ...f, sectionLabel: s.label || '' }))
        );
        return out;
    }

    get diff() {
        const live = this.liveLayout || { highlights: [], sections: [] };
        const liveFlat = this.flatFieldList(live.sections);
        const workFlat = this.flatFieldList(this.workingSections);
        const liveApis = liveFlat.map(f => (f.api || '').toUpperCase());
        const workApis = workFlat.map(f => (f.api || '').toUpperCase());
        const added = workFlat.filter(f => !liveApis.includes((f.api || '').toUpperCase()));
        const removed = liveFlat.filter(f => !workApis.includes((f.api || '').toUpperCase()));
        const moved = [];
        workFlat.forEach((f, i) => {
            const li = liveApis.indexOf((f.api || '').toUpperCase());
            if (li !== -1 && li !== i) moved.push({ ...f, from: li + 1, to: i + 1 });
        });
        const liveHl = (live.highlights || []).map(h => (h.api || '').toUpperCase());
        const workHl = this.workingHighlights.map(h => (h.api || '').toUpperCase());
        const hlAdded = this.workingHighlights.filter(h => !liveHl.includes((h.api || '').toUpperCase()));
        const hlRemoved = (live.highlights || []).filter(h => !workHl.includes((h.api || '').toUpperCase()));
        return {
            added, removed, moved, hlAdded, hlRemoved,
            hasLive: !!(this.staging.layout?.liveValue),
            structureChanged: this.canonicalLayout(this.workingHighlights, this.workingSections) !== this.canonicalLayout(live.highlights, live.sections),
            empty: this.canonicalLayout(this.workingHighlights, this.workingSections) === this.canonicalLayout(live.highlights, live.sections)
        };
    }

    toggleDiff() { this.showDiff = !this.showDiff; }
    toggleJson() { this.showJson = !this.showJson; }

    async copyJson() {
        try {
            await navigator.clipboard.writeText(this.generatedJson);
            this.toast('Copied', 'Layout JSON copied to clipboard.', 'success');
        } catch {
            this.toast('Copy failed', 'Select the JSON manually to copy.', 'error');
        }
    }

    // ---------- Preview ----------

    syncPreview() {
        this._previewHighlights = this.workingHighlights;
        this._previewSections = this.workingSections;
        this.previewHasConfig = true;
    }

    sampleValue(field) {
        const t = (field.type || '').toUpperCase();
        const base = { value: '', isCheck: false, isBadge: false, isLink: false, isText: true };
        if (t === 'BOOLEAN') return { ...base, isText: false, isCheck: true };
        if (['INTEGER', 'DOUBLE', 'CURRENCY', 'PERCENT', 'LONG'].includes(t))
            return { ...base, value: '1,234' };
        if (t === 'DATE') return { ...base, value: 'Oct 2, 2026' };
        if (t === 'DATETIME') return { ...base, value: 'Oct 2, 2026 10:30 AM' };
        if (t === 'TIME') return { ...base, value: '10:30 AM' };
        if (['PICKLIST', 'MULTIPICKLIST'].includes(t))
            return { ...base, isText: false, isBadge: true, value: 'Sample' };
        if (t === 'REFERENCE') return { ...base, isText: false, isLink: true, value: 'Sample ' + field.label };
        if (t === 'EMAIL') return { ...base, isText: false, isLink: true, value: 'sample@example.com' };
        if (t === 'PHONE') return { ...base, isText: false, isLink: true, value: '(555) 123-4567' };
        if (t === 'URL') return { ...base, isText: false, isLink: true, value: 'example.com' };
        return { ...base, value: 'Sample ' + field.label };
    }

    get previewHighlightRows() {
        return (this._previewHighlights || []).map(h => ({ ...h, sample: this.sampleValue(h) }));
    }

    get previewHasHighlights() {
        return this.previewHighlightRows.length > 0;
    }

    get previewSectionViews() {
        return (this._previewSections || []).map(s => {
            const rows = (s.fields || []).map(f => ({ ...f, sample: this.sampleValue(f) }));
            return { key: s.key, label: s.label,
                fullRows: rows.filter(r => (r.column || 'full') === 'full'),
                gridClass: 'preview-cols columns-' + s.columns,
                columnViews: this.sectionColumnNames(s).filter(c => c !== 'full').map(column => ({ key: column,
                    rows: rows.filter(r => r.column === column) })),
                usesColumns: s.columns !== 1 && rows.some(r => r.column !== 'full'), hasRows: rows.length > 0 };
        });
    }

    get previewHasSections() {
        return this.previewSectionViews.length > 0;
    }

    get previewIsEmpty() {
        return !this.previewHasHighlights && !this.previewHasSections;
    }

    get advancedToggleLabel() {
        return this.showAdvanced ? 'Hide advanced' : 'Advanced: changes & code';
    }

    toggleAdvanced() { this.showAdvanced = !this.showAdvanced; }

    // ---------- Stage / persist ----------

    async persistWorkingModel(successTitle) {
        if (this.saveDisabled || this.restrictionError) return false;
        const errors = this.workingActions.filter(action => action.type === 'record-edit').flatMap(action => this.recordActionErrors(action, true));
        if (errors.length) { this.toast('Check record inputs', errors.join(' '), 'error'); return; }
        if (this.hasInvalidFields) {
            this.toast('Invalid fields', 'Remove or fix the highlighted fields before staging.', 'error');
            return;
        }
        if (!this.totalFieldCount && !this.workingHighlights.length) {
            this.toast('Empty layout', 'Add at least one highlight or section field.', 'error');
            return;
        }
        return this.saveCandidate(this.layoutKey, this.buildLayoutJson(), 'layout', successTitle);
    }

    async saveCandidate(key, value, surface, successTitle) {
        if (this.saveDisabled) return false;
        this.saving = true;
        this.saveError = '';
        const pending = { key, value, surface, objectApi: this.selectedObject, generation: this._loadGeneration };
        this._pendingSave = pending;
        let writeError;
        try { await saveDraft({key, value}); }
        catch (error) { writeError = error; }
        try {
            const confirmed = await this.reconcileSave(pending);
            if (confirmed) this.toast('Draft saved', successTitle || 'Review & Publish to update the card in chat.', 'success');
            else if (writeError && !this.saveUnknown) this.saveError = this.msg(writeError) + ' Your working inputs are retained.';
            return confirmed;
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
    isCurrentSave(pending) { return pending === this._pendingSave && pending.generation === this._loadGeneration && pending.objectApi === this.selectedObject; }
    async readSavedState(pending) {
        try {
            const state = await getStagingInfoFresh({key:pending.key});
            if (!this.isCurrentSave(pending)) return false;
            const raw = state.draft?.Draft_Value__c ?? state.liveValue;
            const actual = pending.surface === 'layout' ? this.normalizedLayout(raw) : this.pretty(raw ?? this.sampleLists());
            const expected = pending.surface === 'layout' ? this.normalizedLayout(pending.value) : this.pretty(pending.value);
            this.staging = {...this.staging, [pending.surface]:state};
            if (pending.surface === 'layout') { this.savedLayoutJson = actual; this.hasDraft = !!state.draft; this.liveLayout = this.parseLayoutOnly(state.liveValue); }
            else this.savedListsJson = actual;
            this.saveUnknown = false;
            this._pendingSave = null;
            const confirmed = !!state.draft && actual === expected;
            this.saveError = confirmed ? '' : 'The saved draft does not match this submission. Your working inputs are retained. Review the current draft before retrying.';
            if (confirmed) {
                if (pending.surface === 'layout') this.commitActionTableEdits(pending.value);
                this.notifyConfigChange(pending.key);
            }
            return confirmed;
        } catch (error) {
            if (!this.isCurrentSave(pending)) return false;
            this.saveUnknown = true;
            this.saveError = 'Save outcome unknown. Your inputs are retained. Check saved state before retrying or leaving. ' + this.msg(error);
            return false;
        }
    }

    checkSavedState() { return this.saving ? Promise.resolve(false) : this.reconcileSave(); }

    async stageLayout() {
        return this.persistWorkingModel();
    }

    async revertToLive() {
        this.parseWorkingModel(this.staging.layout?.liveValue);
        this.syncPreview();
        this.toast('Reverted', 'Working copy reset to the published layout.', 'info');
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

    // ---------- Lists compatibility entry points (native child owns editing) ----------

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

    handleDraftEdit(e) {
        this.draftValues = { ...this.draftValues, [e.target.dataset.key]: e.target.value };
    }

    async stageLists() {
        if (this.listEditor) return this.listEditor.save();
        const value = this.draftValues.lists;
        try { JSON.parse(value || '{}'); }
        catch {
            this.toast('Invalid JSON', 'Lists draft is not valid JSON.', 'error');
            return;
        }
        return this.saveCandidate(this.listsKey, value, 'lists', 'Lists draft saved. Review & Publish to update chat.');
    }

    _listsLoadGeneration = 0;
    async loadLiveLists() {
        if (this.listEditor) return this.listEditor.refresh();
        const objectApi = this.selectedObject;
        const generation = this._loadGeneration;
        const request = ++this._listsLoadGeneration;
        const before = this.draftValues.lists;
        const current = () => objectApi === this.selectedObject && generation === this._loadGeneration
            && request === this._listsLoadGeneration && before === this.draftValues.lists;
        try {
            const state = await getStagingInfoFresh({key:`exposures:${objectApi}`});
            if (!current()) return false;
            this.draftValues = { ...this.draftValues, lists: this.pretty(state.liveValue ?? this.sampleLists()) };
            return true;
        } catch (e) {
            if (current()) this.toast('Error', this.msg(e), 'error');
            return false;
        }
    }

    // ---------- Actions tab (visual) ----------

    actionColumns = [
        {
            label: 'Action', fieldName: 'label',
            cellAttributes: { iconName: { fieldName: 'iconName' }, iconPosition: 'left' }
        },
        { label: 'Description', fieldName: 'description', wrapText: true },
        { label: 'Type', fieldName: 'type' },
        { label: 'Enabled', fieldName: 'enabled', type: 'boolean', editable: true },
        {
            type: 'action',
            typeAttributes: { rowActions: (row, done) => done([
                ...(this.isEditableRecordAction(row) ? [{label:'Edit',name:'edit',iconName:'utility:edit'}] : []),
                {label:'Remove',name:'remove',iconName:'utility:delete'}
            ]) }
        }
    ];

    @track actionDraftValues = [];

    get actionToggles() {
        return this.workingActions;
    }

    normalizeAction(a, i) {
        // Working edits must not mutate the retained historical mapping contract.
        a = JSON.parse(JSON.stringify(a));
        const type = a.type || 'custom';
        return {
            ...a,
            name: a.name || `action-${i}`,
            label: a.label || a.name || `Action ${i + 1}`,
            type,
            description: a.description || this.defaultActionDescription(type, a.label || a.name),
            iconName: this.actionIcon(type),
            enabled: a.enabled !== false
        };
    }

    actionIcon(type) {
        const t = (type || '').toLowerCase();
        if (t.includes('edit') || t.includes('update')) return 'utility:edit';
        if (t.includes('delete') || t.includes('remove')) return 'utility:delete';
        if (t.includes('task') || t.includes('complete') || t.includes('check')) return 'utility:check';
        if (t.includes('flow')) return 'utility:flow';
        if (t.includes('call')) return 'utility:call';
        if (t.includes('email')) return 'utility:email';
        if (t.includes('new') || t.includes('create') || t.includes('add')) return 'utility:add';
        return 'utility:bolt';
    }

    defaultActionDescription(type, label) {
        const t = (type || '').toLowerCase();
        if (t === 'flow') return `Opens the "${label}" flow in Salesforce`;
        if (t === 'quick-action') return `Runs the "${label}" quick action`;
        if (t === 'url') return 'Opens a link';
        return `${label} action`;
    }

    _actionTableOriginals = new Map();
    handleActionDraftChange(e) {
        const updates = e.detail.draftValues;
        updates.forEach(u => {
            const a = this.workingActions.find(x => x.name === u.name);
            if (a) {
                if (!this._actionTableOriginals.has(u.name)) this._actionTableOriginals.set(u.name, a.enabled);
                a.enabled = u.enabled;
            }
        });
        this.workingActions = [...this.workingActions];
        this.actionDraftValues = updates;
    }

    async handleActionToggleSave(e) {
        this.handleActionDraftChange(e);
        await this.persistWorkingModel('Actions and current layout inputs saved together as a draft.');
    }

    handleActionDraftCancel() {
        this.workingActions = this.workingActions.map(action => this._actionTableOriginals.has(action.name)
            ? {...action,enabled:this._actionTableOriginals.get(action.name)} : action);
        this._actionTableOriginals.clear();
        this.actionDraftValues = [];
    }
    commitActionTableEdits(submittedJson) {
        const submitted = JSON.parse(submittedJson).actions || [];
        for (const [name] of this._actionTableOriginals) {
            const saved = submitted.find(action => action.name === name);
            const current = this.workingActions.find(action => action.name === name);
            if (!saved || !current || saved.enabled === current.enabled) this._actionTableOriginals.delete(name);
            else this._actionTableOriginals.set(name, saved.enabled);
        }
        this.actionDraftValues = this.actionDraftValues.filter(action => this._actionTableOriginals.has(action.name));
    }

    handleNewActionInput(e) {
        if (this.isEditingAction && !['label','description','enabled'].includes(e.target.dataset.field)) return;
        this.newAction = { ...this.newAction, [e.target.dataset.field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value };
    }

    get isEditingAction() { return !!this._actionEdit; }
    get actionFormHeading() { return this.isEditingAction ? 'Edit action' : 'Add action'; }
    get actionSubmitLabel() { return this.isEditingAction ? 'Update action' : 'Add action'; }
    get actionNameLabel() { return this.isEditingAction ? 'Launch name' : 'Name (optional)'; }
    isEditableRecordAction(action) {
        // Policy failures may be repaired here. Historical mappings and Stage keep their own interpretation.
        return action?.type === 'record-edit' && action.flowApiName == null && Array.isArray(action.mappings)
            && action.mappings.length > 0 && action.mappings.every(mapping => mapping && mapping.source === 'current'
                && mapping.sourceField == null && mapping.value == null)
            && !(this.isOpportunityObject && action.mappings.some(mapping => mapping.fieldApi === 'StageName'));
    }
    editAction(name) {
        if (this.saveDisabled) return;
        const action = this.workingActions.find(item => item.name === name);
        if (!this.isEditableRecordAction(action)) { this.toast('Action unavailable', 'This action uses a retained mapping or specialized preset and cannot be changed in the generic editor.', 'info'); return; }
        if (this.hasNewActionInputs) { this.toast('Finish action inputs', 'Update or cancel the current action inputs before editing another action.', 'info'); return; }
        this._actionEdit = {objectApi:this.selectedObject,generation:this._loadGeneration,name:action.name,snapshot:JSON.stringify(action)};
        this.newAction = JSON.parse(JSON.stringify(action));
    }
    cancelActionEdit() {
        this._actionEdit = null;
        this.newAction = {name:'',label:'',type:'',description:'',enabled:true,mappings:[]};
    }

    async loadInterpretedFlows(objectApi) {
        const generation=++this._flowCatalogGeneration;
        this.interpretedFlows=[];this.interpretedFlowCatalogError='';this.interpretedFlowHasMore=false;
        try {
            const result=await getPublishedFlowPlans({objectApi});
            if(generation!==this._flowCatalogGeneration || objectApi!==this.selectedObject)return;
            this.interpretedFlows=result.plans || [];this.interpretedFlowHasMore=!!result.hasMore;
        } catch {
            if(generation===this._flowCatalogGeneration)this.interpretedFlowCatalogError='Published in-chat Flow choices could not load. Existing action drafts are retained.';
        }
    }
    get isInterpretedAction() { return this.newAction.type === 'screen-flow'; }

    get actionTargetOptions() {
        const options = this.recordEditCapability?.eligible ? [{label:`Edit ${this.selectedObjectLabel} fields · in chat`,value:'record-edit'}] : [];
        if (this.isOpportunityObject) options.push({label:'Edit Opportunity Stage, Close date and Amount · in chat',value:'opportunity-stage'});
        return options.concat(this.publishedFlows.map(flow => ({label:`${flow.label || flow.apiName} · opens Salesforce`,value:`flow:${flow.apiName || flow.flowApiName}`}))).concat(this.interpretedFlows.map(flow=>({label:`${flow.label || flow.apiName} · in-chat screens`,value:`screen-flow:${flow.apiName}`})));
    }
    get actionTarget() { return this.newAction.type === 'screen-flow' ? `screen-flow:${this.newAction.flowApiName}` : this.newAction.type === 'flow' ? `flow:${this.newAction.flowApiName}` : this.isOpportunityAction ? 'opportunity-stage' : this.newAction.type; }
    get isGuidedAction() { return this.newAction.type === 'record-edit' && !this.isOpportunityAction; }
    get isOpportunityAction() { return this.isOpportunityObject && this.newAction.type === 'record-edit' && Array.isArray(this.newAction.mappings) && this.newAction.mappings.some(mapping => mapping?.fieldApi === 'StageName'); }
    get isOpportunityObject() { return this.selectedObject === 'Opportunity'; }
    get opportunityPresetMappings() { return ['StageName','CloseDate','Amount'].map(fieldApi => ({fieldApi,source:'current'})); }
    isUpdateable(field) { return field?.updateable === true || field?.updateable === 'true'; }
    get opportunityAuthoringErrors() {
        const errors = [];
        if (!this.workingPermissions.writeEnabled) errors.push('Enable chat edits in Permissions before enabling this action.');
        const fields = [...this.workingHighlights,...this.allWorkingFields];
        const denied = new Set(this.workingPermissions.fieldDenylist.map(api => api.trim().toLowerCase()));
        for (const api of ['StageName','CloseDate','Amount']) {
            const exposed = fields.filter(field => field.api === api), native = this.fieldMap[api.toUpperCase()];
            if (!exposed.length || exposed.some(field => !field.editable || field.readOnly) || denied.has(api.toLowerCase()) || !native || !this.isUpdateable(native)) errors.push(`${api}: expose the field in the layout and enable editing; Salesforce update access is required.`);
        }
        return errors;
    }
    get hasOpportunityAuthoringErrors() { return this.opportunityAuthoringErrors.length > 0; }
    get opportunityErrorRows() { return this.opportunityAuthoringErrors.map((message,index) => ({key:`preset-error-${index}`,message})); }
    opportunityPreviewLayout = {version:1,sections:[{id:'details',label:'Synthetic edit details',columns:2,fields:['StageName','CloseDate','Amount']}]};
    isExactOpportunityPreset(action) { return action.flowApiName == null && Array.isArray(action.mappings) && action.mappings.length === 3 && action.mappings.every((mapping,index) => mapping && mapping.fieldApi === this.opportunityPresetMappings[index].fieldApi && mapping.source === 'current' && mapping.sourceField == null && mapping.value == null); }
    recordActionErrors(action, preserveLegacy = false) {
        // Existing Account mappings retain the native historical interpretation.
        if (preserveLegacy && this.selectedObject === 'Account' && Array.isArray(action.mappings) && action.mappings.some(mapping => mapping?.source !== 'current' || mapping?.sourceField != null || mapping?.value != null) && this.preservedLayout.actions?.some(original => original?.name === action.name && original?.type === 'record-edit' && JSON.stringify(original.mappings) === JSON.stringify(action.mappings))) return [];
        if (this.isOpportunityObject && Array.isArray(action.mappings) && action.mappings.some(mapping => mapping?.fieldApi === 'StageName')) {
            if (!this.isExactOpportunityPreset(action)) return ['Use the fixed Stage, Close date and Amount current-value preset.'];
            return action.enabled === false ? [] : this.opportunityAuthoringErrors;
        }
        return recordAuthoring.actionErrors(action,this.recordEditCapability,[...this.workingHighlights,...this.allWorkingFields],this.workingPermissions);
    }
    get recordAuthoringNotice() { return 'Inputs start from current record values. Drafts grant no execution rights; publish before launching in chat. Salesforce access remains required.'; }
    get recordAuthoringErrors() { return this.isGuidedAction ? this.recordActionErrors(this.newAction) : []; }
    get hasRecordAuthoringErrors() { return this.recordAuthoringErrors.length > 0; }
    get recordErrorRows() { return this.recordAuthoringErrors.map((message,index) => ({key:`record-error-${index}`,message})); }
    get recordPreviewFields() { return recordAuthoring.previewFields(this.newAction,this.recordEditCapability,[...this.workingHighlights,...this.allWorkingFields],this.workingPermissions); }
    get recordPreviewLayout() { return recordAuthoring.previewLayout(this.newAction,this.workingHighlights,this.workingSections); }
    get recordNativeKeyPrefix() { return this.recordEditCapability?.nativeKeyPrefix; }
    get isSalesforceAction() { return this.newAction.type === 'flow'; }
    handleActionTarget(e) {
        if (this.isEditingAction) return;
        const value = e.detail.value;
        this.newAction = {...this.newAction,type:value.startsWith('screen-flow:') ? 'screen-flow' : value.startsWith('flow:') ? 'flow' : value === 'opportunity-stage' ? 'record-edit' : value,flowApiName:value.startsWith('screen-flow:') ? value.slice(12) : value.startsWith('flow:') ? value.slice(5) : undefined,mappings:value === 'opportunity-stage' ? this.opportunityPresetMappings : value === 'record-edit' ? this.editableActionFields.slice(0,20).map(field => ({fieldApi:field.value,source:'current'})) : []};
    }
    get mappedSourceOptions() { return [{label:'Current field value',value:'current'}]; }
    get exposedActionFields() {
        return [...this.workingHighlights, ...this.workingSections.flatMap(s => s.fields)].map(f => ({ label: f.label || f.api, value: f.api }));
    }
    get editableActionFields() { return recordAuthoring.eligibleFields(this.recordEditCapability,[...this.workingHighlights,...this.allWorkingFields],this.workingPermissions); }
    get mappingRows() {
        return (this.newAction.mappings || []).map((m, index) => ({ ...m, index, key: `mapping-${index}`, first:index === 0,last:index === this.newAction.mappings.length-1,isField: m.source === 'field', isConstant: m.source === 'constant' }));
    }
    moveMapping(e) {
        const index = Number(e.currentTarget.dataset.index), to = index + (e.currentTarget.dataset.direction === 'up' ? -1 : 1);
        const mappings = [...(this.newAction.mappings || [])];
        if (!Number.isInteger(index) || index < 0 || index >= mappings.length || to < 0 || to >= mappings.length) return;
        const [mapping] = mappings.splice(index,1); mappings.splice(to,0,mapping); this.newAction = {...this.newAction,mappings};
    }
    addMapping() { this.newAction = { ...this.newAction, mappings: [...(this.newAction.mappings || []), { fieldApi: '', source: 'current' }] }; }
    removeMapping(e) { this.newAction = { ...this.newAction, mappings: this.newAction.mappings.filter((m, i) => i !== Number(e.currentTarget.dataset.index)) }; }
    handleMapping(e) {
        const index = Number(e.target.dataset.index), field = e.target.dataset.field;
        this.newAction = { ...this.newAction, mappings: this.newAction.mappings.map((m, i) => i === index ? { ...m, [field]: e.detail?.value ?? e.target.value } : m) };
    }

    async addAction() {
        if (this.saveDisabled) return;
        const edit = this._actionEdit;
        const selected = edit && this.workingActions.find(action => action.name === edit.name);
        if (edit && (edit.objectApi !== this.selectedObject || edit.generation !== this._loadGeneration || !selected
            || JSON.stringify(selected) !== edit.snapshot || this.newAction.name !== edit.name || !this.isEditableRecordAction(this.newAction))) {
            this.toast('Action changed', 'This action context has changed. Cancel and open its current action before updating.', 'error'); return;
        }
        if (!edit && this.workingActions.length >= 20) { this.toast('Action limit', 'A record card supports up to twenty actions. Remove an action before adding another.', 'error'); return; }
        const { name, label, type, description, mappings, flowApiName } = this.newAction;
        if (type === 'record-edit') {
            const errors = this.recordActionErrors(this.newAction);
            if (errors.length) { this.toast('Check record inputs',errors.join(' '),'error'); return; }
        } else if (!(type === 'flow' && this.publishedFlows.some(f => (f.apiName || f.flowApiName) === flowApiName) || type === 'screen-flow' && this.interpretedFlows.some(f => f.apiName === flowApiName && f.targetObjectApiName === this.selectedObject))) {
            this.toast('Choose a process', 'Choose a guided edit or a published Salesforce launch card.', 'error'); return;
        }
        if (!label?.trim()) {
            this.toast('Missing label', 'Give the action a label.', 'error');
            return;
        }
        const actionName = edit ? edit.name : (name?.trim() || label.trim()).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (!actionName || actionName.length > 80 || !edit && this.workingActions.some(a => a.name === actionName)) {
            this.toast('Duplicate', 'An action with that name already exists.', 'error');
            return;
        }
        const updated = this.normalizeAction({...selected,...this.newAction,name:actionName,label:label.trim(),type,description:description?.trim(),enabled:this.newAction.enabled !== false},this.workingActions.length);
        this.workingActions = edit ? this.workingActions.map(action => action.name === edit.name ? updated : action) : [...this.workingActions,updated];
        this.cancelActionEdit();
        await this.persistWorkingModel(edit ? 'Action updated as a layout draft.' : 'Action added as a layout draft.');
    }

    async removeAction(e) {
        const name = e.currentTarget.dataset.name;
        this.workingActions = this.workingActions.filter(a => a.name !== name);
        await this.persistWorkingModel('Action removed as a layout draft.');
    }

    handleActionRowAction(e) {
        const action = e.detail.action;
        const row = e.detail.row;
        if (action.name === 'edit') { this.editAction(row.name); return; }
        if (action.name === 'remove') {
            this.workingActions = this.workingActions.filter(a => a.name !== row.name);
            this.persistWorkingModel('Action removed as a layout draft.');
        }
    }

    // ---------- Permissions tab (wired to working model) ----------

    @track permissions = null;
    @track denylistText = '';

    handleWriteToggle(e) {
        this.permissions = { ...this.permissions, writeEnabled: e.target.checked };
        this.workingPermissions = { ...this.workingPermissions, writeEnabled: e.target.checked };
    }

    @track restrictionError = '';
    retainedDenylist = [];
    handleDenylistEdit(e) {
        this.denylistText = e.target.value;
        const values = this.denylistText.split('\n').map(value => value.trim()).filter(Boolean);
        const retained = new Set(this.retainedDenylist.map(value => value.toLowerCase()));
        const invalid = values.filter(value => !retained.has(value.toLowerCase()) && (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value) || !this.fieldMap[value.toUpperCase()]));
        this.restrictionError = invalid.length ? 'Choose available field API names. Unavailable existing restrictions are retained until you remove them.' : '';
        if (!invalid.length) this.workingPermissions = {...this.workingPermissions, fieldDenylist:[...new Set(values)]};
    }
    handleRestrictionSearch(e) { this.restrictionSearch = e.target.value; }
    get restrictionOptions() {
        const query = this.restrictionSearch.toLowerCase().trim();
        const denied = new Set(this.workingPermissions.fieldDenylist.map(value => value.toLowerCase()));
        return (this.wiredFieldsResult?.data || []).filter(field => !query || (field.label + ' ' + field.api).toLowerCase().includes(query)).map(field => ({...field,labelWithApi:`${field.label || field.api} (${field.api})`,restricted:denied.has(field.api.toLowerCase())}));
    }
    get retainedRestrictionRows() { return this.workingPermissions.fieldDenylist.filter(api => !this.fieldMap[api.toUpperCase()]).map(api => ({api})); }
    toggleRestriction(e) {
        const api = e.currentTarget.dataset.api;
        if (!this.fieldMap[api.toUpperCase()] && !this.retainedDenylist.includes(api)) return;
        const values = this.workingPermissions.fieldDenylist.filter(value => value.toLowerCase() !== api.toLowerCase());
        if (e.target.checked) values.push(api);
        this.workingPermissions = {...this.workingPermissions,fieldDenylist:values};
        this.denylistText = values.join('\n');
        this.restrictionError = '';
    }

    async stagePermissions() {
        if (this.restrictionError) { this.toast('Check restrictions', this.restrictionError, 'error'); return false; }
        return this.persistWorkingModel('Permissions and current layout inputs saved together as a draft.');
    }

    notifyConfigChange(key) {
        this.dispatchEvent(new CustomEvent('configchange', { detail: { keys: [key], operation: 'save' }, bubbles: true, composed: true }));
    }

    // ---------- Helpers ----------

    pretty(json) {
        try {
            return JSON.stringify(JSON.parse(json), null, 2);
        } catch {
            return json || '';
        }
    }

    sampleLists() {
        return JSON.stringify({ views: [], customLists: [] }, null, 2);
    }

    msg(e) {
        return e?.body?.message || e?.message || 'Unknown error';
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
