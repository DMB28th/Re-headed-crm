import { LightningElement, track, wire } from 'lwc';
import getChecklistState from '@salesforce/apex/CardstackStudioController.getChecklistState';
import setSetupFlag from '@salesforce/apex/CardstackStudioController.setSetupFlag';
import { refreshApex } from '@salesforce/apex';

/**
 * cardstackSetupChecklist — first-run onboarding checklist.
 * Shown at the top of the dashboard until all items are complete,
 * then dismissible. Manual items persist via setup:* config flags.
 */
export default class CardstackSetupChecklist extends LightningElement {
    @track items = [];
    @track collapsed = false;
    @track error = null;
    wiredResult;

    @wire(getChecklistState)
    wired(result) {
        this.wiredResult = result;
        if (result.data) {
            this.items = (result.data.items || []).map(i => ({
                ...i,
                showManualButton: i.manual && !i.done
            }));
            this.error = null;
            // If previously dismissed, tell the parent to hide us immediately
            if (result.data.dismissed) {
                this.notifyParent(true);
                return;
            }
            this.notifyParent();
        } else if (result.error) {
            this.error = result.error.body?.message || 'Failed to load checklist.';
        }
    }

    get totalCount() {
        return this.items.length;
    }

    get doneCount() {
        return this.items.filter(i => i.done).length;
    }

    get allDone() {
        return this.totalCount > 0 && this.doneCount === this.totalCount;
    }

    get progressPct() {
        if (!this.totalCount) return 0;
        return Math.round((this.doneCount / this.totalCount) * 100);
    }

    get progressStyle() {
        return `width: ${this.progressPct}%`;
    }

    get collapseIcon() {
        return this.collapsed ? 'utility:chevrondown' : 'utility:chevronup';
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
    }

    goToTab(event) {
        const tab = event.target.dataset.tab;
        this.dispatchEvent(new CustomEvent('navigatetab', {
            detail: { tab }, bubbles: true, composed: true
        }));
    }

    async markDone(event) {
        const id = event.target.dataset.id;
        const flagKey = id === 'claude' ? 'setup:claudeConnected'
            : id === 'mcp' ? 'setup:mcpServerConfirmed' : null;
        if (!flagKey) return;
        try {
            await setSetupFlag({ key: flagKey, value: true });
            await refreshApex(this.wiredResult);
        } catch (e) {
            this.error = e.body?.message || 'Failed to save.';
        }
    }

    async dismiss() {
        try {
            await setSetupFlag({ key: 'setup:checklistDismissed', value: true });
            this.notifyParent(true);
        } catch (e) {
            this.error = e.body?.message || 'Failed to dismiss.';
        }
    }

    notifyParent(forceDone = false) {
        this.dispatchEvent(new CustomEvent('checklistchange', {
            detail: { complete: forceDone || this.allDone }
        }));
    }
}
