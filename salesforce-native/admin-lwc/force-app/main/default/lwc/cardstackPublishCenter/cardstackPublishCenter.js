import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getDrafts from '@salesforce/apex/CardstackStudioController.getDrafts';
import publishDraft from '@salesforce/apex/CardstackStudioController.publishDraft';
import rollbackDraft from '@salesforce/apex/CardstackStudioController.rollbackDraft';

/**
 * cardstackPublishCenter — draft/publish/rollback management.
 * Lists drafts with status filter; publish applies immediately,
 * rollback discards with confirmation.
 */
export default class CardstackPublishCenter extends LightningElement {
    @track statusFilter = '';
    @track confirmRollbackId = null;

    wiredResult;

    statusOptions = [
        { label: 'All', value: '' },
        { label: 'Draft', value: 'Draft' },
        { label: 'Published', value: 'Published' },
        { label: 'Rolled Back', value: 'Rolled Back' }
    ];

    columns = [
        { label: 'Draft', fieldName: 'Name' },
        { label: 'Config Key', fieldName: 'configKey' },
        { label: 'Status', fieldName: 'Status__c' },
        { label: 'Created', fieldName: 'CreatedDate', type: 'date',
          typeAttributes: { year: 'numeric', month: 'short', day: '2-digit',
                            hour: '2-digit', minute: '2-digit' } },
        { label: 'By', fieldName: 'createdBy' }
    ];

    @wire(getDrafts, { status: '$statusFilter' })
    wiredDrafts(result) {
        this.wiredResult = result;
        if (result.error) {
            this.toast('Error', result.error.body?.message || 'Failed to load drafts.', 'error');
        }
    }

    get drafts() {
        const { data } = this.wiredResult || {};
        if (!data) return [];
        return data.map(d => ({
            ...d,
            configKey: d.Config__r?.Name || d.Config__c || '',
            createdBy: d.CreatedBy?.Name || ''
        }));
    }

    get pendingDrafts() {
        return this.drafts
            .filter(d => d.Status__c === 'Draft')
            .map(d => ({
                ...d,
                created: new Date(d.CreatedDate).toLocaleString(),
                prettyValue: this.pretty(d.Draft_Value__c)
            }));
    }

    handleStatusChange(e) {
        this.statusFilter = e.detail.value;
    }

    refresh() {
        refreshApex(this.wiredResult);
    }

    async publish(e) {
        const id = e.currentTarget.dataset.id;
        try {
            await publishDraft({ draftId: id });
            this.toast('Published', 'Draft is now live.', 'success');
            refreshApex(this.wiredResult);
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
    }

    askRollback(e) {
        this.confirmRollbackId = e.currentTarget.dataset.id;
    }

    cancelRollback() {
        this.confirmRollbackId = null;
    }

    async rollback() {
        try {
            await rollbackDraft({ draftId: this.confirmRollbackId });
            this.toast('Rolled back', 'Draft discarded.', 'success');
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
        this.confirmRollbackId = null;
        refreshApex(this.wiredResult);
    }

    pretty(json) {
        try { return JSON.stringify(JSON.parse(json), null, 2); }
        catch { return json || ''; }
    }

    msg(e) { return e?.body?.message || e?.message || 'Unknown error'; }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
