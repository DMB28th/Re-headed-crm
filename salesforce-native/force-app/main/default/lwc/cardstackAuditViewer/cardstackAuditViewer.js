import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import searchAudit from '@salesforce/apex/CardstackStudioController.searchAudit';
import listAuditTools from '@salesforce/apex/CardstackStudioController.listAuditTools';
import listAuditUsers from '@salesforce/apex/CardstackStudioController.listAuditUsers';

/**
 * cardstackAuditViewer — searchable/filterable audit trail with
 * date + user filters, expandable rows, before/after diffs for writes,
 * relative timestamps, and CSV export.
 */
export default class CardstackAuditViewer extends LightningElement {
    @track searchTerm = '';
    @track toolFilter = '';
    @track userFilter = '';
    @track fromDate = '';
    @track toDate = '';
    @track limitSize = '100';
    @track expandedIds = new Set();

    wiredResult;

    @wire(searchAudit, {
        term: '$searchTerm',
        tool: '$toolFilter',
        limitSize: '$limitInt',
        fromDateStr: '$fromDate',
        toDateStr: '$toDate',
        userId: '$userFilter'
    })
    wiredAudit(result) {
        this.wiredResult = result;
        if (result.error) {
            this.toast('Error', result.error.body?.message || 'Failed to load audit log.', 'error');
        }
    }

    @wire(listAuditTools)
    wiredTools;

    @wire(listAuditUsers)
    wiredUsers;

    get limitInt() {
        return parseInt(this.limitSize, 10);
    }

    limitOptions = [
        { label: '50 rows', value: '50' },
        { label: '100 rows', value: '100' },
        { label: '250 rows', value: '250' }
    ];

    get rows() {
        const { data } = this.wiredResult || {};
        if (!data) return [];
        return data.map(r => this.enrichRow(r));
    }

    enrichRow(r) {
        const detail = this.parseDetail(r.Details__c);
        const ts = r.Timestamp__c ? new Date(r.Timestamp__c) : null;
        return {
            ...r,
            userName: r.User__r?.Name || r.User__c || '',
            expanded: this.expandedIds.has(r.Id),
            expandIcon: this.expandedIds.has(r.Id) ? 'utility:chevrondown' : 'utility:chevronright',
            relativeTime: ts ? this.relativeTime(ts) : '',
            fullTime: ts ? ts.toLocaleString() : '',
            actionBadgeClass: this.actionBadge(r.Action__c),
            hasStructuredDetail: !!detail,
            hasDiff: !!(detail && detail.before && detail.after),
            hasCreatedFields: !!(detail && detail.fields && !detail.before),
            diffRows: this.buildDiffRows(detail),
            createdRows: this.buildCreatedRows(detail),
            confirmedBy: detail?.confirmedBy || null
        };
    }

    parseDetail(raw) {
        if (!raw) return null;
        const trimmed = raw.trim();
        if (!trimmed.startsWith('{')) return null;
        try {
            const d = JSON.parse(trimmed);
            return (d && typeof d === 'object') ? d : null;
        } catch {
            return null;
        }
    }

    buildDiffRows(detail) {
        if (!detail || !detail.before || !detail.after) return [];
        const fields = new Set([
            ...Object.keys(detail.before || {}),
            ...Object.keys(detail.after || {})
        ]);
        return [...fields].map(f => ({
            field: f,
            before: this.fmt(detail.before[f]),
            after: this.fmt(detail.after[f])
        }));
    }

    buildCreatedRows(detail) {
        if (!detail || !detail.fields) return [];
        return Object.keys(detail.fields).map(f => ({
            field: f,
            value: this.fmt(detail.fields[f])
        }));
    }

    fmt(v) {
        if (v === null || v === undefined) return '—';
        return String(v);
    }

    actionBadge(action) {
        const a = (action || '').toUpperCase();
        if (a.includes('UPDATE') || a.includes('CREATE') || a.includes('COMPLETE')) {
            return 'slds-badge slds-theme_warning';
        }
        if (a.includes('PUBLISH')) {
            return 'slds-badge slds-theme_success';
        }
        if (a.includes('ROLLBACK')) {
            return 'slds-badge slds-theme_error';
        }
        return 'slds-badge slds-theme_info';
    }

    relativeTime(ts) {
        const now = new Date();
        const diffMs = now - ts;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} min ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
        return ts.toLocaleDateString();
    }

    get toolOptions() {
        const tools = this.wiredTools?.data || [];
        return [
            { label: 'All tools', value: '' },
            ...tools.map(t => ({ label: t, value: t }))
        ];
    }

    get userOptions() {
        const users = this.wiredUsers?.data || [];
        return [
            { label: 'All users', value: '' },
            ...users.map(u => ({ label: u.name, value: u.id }))
        ];
    }

    get exportDisabled() {
        return this.rows.length === 0;
    }

    toggleRow(e) {
        const id = e.currentTarget.dataset.id;
        const next = new Set(this.expandedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        this.expandedIds = next;
    }

    // Debounced search to avoid hammering the server per keystroke.
    searchTimer;
    handleSearchInput(e) {
        clearTimeout(this.searchTimer);
        const v = e.target.value;
        this.searchTimer = setTimeout(() => { this.searchTerm = v; }, 400);
    }

    handleToolChange(e) { this.toolFilter = e.detail.value; }
    handleUserChange(e) { this.userFilter = e.detail.value; }
    handleFromDate(e) { this.fromDate = e.detail.value; }
    handleToDate(e) { this.toDate = e.detail.value; }
    handleLimitChange(e) { this.limitSize = e.detail.value; }

    refresh() {
        refreshApex(this.wiredResult);
    }

    exportCsv() {
        const rows = this.rows;
        if (!rows.length) return;
        const header = ['Timestamp', 'Action', 'Tool', 'User', 'Record Id', 'Details'];
        const lines = [header.join(',')];
        for (const r of rows) {
            const cells = [
                r.fullTime,
                r.Action__c,
                r.Tool_Name__c,
                r.userName,
                r.Record_Id__c,
                (r.Details__c || '').replace(/"/g, '""')
            ].map(c => `"${c || ''}"`);
            lines.push(cells.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cardstack-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('Exported', `${rows.length} rows downloaded as CSV.`, 'success');
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
