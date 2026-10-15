import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getDrafts from '@salesforce/apex/CardstackStudioController.getDrafts';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import getDraftReview from '@salesforce/apex/CardstackStudioController.getDraftReview';
import publishReviewedDraft from '@salesforce/apex/CardstackStudioController.publishReviewedDraft';
import getDraftStatus from '@salesforce/apex/CardstackStudioController.getDraftStatus';
import LightningConfirm from 'lightning/confirm';
import CardstackReviewDialog from 'c/cardstackReviewDialog';
import { publishSelection } from 'c/cardstackPublishModel';
import rollbackDraft from '@salesforce/apex/CardstackStudioController.rollbackDraft';
import { isSupportedStudioKey, studioConfigLabel } from 'c/cardstackStudioKeys';
import { compareConfig } from 'c/cardstackConfigDiff';

/**
 * cardstackPublishCenter — native snapshot review and explicit sequential publication.
 */
export default class CardstackPublishCenter extends LightningElement {
    @track statusFilter = '';
    @track selectedIds = [];
    @track operationResults = [];
    @track busy = false;
    @track persistentError = '';
    @track uncertainIds = [];
    @track focusedCandidate = null;
    focusTargetId;
    pendingChanges = [];
    @track expandedJson = new Set();
    @track diffCache = {};  // draftId -> { summary: [], liveValue }

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
            this.persistentError = result.error.body?.message || 'Failed to load drafts.';
        } else if (result.data) {
            this.loadDiffs(result.data);
        }
    }

    get drafts() {
        const { data } = this.wiredResult || {};
        if (!data) return [];
        const rows = this.focusedCandidate && !data.some(d => d.Id === this.focusedCandidate.Id)
            ? [...data, this.focusedCandidate] : data;
        return rows.map(d => ({
            ...d,
            configKey: d.Config__r?.Name || d.Config__c || '',
            createdBy: d.CreatedBy?.Name || ''
        }));
    }

    get pendingDrafts() {
        return this.drafts
            .filter(d => d.Status__c === 'Draft' && isSupportedStudioKey(d.configKey))
            .map(d => this.enrichDraft(d));
    }

    get retainedDrafts() {
        return this.drafts
            .filter(d => d.Status__c === 'Draft' && !isSupportedStudioKey(d.configKey))
            .map(d => this.enrichDraft(d));
    }

    get otherDrafts() {
        return this.drafts.filter(d => d.Status__c !== 'Draft');
    }

    get hasPendingDrafts() {
        return this.pendingDrafts.length > 0;
    }

    enrichDraft(d) {
        const cached = this.diffCache[d.Id];
        return {
            ...d,
            label: studioConfigLabel(d.configKey),
            selected: this.selectedIds.includes(d.Id),
            reviewDisabled: this.busy || this.uncertainIds.includes(d.Id),
            ageText: this.ageText(d.CreatedDate),
            prettyValue: this.pretty(d.Draft_Value__c),
            prettyLiveValue: !cached || !Object.prototype.hasOwnProperty.call(cached, 'liveValue') ? 'Published value unavailable.' : cached.liveValue === null ? 'Nothing published yet.' : this.pretty(cached.liveValue),
            showJson: this.expandedJson.has(d.Id),
            jsonToggleLabel: this.expandedJson.has(d.Id) ? 'Hide raw JSON' : 'View raw JSON',
            jsonToggleIcon: this.expandedJson.has(d.Id) ? 'utility:chevrondown' : 'utility:chevronright',
            diffSummary: cached?.summary || null,
            diffLoading: !cached
        };
    }

    ageText(iso) {
        if (!iso) return 'staged recently';
        const ts = new Date(iso);
        const mins = Math.floor((new Date() - ts) / 60000);
        if (mins < 1) return 'staged just now';
        if (mins < 60) return `staged ${mins} min ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `staged ${hours} hour${hours > 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        return `staged ${days} day${days > 1 ? 's' : ''} ago`;
    }

    async loadDiffs(drafts) {
        for (const d of drafts) {
            if (d.Status__c !== 'Draft' || this.diffCache[d.Id]) continue;
            const configKey = d.Config__r?.Name || d.Config__c;
            if (!isSupportedStudioKey(configKey)) continue;
            try {
                const info = await getStagingInfo({ key: configKey });
                const summary = this.computeDiff(configKey, info?.liveValue, d.Draft_Value__c);
                this.diffCache = { ...this.diffCache, [d.Id]: { summary, liveValue: info?.liveValue } };
            } catch {
                this.diffCache = { ...this.diffCache, [d.Id]: { summary: [{ key: 'unavailable', text: 'Comparison unavailable: could not load published configuration. Refresh to retry.', cssClass: 'diff-line', icon: 'utility:warning' }] } };
            }
        }
    }

    computeDiff(configKey, liveJson, draftJson) {
        const review = compareConfig(configKey, liveJson, draftJson);
        if (review.status !== 'changed') {
            return [{ key: review.status, text: review.message, cssClass: 'diff-line',
                icon: review.status === 'unavailable' ? 'utility:warning' : 'utility:check' }];
        }
        return review.changes.map((change, index) => ({
            key: 'change-' + index,
            text: `${change.label}: ${this.diffValue(change.before)} → ${this.diffValue(change.after)}`,
            cssClass: change.before === undefined ? 'diff-added' : change.after === undefined ? 'diff-removed' : 'diff-moved',
            icon: 'utility:edit'
        }));
    }

    diffValue(value) {
        return value === undefined ? '(absent)' : JSON.stringify(value);
    }

    toggleJson(e) {
        const id = e.currentTarget.dataset.id;
        const next = new Set(this.expandedJson);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        this.expandedJson = next;
    }

    handleStatusChange(e) { if (!this.busy) this.statusFilter = e.detail.value; }
    handleSelection(event) {
        if (this.busy) return;
        const id = event.currentTarget.dataset.id;
        if (!this.pendingDrafts.some(d => d.Id === id) || this.uncertainIds.includes(id)) return;
        this.selectedIds = event.target.checked ? [...new Set([...this.selectedIds, id])]
            : this.selectedIds.filter(value => value !== id);
    }
    get publishSelectedLabel() { return `Publish selected (${this.selectedIds.length})`; }
    get selectionDisabled() { return this.busy || !this.selectedIds.length; }
    get resultRows() {
        return this.operationResults.map(result => ({ ...result,
            text: `${result.name || result.draftId} (${result.draftId}): ${result.status}${result.errorCode ? ' — ' + result.errorCode : ''}` }));
    }

    @api async refresh() {
        this.diffCache = {};
        await refreshApex(this.wiredResult);
        if (this.wiredResult?.error) throw this.wiredResult.error;
        if (this.focusedCandidate) {
            const status = await getDraftStatus({ draftId: this.focusedCandidate.Id });
            if (status !== 'Draft') this.focusedCandidate = null;
        }
        // Unknown outcomes cannot be retried until their exact fresh status loads.
        const unresolved = [];
        const publishedKeys = [];
        const publishedContexts = [];
        for (const id of this.uncertainIds) {
            try {
                const status = await getDraftStatus({ draftId: id });
                if (status === 'Published') {
                    const result = this.operationResults.find(item => item.draftId === id);
                    if (result?.key) { publishedKeys.push(result.key); publishedContexts.push({key:result.key,draftId:id}); }
                    this.operationResults = this.operationResults.map(result => result.draftId === id
                        ? { ...result, status: 'published', errorCode: undefined } : result);
                } else if (status === 'Draft' || status === 'Rolled Back') {
                    this.operationResults = this.operationResults.map(result => result.draftId === id
                        ? { ...result, errorCode: status === 'Draft' ? 'Draft retained. Review again to retry.' : 'Draft discarded.' } : result);
                } else unresolved.push(id);
            } catch { unresolved.push(id); }
        }
        this.uncertainIds = unresolved;
        this.selectedIds = this.selectedIds.filter(id => this.pendingDrafts.some(d => d.Id === id) && !unresolved.includes(id));
        this.queueChange(publishedKeys, 'publish', publishedContexts);
        this.flushChanges();
    }

    async handleRefresh() {
        if (this.busy) return;
        this.busy = true;
        try { await this.refresh(); this.persistentError = ''; }
        catch (error) { this.persistentError = this.msg(error); }
        finally { this.busy = false; }
    }

    @api async focusDraft(draftId) {
        this.statusFilter = 'Draft';
        await this.refresh();
        if (!this.pendingDrafts.some(d => d.Id === draftId)) {
            const review = await getDraftReview({ draftId });
            if (!isSupportedStudioKey(review.key)) return;
            this.focusedCandidate = { Id: review.draftId, Name: 'Selected draft',
                Status__c: 'Draft', Config__r: { Name: review.key }, Draft_Value__c: review.draftValue };
        }
        this.focusTargetId = draftId;
        await Promise.resolve();
        this.focusReviewButton();
    }
    renderedCallback() { this.focusReviewButton(); }
    focusReviewButton() {
        if (!this.focusTargetId) return;
        const button = [...(this.template?.querySelectorAll('lightning-button[data-review]') || [])]
            .find(element => element.dataset.id === this.focusTargetId);
        if (button) { button.focus(); this.focusTargetId = null; }
    }

    async publish(event) { await this.reviewAndPublish([event.currentTarget.dataset.id]); }
    async publishSelected() { await this.reviewAndPublish([...this.selectedIds]); }

    async reviewAndPublish(ids) {
        if (this.busy) return;
        const candidates = this.pendingDrafts.filter(d => ids.includes(d.Id) && !this.uncertainIds.includes(d.Id));
        if (!candidates.length) return;
        this.busy = true;
        this.persistentError = '';
        try {
            const reviews = [];
            for (const candidate of candidates) {
                const snapshot = await getDraftReview({ draftId: candidate.Id });
                if (!isSupportedStudioKey(snapshot.key)) throw new Error('UNSUPPORTED_CONFIGURATION');
                reviews.push(snapshot);
            }
            const confirmed = await CardstackReviewDialog.open({ size: 'large',
                description: 'Review exact configuration changes before publication', reviews });
            if (confirmed !== true) return;
            const results = await publishSelection(reviews, review => this.publishOne(review));
            this.operationResults = [
                ...this.operationResults.filter(previous => !results.some(result => result.draftId === previous.draftId)),
                ...results.map(result => ({ ...result,
                    name: candidates.find(d => d.Id === result.draftId)?.Name,
                    key: reviews.find(review => review.draftId === result.draftId)?.key }))
            ];
            const successes = results.filter(result => result.status === 'published');
            this.selectedIds = this.selectedIds.filter(id => !successes.some(result => result.draftId === id));
            this.queueChange(successes.map(result => this.operationResults.find(r => r.draftId === result.draftId).key), 'publish',
                successes.map(result => ({key:reviews.find(review => review.draftId === result.draftId).key,draftId:result.draftId})));
            await this.refresh();
        } catch (error) {
            this.persistentError = this.msg(error);
        } finally { this.busy = false; }
    }

    async publishOne(review) {
        try {
            await publishReviewedDraft({ draftId: review.draftId,
                expectedLiveDigest: review.liveDigest, expectedDraftDigest: review.draftDigest });
        } catch (error) {
            // A lost response can follow a committed write. Never retry based on
            // missing bounded history, cached wire data, or a transport exception.
            let status;
            try { status = await getDraftStatus({ draftId: review.draftId }); }
            catch {
                this.uncertainIds = [...new Set([...this.uncertainIds, review.draftId])];
                throw Object.assign(new Error('Publication status unavailable. Refresh before retrying.'), { errorCode: 'PUBLISH_STATUS_UNKNOWN' });
            }
            if (status === 'Published') return;
            if (status !== 'Draft' && status !== 'Rolled Back') {
                this.uncertainIds = [...new Set([...this.uncertainIds, review.draftId])];
                throw Object.assign(new Error('Publication status unavailable.'), { errorCode: 'PUBLISH_STATUS_UNKNOWN' });
            }
            throw error;
        }
    }

    async askRollback(event) {
        if (this.busy) return;
        const id = event.currentTarget.dataset.id;
        const candidate = this.drafts.find(d => d.Id === id && d.Status__c === 'Draft');
        if (!candidate || this.uncertainIds.includes(id)) return;
        this.busy = true;
        try {
            const confirmed = await LightningConfirm.open({ label: 'Discard draft?',
                message: `Discard ${candidate.Name} (${id})? The published configuration stays as it is.`, theme: 'warning' });
            if (!confirmed) return;
            await rollbackDraft({ draftId: id });
            this.selectedIds = this.selectedIds.filter(value => value !== id);
            this.queueChange([candidate.configKey], 'discard');
            await this.refresh();
        } catch (error) { this.persistentError = this.msg(error); }
        finally { this.busy = false; }
    }

    // Confirmed operations survive failed refreshes. Coalesce affected keys by
    // operation, then deliver once after an authoritative refresh succeeds.
    queueChange(keys, operation, publishedContexts = []) {
        if (!keys.length) return;
        const queued = this.pendingChanges.find(change => change.operation === operation);
        const contexts = operation === 'publish' ? [...(queued?.publishedContexts || []), ...publishedContexts] : [];
        const exactContexts = [...new Map(contexts.map(context => [context.draftId, context])).values()];
        const change = {operation,keys:[...new Set([...(queued?.keys || []), ...keys])], ...(exactContexts.length ? {publishedContexts:exactContexts} : {})};
        this.pendingChanges = queued ? this.pendingChanges.map(previous => previous.operation === operation ? change : previous) : [...this.pendingChanges,change];
    }

    flushChanges() {
        const confirmed = this.pendingChanges;
        // Clear before dispatch: synchronous listeners may request another refresh.
        this.pendingChanges = [];
        for (const change of confirmed) this.changed(change.keys, change.operation, change.publishedContexts);
    }

    changed(keys, operation, publishedContexts) {
        this.dispatchEvent(new CustomEvent('configchange', { detail: { keys: [...new Set(keys)], operation,
            ...(publishedContexts?.length ? {publishedContexts} : {}) }, bubbles: true, composed: true }));
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
