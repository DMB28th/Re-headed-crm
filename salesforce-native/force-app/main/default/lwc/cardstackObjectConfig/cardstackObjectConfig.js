import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCrmObjects from '@salesforce/apex/CardstackStudioController.getCrmObjects';
import getConfigValue from '@salesforce/apex/CardstackStudioController.getConfigValue';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import saveDraft from '@salesforce/apex/CardstackStudioController.saveDraft';
import getObjectFields from '@salesforce/apex/CardstackStudioController.getObjectFields';

/**
 * cardstackObjectConfig — per-object Studio section.
 *
 * Object picker + audience picker, then five sub-tabs:
 * - Layouts: VISUAL builder with Salesforce-style SECTIONS + Highlights Panel
 *   (section cards with 2-column field grids, inline label editing,
 *   move-fields-between-sections, live preview, validation, diff, JSON export)
 *   + staging.
 * - Lists: JSON editor + staging (unchanged).
 * - Actions: visual toggles with icons/descriptions.
 * - Assignment: audience -> layout mapping (unchanged).
 * - Permissions: write policy editor (unchanged behavior, wired to builder model).
 *
 * Layout model (new shape):
 *   { highlights: [{api,label,type}], sections: [{label, fields:[{api,label,type,editable,column}]}] }
 * Old flat `{fields:[...]}` configs and legacy `recordCard.sections` configs are
 * migrated on load into the new shape.
 */
export default class CardstackObjectConfig extends LightningElement {
    @track selectedObject = '';
    @track audience = 'default';
    @track staging = {};
    @track draftValues = { lists: '' };
    @track newAudience = '';
    @track extraAudiences = [];

    // ----- Visual builder state (sections model) -----
    @track workingHighlights = [];   // [{ key, api, label, type, valid, rowClass }]
    @track workingSections = [];     // [{ key, label, fields: [{key,api,label,type,editable,valid,column,...}] }]
    @track targetSectionKey = '';    // picker "+" adds here
    @track workingActions = [];      // [{ name, label, type, description, iconName, enabled }]
    @track workingPermissions = { writeEnabled: false, fieldDenylist: [] };
    @track hasDraft = false;
    @track fieldSearch = '';
    @track previewAudience = 'default';
    @track previewHasConfig = true;
    @track showPreview = false;
    @track showJson = false;
    @track showDiff = false;
    @track showAdvanced = false;
    @track loading = false;
    @track objectSearch = '';
    @track objectDropdownOpen = false;
    dragApi = null;
    dragKey = null;
    dragSectionKey = null;

    // Preview model (raw; sample values attached in getters)
    _previewHighlights = [];
    _previewSections = [];

    // ----- New-action form -----
    @track newAction = { name: '', label: '', type: '', description: '', mappings: [] };
    @track publishedFlows = [];
    @wire(getConfigValue, { key: 'flows' })
    wiredPublishedFlows({ data }) {
        try { const parsed = data ? JSON.parse(data) : []; this.publishedFlows = Array.isArray(parsed) ? parsed : []; } catch (e) { this.publishedFlows = []; }
    }

    wiredObjectsResult;
    wiredFieldsResult;

    @wire(getCrmObjects)
    wiredObjects(result) {
        this.wiredObjectsResult = result;
    }

    @wire(getObjectFields, { objectApi: '$selectedObject' })
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

    handleObjectBlur() {
        // Delay so a click on a dropdown item registers first.
        setTimeout(() => { this.objectDropdownOpen = false; }, 200);
    }

