import { LightningElement, api, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getStudioOverview from '@salesforce/apex/CardstackStudioController.getStudioOverview';
import getDrafts from '@salesforce/apex/CardstackStudioController.getDrafts';
import { isSupportedStudioKey, studioConfigLabel } from 'c/cardstackStudioKeys';

/** Compact configuration summary. Org identity never proves a chat connection. */
export default class CardstackDashboard extends LightningElement {
    @track data = null;
    @track error = null;
    wiredResult;
    draftsResult;
    activityColumns = [
        { label: 'Action', fieldName: 'action' }, { label: 'Tool', fieldName: 'tool' },
        { label: 'User', fieldName: 'user' }, { label: 'Time', fieldName: 'timeAgo' }
    ];

    @wire(getStudioOverview)
    wired(result) {
        this.wiredResult = result;
        if (result.data) { this.data = result.data; this.error = null; }
        else if (result.error) { this.error = result.error.body?.message || 'Failed to load Overview.'; this.data = null; }
    }

    @wire(getDrafts, { status: 'Draft' })
    wiredDrafts(result) { this.draftsResult = result; }

    @api
    async refresh() {
        await Promise.all([this.wiredResult ? refreshApex(this.wiredResult) : Promise.resolve(),
            this.draftsResult ? refreshApex(this.draftsResult) : Promise.resolve()]);
    }

    get org() { return this.data?.org || {}; }
    get orgContextLabel() { return 'Salesforce org context'; }
    get pendingDraftCount() { return this.data?.activePendingDraftCount ?? 0; }
    get hasPendingDrafts() { return this.pendingDraftCount > 0; }
    get objectRows() {
        return [...(this.data?.objects || [])].sort((a, b) =>
            (b.hasDraft ? 2 : b.hasLive ? 1 : 0) - (a.hasDraft ? 2 : a.hasLive ? 1 : 0)).map(object => {
            const labels = [];
            if (object.hasLive) labels.push('Published');
            if (object.hasDraft) labels.push('Draft saved');
            if (!labels.length) labels.push('Not configured');
            if (object.metadataStatus !== 'ready') labels.push('Metadata unavailable');
            return {...object, status:labels.join(' · '), unavailable:object.metadataStatus !== 'ready'};
        });
    }
    draftLabel(key) { return studioConfigLabel(key, this.data?.objects || []); }
    get pendingDrafts() {
        return (this.draftsResult?.data || []).filter(draft => draft.Status__c === 'Draft' && isSupportedStudioKey(draft.Config__r?.Name))
            .slice(0, 5).map(draft => ({id:draft.Id, label:this.draftLabel(draft.Config__r.Name), key:draft.Config__r.Name}));
    }
    get draftSummary() {
        if (this.draftsResult?.error) return 'Draft summaries unavailable. Open Review & Publish to retry.';
        if (!this.draftsResult?.data && this.hasPendingDrafts) return 'Loading draft summaries…';
        return `Showing ${this.pendingDrafts.length} of ${this.pendingDraftCount} pending drafts.`;
    }
    get nextAction() {
        if (this.hasPendingDrafts) return {label:'Review saved drafts',description:'Review the exact saved changes before publishing.',target:{tab:'publish'}};
        if (this.data?.objects?.some(row => row.hasLive)) return {label:'Verify a chat connection',description:'Check client setup and actual connection evidence in Setup.',target:{tab:'setup',setupStage:'verify'}};
        const object = this.data?.objects?.find(row => row.metadataStatus === 'ready' && !row.hasLive && !row.hasDraft);
        if (object) return {label:`Configure ${object.label}`,description:'Create a record card draft. You can author before verifying a chat connection.',target:{tab:'objects',objectApi:object.objectApi}};
        return {label:'Verify a chat connection',description:'Check client setup and actual connection evidence in Setup.',target:{tab:'setup',setupStage:'verify'}};
    }
    get recentActivity() {
        return (this.data?.recentActivity || []).slice(0,5).map((row,index) => ({...row,key:`act-${index}`,timeAgo:this.timeAgo(row.time)}));
    }
    timeAgo(iso) {
        if (!iso) return '';
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (!Number.isFinite(mins)) return '';
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        if (mins < 1440) return `${Math.floor(mins/60)}h ago`;
        return `${Math.floor(mins/1440)}d ago`;
    }
    navigate(detail) { this.dispatchEvent(new CustomEvent('navigatetab',{detail,bubbles:true,composed:true})); }
    openObject(event) { this.navigate({tab:'objects',objectApi:event.currentTarget.dataset.object}); }
    openDraft(event) { this.navigate({tab:'publish',draftId:event.currentTarget.dataset.id}); }
    handleNextAction() { this.navigate(this.nextAction.target); }
    configureAnother() { this.navigate({tab:'objects'}); }
    goToPublish() { this.navigate({tab:'publish'}); }
    goToAudit() { this.navigate({tab:'audit'}); }
    goToSetup() { this.navigate({tab:'setup'}); }
}
