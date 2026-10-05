import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getDrafts from '@salesforce/apex/CardstackStudioController.getDrafts';
import getStagingInfo from '@salesforce/apex/CardstackStudioController.getStagingInfo';
import publishDraft from '@salesforce/apex/CardstackStudioController.publishDraft';
import rollbackDraft from '@salesforce/apex/CardstackStudioController.rollbackDraft';

/**
 * cardstackPublishCenter — draft/publish/rollback management with
 * visual diffs, collapsible JSON, bulk publish, and draft age.
 */
export default class CardstackPublishCenter extends LightningElement {
    @track statusFilter = '';
    @track confirmRollbackId = null;
    @track confirmPublishAll = false;
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
            this.toast('Error', result.error.body?.message || 'Failed to load drafts.', 'error');
        } else if (result.data) {
            this.loadDiffs(result.data);
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
            ageText: this.ageText(d.CreatedDate),
            prettyValue: this.pretty(d.Draft_Value__c),
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
            if (!configKey) continue;
            try {
                const info = await getStagingInfo({ key: configKey });
                const summary = this.computeDiff(configKey, info?.liveValue, d.Draft_Value__c);
                this.diffCache = { ...this.diffCache, [d.Id]: { summary } };
            } catch (e) {
                // Diff is best-effort; leave it empty.
                this.diffCache = { ...this.diffCache, [d.Id]: { summary: [] } };
            }
        }
    }

    computeDiff(configKey, liveJson, draftJson) {
        const lines = [];
        let live, draft;
        try {
            live = liveJson ? JSON.parse(liveJson) : null;
            draft = draftJson ? JSON.parse(draftJson) : null;
        } catch {
            return [{ key: 'parse', text: 'Could not parse JSON for comparison.', cssClass: 'diff-line', icon: 'utility:warning' }];
        }
        if (!live && draft) {
            return [{ key: 'new', text: 'New config — nothing is live yet.', cssClass: 'diff-added', icon: 'utility:add' }];
        }
        if (!draft) return [];

        // Layout diff: compare fields[] arrays.
        if (configKey.startsWith('layout:')) {
            return this.diffLayouts(live, draft);
        }
        // Generic key-level diff.
        return this.diffObjects(live, draft, '');
    }

    diffLayouts(live, draft) {
        const lines = [];
        const liveFields = this.fieldList(live);
        const draftFields = this.fieldList(draft);
        const liveSet = new Set(liveFields);
        const draftSet = new Set(draftFields);

        const added = draftFields.filter(f => !liveSet.has(f));
        const removed = liveFields.filter(f => !draftSet.has(f));
        const moved = [];
        for (const f of draftFields) {
            if (liveSet.has(f)) {
                const oldPos = liveFields.indexOf(f) + 1;
                const newPos = draftFields.indexOf(f) + 1;
                if (oldPos !== newPos) {
                    moved.push({ field: f, from: oldPos, to: newPos });
                }
            }
        }

        if (added.length) {
            lines.push({
                key: 'added',
                text: `Added ${added.length} field${added.length > 1 ? 's' : ''}: ${added.join(', ')}`,
                cssClass: 'diff-added', icon: 'utility:add'
            });
        }
        if (removed.length) {
            lines.push({
                key: 'removed',
                text: `Removed ${removed.length} field${removed.length > 1 ? 's' : ''}: ${removed.join(', ')}`,
                cssClass: 'diff-removed', icon: 'utility:delete'
            });
        }
        for (const m of moved.slice(0, 5)) {
            lines.push({
                key: 'moved-' + m.field,
                text: `Moved ${m.field} from position ${m.from} to ${m.to}`,
                cssClass: 'diff-moved', icon: 'utility:move'
            });
        }
        if (moved.length > 5) {
            lines.push({
                key: 'moved-more',
                text: `…and ${moved.length - 5} more moved fields`,
                cssClass: 'diff-moved', icon: 'utility:move'
            });
        }
        if (!lines.length) {
            lines.push({
                key: 'none',
                text: 'No field changes — only ordering or metadata differs.',
                cssClass: 'diff-line', icon: 'utility:check'
            });
        }
        return lines;
    }

    fieldList(layout) {
        if (!layout) return [];
        // Support both {fields: [...]} and {recordCard: {sections: [...]}} shapes.
        if (Array.isArray(layout.fields)) {
            return layout.fields.map(f => typeof f === 'string' ? f : (f.api || f.fieldApi || f.name));
        }
        if (layout.recordCard?.sections) {
            const out = [];
            for (const s of layout.recordCard.sections) {
                for (const f of (s.fields || [])) {
                    out.push(typeof f === 'string' ? f : (f.api || f.fieldApi || f.name));
                }
            }
            return out;
        }
        return [];
    }

    diffObjects(live, draft, prefix) {
        const lines = [];
        const liveKeys = new Set(Object.keys(live || {}));
        const draftKeys = new Set(Object.keys(draft || {}));
        for (const k of draftKeys) {
            const path = prefix ? `${prefix}.${k}` : k;
            if (!liveKeys.has(k)) {
                lines.push({ key: 'add-' + path, text: `Added: ${path}`, cssClass: 'diff-added', icon: 'utility:add' });
            } else if (JSON.stringify(live[k]) !== JSON.stringify(draft[k])) {
                if (this.isPlainObject(live[k]) && this.isPlainObject(draft[k])) {
                    lines.push(...this.diffObjects(live[k], draft[k], path));
                } else {
                    lines.push({ key: 'chg-' + path, text: `Changed: ${path}`, cssClass: 'diff-moved', icon: 'utility:edit' });
                }
            }
        }
        for (const k of liveKeys) {
            if (!draftKeys.has(k)) {
                const path = prefix ? `${prefix}.${k}` : k;
                lines.push({ key: 'del-' + path, text: `Removed: ${path}`, cssClass: 'diff-removed', icon: 'utility:delete' });
            }
        }
        return lines.slice(0, 20);
    }

    isPlainObject(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    toggleJson(e) {
        const id = e.currentTarget.dataset.id;
        const next = new Set(this.expandedJson);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        this.expandedJson = next;
    }

    handleStatusChange(e) { this.statusFilter = e.detail.value; }
    refresh() {
        this.diffCache = {};
        refreshApex(this.wiredResult);
    }

    async publish(e) {
        const id = e.currentTarget.dataset.id;
        try {
            await publishDraft({ draftId: id });
            this.toast('Published', 'Draft is now live.', 'success');
            this.diffCache = {};
            refreshApex(this.wiredResult);
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
    }

    askRollback(e) { this.confirmRollbackId = e.currentTarget.dataset.id; }
    cancelRollback() { this.confirmRollbackId = null; }

    async rollback() {
        try {
            await rollbackDraft({ draftId: this.confirmRollbackId });
            this.toast('Rolled back', 'Draft discarded.', 'success');
        } catch (err) {
            this.toast('Error', this.msg(err), 'error');
        }
        this.confirmRollbackId = null;
        this.diffCache = {};
        refreshApex(this.wiredResult);
    }

    askPublishAll() { this.confirmPublishAll = true; }
    cancelPublishAll() { this.confirmPublishAll = false; }

    async publishAll() {
        this.confirmPublishAll = false;
        const ids = this.pendingDrafts.map(d => d.Id);
        let ok = 0, failed = 0;
        for (const id of ids) {
            try {
                await publishDraft({ draftId: id });
                ok++;
            } catch (e) {
                failed++;
            }
        }
        this.diffCache = {};
        refreshApex(this.wiredResult);
        if (failed === 0) {
            this.toast('Published', `${ok} draft${ok === 1 ? '' : 's'} are now live.`, 'success');
        } else {
            this.toast('Partially published', `${ok} published, ${failed} failed.`, 'warning');
        }
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