    handleObjectSelect(e) {
        const api = e.currentTarget.dataset.value;
        this.selectedObject = api;
        this.objectSearch = '';
        this.objectDropdownOpen = false;
        this.audience = 'default';
        this.extraAudiences = [];
        this.fieldSearch = '';
        this.loadStaging();
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

    handleClearObject() {
        this.selectedObject = '';
        this.objectSearch = '';
        this.workingHighlights = [];
        this.workingSections = [];
        this.targetSectionKey = '';
        this._previewHighlights = [];
        this._previewSections = [];
    }

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

    get audienceOptions() {
        const base = [{ label: 'Default (everyone)', value: 'default' }];
        (this.extraAudiences || []).forEach(a => base.push({ label: a, value: a }));
        return base;
    }

    get previewAudienceOptions() {
        return this.audienceOptions;
    }

    get layoutKey() {
        return `layout:${this.selectedObject}:${this.audience}`;
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
        this.loading = true;
        try {
            const [layout, lists, flows] = await Promise.all([
                getStagingInfo({ key: this.layoutKey }),
                getStagingInfo({ key: this.listsKey }),
                getStagingInfo({ key: 'flows' })
            ]);
            this.staging = { layout, lists };
            this.wiredPublishedFlows({ data: flows.liveValue });
            this.hasDraft = !!layout.draft;
            const workingJson = layout.draft?.Draft_Value__c ?? layout.liveValue;
            this.parseWorkingModel(workingJson);
            this.liveLayout = this.parseLayoutOnly(layout.liveValue);
            this.draftValues = {
                lists: this.pretty(lists.draft?.Draft_Value__c ?? lists.liveValue ?? this.sampleLists())
            };
            this.buildAssignmentRows();
            this.previewAudience = this.audience;
            this.syncPreview();
            this.previewHasConfig = true;
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        } finally {
            this.loading = false;
        }
    }

    parseWorkingModel(jsonStr) {
        let cfg = {};
        try { cfg = JSON.parse(jsonStr || '{}'); } catch { /* fall through */ }
        this.preservedLayout = cfg;
        this.workingActions = (cfg.actions || []).map((a, i) => this.normalizeAction(a, i));
        this.workingPermissions = {
            writeEnabled: !!cfg.permissions?.writeEnabled,
            fieldDenylist: [...(cfg.permissions?.fieldDenylist || [])]
        };
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
                highlights: this.enrichHighlights(cfg.highlights || []),
                sections: cfg.sections.map((s, i) => this.makeSection(
                    s.label || `Section ${i + 1}`,
                    this.enrichFields(s.fields || []), s.columns
                ))
            };
        }
        if (cfg.recordCard && Array.isArray(cfg.recordCard.sections) && cfg.recordCard.sections.length) {
            return {
                highlights: [],
                sections: cfg.recordCard.sections.map((s, i) => this.makeSection(
                    s.label || s.title || `Section ${i + 1}`,
                    this.enrichFields(s.fields || []), s.columns
                ))
            };
        }
        const flat = this.enrichFields(this.extractFields(cfg));
        return {
            highlights: this.enrichHighlights(cfg.highlights || []),
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
        const preserved = { ...(this.preservedLayout || {}) };
        // These known legacy shapes are replaced by the current sections model.
        delete preserved.fields;
        if (preserved.recordCard) {
            preserved.recordCard = { ...preserved.recordCard };
            delete preserved.recordCard.sections;
            delete preserved.recordCard.fields;
        }
        return JSON.stringify({
            ...preserved,
            name: this.audience,
            highlights: this.workingHighlights.map(h => ({
                api: h.api, label: h.label, type: h.type,
                editable: !!h.editable, required: !!h.required, readOnly: !!h.readOnly
            })),
            sections: this.workingSections.map(s => ({
                label: s.label,
                columns: s.columns,
                fields: s.fields.map(f => ({
                    api: f.api, label: f.label, type: f.type,
                    editable: f.editable, required: !!f.required, readOnly: !!f.readOnly, column: f.column
                }))
            })),
            actions: this.workingActions.map(a => ({
                ...a, iconName: undefined, name: a.name, label: a.label, type: a.type,
                description: a.description, enabled: a.enabled
            })),
            permissions: {
                ...(this.preservedLayout?.permissions || {}),
                writeEnabled: !!this.workingPermissions.writeEnabled,
                fieldDenylist: [...this.workingPermissions.fieldDenylist]
            }
        }, null, 2);
    }

    get generatedJson() {
        return this.pretty(this.buildLayoutJson());
    }

    get previewToggleLabel() { return this.showPreview ? 'Hide preview' : 'Preview card'; }
    togglePreview() { this.showPreview = !this.showPreview; }

    // ---------- Builder interactions ----------

    handleAudienceChange(e) {
        this.audience = e.detail.value;
        this.loadStaging();
    }

    handleFieldSearch(e) {
        this.fieldSearch = e.target.value;
    }

    // ----- Highlights -----

    get highlightFieldOptions() {
        const used = new Set(this.workingHighlights.map(h => (h.api || '').toUpperCase()));
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
        return !this.canStage;
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
        const base = this.staging.layout?.draft?.Draft_Value__c ?? this.staging.layout?.liveValue;
        const live = this.parseLayoutOnly(base);
        if (!base && (this.totalFieldCount || this.workingHighlights.length)) return true;
        try {
            return this.canonicalLayout(this.workingHighlights, this.workingSections)
                !== this.canonicalLayout(live.highlights, live.sections);
        } catch { return true; }
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
        if (this.previewAudience === this.audience) {
            this._previewHighlights = this.workingHighlights;
            this._previewSections = this.workingSections;
            this.previewHasConfig = true;
        }
    }

