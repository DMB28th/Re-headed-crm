import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import searchAudit from '@salesforce/apex/CardstackStudioController.searchAudit';
import listAuditTools from '@salesforce/apex/CardstackStudioController.listAuditTools';

/**
 * cardstackAuditViewer — searchable/filterable audit trail.
 * Uses @wire for data; refresh button re-runs the wired query.
 */
export default class CardstackAuditViewer extends LightningElement {
    @track searchTerm = '';
    @track toolFilter = '';
    @track limitSize = '100';

    wiredResult;

    columns = [
        { label: 'Timestamp', fieldName: 'Timestamp__c', type: 'date',
          typeAttributes: { year: 'numeric', month: 'short', day: '2-digit',
                            hour: '2-digit', minute: '2-digit' } },
        { label: 'Action', fieldName: 'Action__c' },
        { label: 'Tool', fieldName: 'Tool_Name__c' },
        { label: 'User', fieldName: 'userName' },
        { label: 'Record', fieldName: 'Record_Id__c' },
        { label: 'Details', fieldName: 'Details__c', wrapText: true }
    ];

    limitOptions = [
        { label: '50 rows', value: '50' },
        { label: '100 rows', value: '100' },
        { label: '250 rows', value: '250' }
    ];

    @wire(searchAudit, { term: '$searchTerm', tool: '$toolFilter', limitSize: '$limitInt' })
    wiredAudit(result) {
        this.wiredResult = result;
        if (result.error) {
            this.toast('Error', result.error.body?.message || 'Failed to load audit log.', 'error');
        }
    }

    @wire(listAuditTools)
    wiredTools;

    get limitInt() {
        return parseInt(this.limitSize, 10);
    }

    get rows() {
        const { data } = this.wiredResult || {};
        if (!data) return [];
        return data.map(r => ({
            ...r,
            userName: r.User__r?.Name || r.User__c || ''
        }));
    }

    get toolOptions() {
        const tools = this.wiredTools?.data || [];
        return [
            { label: 'All tools', value: '' },
            ...tools.map(t => ({ label: t, value: t }))
        ];
    }

    // Debounced search to avoid hammering the server per keystroke.
    searchTimer;
    handleSearchInput(e) {
        clearTimeout(this.searchTimer);
        const v = e.target.value;
        this.searchTimer = setTimeout(() => { this.searchTerm = v; }, 400);
    }

    handleToolChange(e) {
        this.toolFilter = e.detail.value;
    }

    handleLimitChange(e) {
        this.limitSize = e.detail.value;
    }

    refresh() {
        refreshApex(this.wiredResult);
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
