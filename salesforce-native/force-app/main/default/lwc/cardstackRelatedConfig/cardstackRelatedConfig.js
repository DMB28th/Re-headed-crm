import { LightningElement, api, track } from 'lwc';
import getRelatedListCatalog from '@salesforce/apex/CardstackStudioController.getRelatedListCatalog';

/** Native metadata guides authoring; only reviewed published policy authorizes reads. */
export default class CardstackRelatedConfig extends LightningElement {
    @api value = [];
    @api disabled = false;
    @track catalog = [];
    @track error = '';
    @track loading = false;
    relationship = '';
    selectedColumns = [];
    sortField = '';
    direction = 'asc';
    pageSize = '10';
    _objectApi;
    _generation = 0;
    _editingKey = null;
    @api get objectApi() { return this._objectApi; }
    set objectApi(value) { if (value !== this._objectApi) this.load(value); }
    async load(objectApi) {
        this._objectApi = objectApi;
        const generation = ++this._generation;
        this.catalog = []; this.error = ''; this.loading = true;
        this.relationship = ''; this.selectedColumns = []; this.sortField = ''; this._editingKey = null;
        try {
            const result = objectApi ? await getRelatedListCatalog({objectApi}) : [];
            if (generation === this._generation) this.catalog = result;
        } catch { if (generation === this._generation) this.error = 'Related metadata could not load. Existing configuration is retained.'; }
        finally { if (generation === this._generation) this.loading = false; }
    }
    get relationshipOptions() { return this.catalog.map(item => ({label:item.label,value:item.relationship})); }
    get selectedDefinition() { return this.catalog.find(item => item.relationship === this.relationship); }
    get columnOptions() { return (this.selectedDefinition?.columns || []).map(field => ({label:field.label,value:field.fieldApi})); }
    get sortOptions() { return (this.selectedDefinition?.columns || []).filter(field => field.sortable).map(field => ({label:field.label,value:field.fieldApi})); }
    get directionOptions() { return [{label:'Ascending',value:'asc'},{label:'Descending',value:'desc'}]; }
    get entries() { return Array.isArray(this.value) ? this.value.map((item,index) => ({...item,index,displayColumns:item.columns.join(', ')})) : []; }
    get addDisabled() { return this.disabled || this.loading || !this._editingKey && this.entries.length >= 6; }
    handleRelationship(event) { this.relationship=event.detail.value;this.selectedColumns=[];this.sortField=''; }
    handleColumns(event) { this.selectedColumns=event.detail.value; }
    handleSort(event) { this.sortField=event.detail.value; }
    handleDirection(event) { this.direction=event.detail.value; }
    handlePageSize(event) { this.pageSize=event.target.value; }
    emit(value) { this.dispatchEvent(new CustomEvent('relatedchange',{detail:{value}})); }
    get submitLabel() { return this._editingKey ? 'Update related list' : 'Add related list'; }
    editList(event) {
        if (this.disabled) return;
        const index=Number(event.currentTarget.dataset.index), entry=Number.isInteger(index)?this.entries[index]:null;
        if (!entry) return;
        this._editingKey=entry.key;this.relationship=entry.relationship;this.selectedColumns=[...entry.columns];
        this.sortField=entry.sort.field;this.direction=entry.sort.direction;this.pageSize=String(entry.pageSize);this.error='';
    }
    addList() {
        if (this.addDisabled) return;
        const definition=this.selectedDefinition, columns=this.selectedColumns, size=Number(this.pageSize);
        if (!definition || !Array.isArray(columns) || columns.length<1 || columns.length>8 || new Set(columns).size!==columns.length
            || columns.some(api=>!definition.columns.some(field=>field.fieldApi===api))
            || !definition.columns.some(field=>field.fieldApi===this.sortField && field.sortable)
            || !['asc','desc'].includes(this.direction) || !Number.isInteger(size) || size<1 || size>50) {
            this.error='Choose native columns, a supported sort and a page size from 1 to 50.'; return;
        }
        const existing=this.entries, keys=new Set(existing.map(item=>item.key));
        let index=1; while(keys.has('related_'+index)) index++;
        this.error='';
        const next={key:this._editingKey || 'related_'+index,relationship:this.relationship,columns:[...columns],sort:{field:this.sortField,direction:this.direction},pageSize:size};
        if (this._editingKey && !existing.some(item=>item.key===this._editingKey)) {this.error='This list changed. Choose it again before updating.';return;}
        this.emit(this._editingKey ? this.value.map(item=>item.key===this._editingKey ? next : item) : [...(Array.isArray(this.value)?this.value:[]),next]);
        this._editingKey=null;
    }
    removeList(event) { if(this.disabled)return;const index=Number(event.currentTarget.dataset.index);if(Number.isInteger(index)&&index>=0&&index<this.entries.length)this.emit(this.value.filter((_,position)=>position!==index)); }
    moveList(event) { if(this.disabled)return;const index=Number(event.currentTarget.dataset.index),delta=event.currentTarget.dataset.direction==='up'?-1:1,target=index+delta;if(!Number.isInteger(index)||index<0||index>=this.entries.length||target<0||target>=this.entries.length)return;const value=[...this.value];[value[index],value[target]]=[value[target],value[index]];this.emit(value); }
}