    async handlePreviewAudienceChange(e) {
        this.previewAudience = e.detail.value;
        if (this.previewAudience === this.audience) {
            this._previewHighlights = this.workingHighlights;
            this._previewSections = this.workingSections;
            this.previewHasConfig = true;
            return;
        }
        try {
            const key = `layout:${this.selectedObject}:${this.previewAudience}`;
            const info = await getStagingInfo({ key });
            const json = info.draft?.Draft_Value__c ?? info.liveValue;
            this.previewHasConfig = !!json;
            const parsed = this.parseLayoutOnly(json);
            this._previewHighlights = parsed.highlights;
            this._previewSections = parsed.sections;
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
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
        if (this.hasInvalidFields) {
            this.toast('Invalid fields', 'Remove or fix the highlighted fields before staging.', 'error');
            return;
        }
        if (!this.totalFieldCount && !this.workingHighlights.length) {
            this.toast('Empty layout', 'Add at least one highlight or section field.', 'error');
            return;
        }
        try {
            await saveDraft({ key: this.layoutKey, value: this.buildLayoutJson() });
            this.toast('Draft staged', successTitle || 'Layout draft saved. Publish it in the Publish Center.', 'success');
            await this.loadStaging();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    async stageLayout() {
        await this.persistWorkingModel();
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

    // ---------- Lists tab (unchanged) ----------

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
        const value = this.draftValues.lists;
        try { JSON.parse(value || '{}'); }
        catch {
            this.toast('Invalid JSON', 'Lists draft is not valid JSON.', 'error');
            return;
        }
        try {
            await saveDraft({ key: this.listsKey, value });
            this.toast('Draft staged', 'Lists draft saved. Publish it in the Publish Center.', 'success');
            this.loadStaging();
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
        }
    }

    async loadLiveLists() {
        try {
            const v = await getConfigValue({ key: this.listsKey });
            this.draftValues = { ...this.draftValues, lists: this.pretty(v ?? this.sampleLists()) };
        } catch (e) {
            this.toast('Error', this.msg(e), 'error');
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
            typeAttributes: { rowActions: [{ label: 'Remove', name: 'remove', iconName: 'utility:delete' }] }
        }
    ];

    @track actionDraftValues = [];

    get actionToggles() {
        return this.workingActions;
    }

    normalizeAction(a, i) {
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

    async handleActionToggleSave(e) {
        const updates = e.detail.draftValues;
        updates.forEach(u => {
            const a = this.workingActions.find(x => x.name === u.name);
            if (a) a.enabled = u.enabled;
        });
        this.workingActions = [...this.workingActions];
        this.actionDraftValues = [];
        await this.persistWorkingModel('Action toggles saved as a layout draft.');
    }

    handleNewActionInput(e) {
        this.newAction = { ...this.newAction, [e.target.dataset.field]: e.target.value };
    }

    get actionTargetOptions() {
        const options = this.selectedObject === 'Account' ? [{ label: 'Edit Account fields · in chat', value: 'record-edit' }] : [];
        return options.concat(this.publishedFlows.map(f => ({ label: `${f.label || f.apiName} · opens Salesforce`, value: `flow:${f.apiName || f.flowApiName}` })));
    }
    get actionTarget() { return this.newAction.type === 'flow' ? `flow:${this.newAction.flowApiName}` : this.newAction.type; }
    get isGuidedAction() { return this.newAction.type === 'record-edit'; }
    get isSalesforceAction() { return this.newAction.type === 'flow'; }
    handleActionTarget(e) {
        const value = e.detail.value;
        this.newAction = { ...this.newAction, type: value.startsWith('flow:') ? 'flow' : value, flowApiName: value.startsWith('flow:') ? value.slice(5) : undefined, mappings: [] };
    }
    get mappedSourceOptions() {
        return [{ label: 'Current field value', value: 'current' }, { label: 'Another record field', value: 'field' }, { label: 'Constant', value: 'constant' }, { label: 'Ask the user', value: 'answer' }];
    }
    get exposedActionFields() {
        return [...this.workingHighlights, ...this.workingSections.flatMap(s => s.fields)].map(f => ({ label: f.label || f.api, value: f.api }));
    }
    get editableActionFields() {
        const fields = [...this.workingHighlights, ...this.workingSections.flatMap(s => s.fields)];
        return fields.filter(f => f.editable && !f.readOnly && ['STRING', 'TEXTAREA', 'INTEGER'].includes(this.fieldMap[f.api.toUpperCase()]?.type?.toUpperCase())).map(f => ({ label: f.label || f.api, value: f.api }));
    }
    get mappingRows() {
        return (this.newAction.mappings || []).map((m, index) => ({ ...m, index, key: `mapping-${index}`, isField: m.source === 'field', isConstant: m.source === 'constant' }));
    }
    addMapping() { this.newAction = { ...this.newAction, mappings: [...(this.newAction.mappings || []), { fieldApi: '', source: 'current', value: '' }] }; }
    removeMapping(e) { this.newAction = { ...this.newAction, mappings: this.newAction.mappings.filter((m, i) => i !== Number(e.currentTarget.dataset.index)) }; }
    handleMapping(e) {
        const index = Number(e.target.dataset.index), field = e.target.dataset.field;
        this.newAction = { ...this.newAction, mappings: this.newAction.mappings.map((m, i) => i === index ? { ...m, [field]: e.detail?.value ?? e.target.value } : m) };
    }

    async addAction() {
        if (this.workingActions.length >= 20) { this.toast('Action limit', 'A record card supports up to twenty actions. Remove an action before adding another.', 'error'); return; }
        const { name, label, type, description, mappings, flowApiName } = this.newAction;
        if (type === 'record-edit') {
            const allowed = new Set(this.editableActionFields.map(f => f.value));
            const exposed = new Set(this.exposedActionFields.map(f => f.value));
            const targets = new Set((mappings || []).map(m => m.fieldApi));
            if (!this.workingPermissions.writeEnabled || !mappings?.length || mappings.length > 20 || targets.size !== mappings.length || mappings.some(m => !allowed.has(m.fieldApi) || !['current', 'field', 'constant', 'answer'].includes(m.source) || m.source === 'field' && !exposed.has(m.sourceField) || m.source === 'constant' && m.value == null)) {
                this.toast('Check inputs', 'Enable chat edits and choose one to twenty distinct editable fields with valid input mappings.', 'error'); return;
            }
        } else if (type !== 'flow' || !this.publishedFlows.some(f => (f.apiName || f.flowApiName) === flowApiName)) {
            this.toast('Choose a process', 'Choose a guided edit or a published Salesforce launch card.', 'error'); return;
        }
        if (!label?.trim()) {
            this.toast('Missing label', 'Give the action a label.', 'error');
            return;
        }
        const actionName = (name?.trim() || label.trim()).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (!actionName || actionName.length > 80 || this.workingActions.some(a => a.name === actionName)) {
            this.toast('Duplicate', 'An action with that name already exists.', 'error');
            return;
        }
        this.workingActions = [...this.workingActions,
            this.normalizeAction({ ...this.newAction, name: actionName, label: label.trim(), type, description: description?.trim(), enabled: true }, this.workingActions.length)];
        this.newAction = { name: '', label: '', type: '', description: '', mappings: [] };
        await this.persistWorkingModel('Action added as a layout draft.');
    }

    async removeAction(e) {
        const name = e.currentTarget.dataset.name;
        this.workingActions = this.workingActions.filter(a => a.name !== name);
        await this.persistWorkingModel('Action removed as a layout draft.');
    }

    handleActionRowAction(e) {
        const action = e.detail.action;
        const row = e.detail.row;
        if (action.name === 'remove') {
            this.workingActions = this.workingActions.filter(a => a.name !== row.name);
            this.persistWorkingModel('Action removed as a layout draft.');
        }
    }

    // ---------- Assignment tab (unchanged) ----------

    assignmentColumns = [
        { label: 'Audience', fieldName: 'audience' },
        { label: 'Layout key', fieldName: 'layoutKey' },
        { label: 'Status', fieldName: 'status' }
    ];

    @track assignmentRows = [];

    buildAssignmentRows() {
        const rows = [{
            audience: 'default',
            layoutKey: this.layoutKey,
            status: this.staging.layout?.liveValue ? 'Published' : 'Not configured'
        }];
        (this.extraAudiences || []).forEach(a => {
            rows.push({
                audience: a,
                layoutKey: `layout:${this.selectedObject}:${a}`,
                status: 'Audience defined — configure its layout via the audience picker'
            });
        });
        this.assignmentRows = rows;
    }

    handleNewAudienceInput(e) {
        this.newAudience = e.target.value;
    }

    addAudience() {
        const name = (this.newAudience || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!name) {
            this.toast('Invalid name', 'Use letters, numbers, dashes.', 'error');
            return;
        }
        if (name === 'default' || (this.extraAudiences || []).includes(name)) {
            this.toast('Duplicate', 'That audience already exists.', 'error');
            return;
        }
        this.extraAudiences = [...(this.extraAudiences || []), name];
        this.newAudience = '';
        this.buildAssignmentRows();
        this.toast('Audience added', `Pick "${name}" in the audience picker to configure its layout.`, 'success');
    }

    // ---------- Permissions tab (wired to working model) ----------

    @track permissions = null;
    @track denylistText = '';

    handleWriteToggle(e) {
        this.permissions = { ...this.permissions, writeEnabled: e.target.checked };
    }

    handleDenylistEdit(e) {
        this.denylistText = e.target.value;
    }

    async stagePermissions() {
        this.workingPermissions = {
            writeEnabled: !!this.permissions?.writeEnabled,
            fieldDenylist: this.denylistText.split('\n').map(s => s.trim()).filter(Boolean)
        };
        await this.persistWorkingModel('Permissions saved as a layout draft.');
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
