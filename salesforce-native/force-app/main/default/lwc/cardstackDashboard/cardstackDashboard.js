import { LightningElement, track, wire } from 'lwc';
import getDashboardData from '@salesforce/apex/CardstackStudioController.getDashboardData';

/**
 * cardstackDashboard — Studio home tab.
 * Org status, config coverage, pending drafts, recent activity, quick links.
 * Embeds the setup checklist until onboarding is complete.
 */
export default class CardstackDashboard extends LightningElement {
    @track data = null;
    @track error = null;
    @track checklistDone = false;

    activityColumns = [
        { label: 'Action', fieldName: 'action' },
        { label: 'Tool', fieldName: 'tool' },
        { label: 'User', fieldName: 'user' },
        { label: 'Time', fieldName: 'timeAgo', type: 'text' }
    ];

    @wire(getDashboardData)
    wired(result) {
        if (result.data) {
            this.data = result.data;
            this.error = null;
        } else if (result.error) {
            this.error = result.error.body?.message || 'Failed to load dashboard data.';
            this.data = null;
        }
    }

    get showChecklist() {
        return !this.checklistDone;
    }

    handleChecklistChange(event) {
        this.checklistDone = event.detail.complete;
    }

    get org() {
        return this.data?.org || {};
    }

    get objectsConfigured() {
        return this.data?.objectsConfigured || 0;
    }

    get totalObjects() {
        return this.data?.totalObjects || 0;
    }

    get coverageText() {
        return `${this.objectsConfigured} of ${this.totalObjects}`;
    }

    get coveragePct() {
        if (!this.totalObjects) return 0;
        return Math.round((this.objectsConfigured / this.totalObjects) * 100);
    }

    get coverageBarStyle() {
        return `width: ${this.coveragePct}%`;
    }

    get pendingDraftCount() {
        return this.data?.pendingDraftCount || 0;
    }

    get hasPendingDrafts() {
        return this.pendingDraftCount > 0;
    }

    get pendingDrafts() {
        return (this.data?.pendingDrafts || []).slice(0, 5);
    }

    get recentActivity() {
        return (this.data?.recentActivity || []).map((r, i) => ({
            key: `act-${i}`,
            action: r.action,
            tool: r.tool,
            user: r.user,
            timeAgo: this.timeAgo(r.time)
        }));
    }

    timeAgo(iso) {
        if (!iso) return '';
        const then = new Date(iso).getTime();
        const mins = Math.floor((Date.now() - then) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    goToObjects() {
        this.dispatchEvent(new CustomEvent('navigatetab', { detail: { tab: 'objects' }, bubbles: true, composed: true }));
    }

    goToPublish() {
        this.dispatchEvent(new CustomEvent('navigatetab', { detail: { tab: 'publish' }, bubbles: true, composed: true }));
    }

    goToAudit() {
        this.dispatchEvent(new CustomEvent('navigatetab', { detail: { tab: 'audit' }, bubbles: true, composed: true }));
    }

    goToFlows() {
        this.dispatchEvent(new CustomEvent('navigatetab', { detail: { tab: 'flows' }, bubbles: true, composed: true }));
    }

    newFlow() {
        this.dispatchEvent(new CustomEvent('navigatetab', { detail: { tab: 'flows', action: 'new' }, bubbles: true, composed: true }));
    }
}
