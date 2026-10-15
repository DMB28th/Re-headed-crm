import { LightningElement, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getStudioOverview from '@salesforce/apex/CardstackStudioController.getStudioOverview';
import { NAV_ITEMS } from 'c/cardstackStudioModel';

/** Native admin destinations; child navigation targets remain explicit. */
export default class CardstackStudio extends LightningElement {
    @track activeTab = 'overview';
    @track navigationError = '';
    @track publishedContexts = [];
    overviewResult;
    navItems = NAV_ITEMS;

    @wire(getStudioOverview)
    wiredOverview(result) { this.overviewResult = result; }

    get publishLabel() {
        const count = this.overviewResult?.data?.activePendingDraftCount;
        return count == null ? 'Review & Publish' : `Review & Publish (${count})`;
    }

    _navigationGeneration = 0;
    handleTabActive(event) {
        const tab = event.target.value;
        if (tab === this.activeTab) return;
        const tabset = this.template.querySelector('lightning-tabset');
        if (tabset) tabset.activeTabValue = this.activeTab;
        return this.handleNavigateTab({detail:{tab}});
    }

    currentEditor() {
        const selector = this.activeTab === 'objects' ? 'c-cardstack-object-config' : this.activeTab === 'flows' ? 'c-cardstack-flow-config' : null;
        return selector ? this.template.querySelector(selector) : null;
    }

    async handleNavigateTab(event) {
        const { tab, objectApi, draftId, action, setupStage } = event.detail || {};
        if (!NAV_ITEMS.some(item => item.value === tab)) return;
        const generation = ++this._navigationGeneration;
        const editor = tab !== this.activeTab ? this.currentEditor() : null;
        if (editor?.requestLeave) {
            try { if (!await editor.requestLeave() || generation !== this._navigationGeneration) return; }
            catch (error) { this.navigationError = error?.message || 'Could not check unfinished work. Stay in the editor and try again.'; return; }
        }
        this.activeTab = tab;
        const tabset = this.template.querySelector('lightning-tabset');
        if (tabset) tabset.activeTabValue = tab;
        this.navigationError = '';
        const target = tab === 'objects' && objectApi ? ['c-cardstack-object-config', 'openObject', objectApi]
            : tab === 'publish' && draftId ? ['c-cardstack-publish-center', 'focusDraft', draftId]
            : tab === 'setup' && setupStage ? ['c-cardstack-connection-setup', 'openStage', setupStage]
            : tab === 'flows' && action === 'new' ? ['c-cardstack-flow-config', 'openWizard'] : null;
        if (!target) {
            const retained = tab === 'objects' ? this.template.querySelector('c-cardstack-object-config') : tab === 'flows' ? this.template.querySelector('c-cardstack-flow-config') : null;
            await retained?.refreshPending?.();
            if (generation !== this._navigationGeneration || this.activeTab !== tab) return;
            if (tab === 'objects' && action) this.template.querySelector('c-cardstack-object-config')?.openSubview?.(action);
            return;
        }
        // A frame follows LWC's queued rendering of the newly active lazy tab.
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (this.activeTab !== tab || generation !== this._navigationGeneration) return;
        try {
            const child = this.template.querySelector(target[0]);
            if (!child || typeof child[target[1]] !== 'function') throw new Error('The requested editor is unavailable. Open the tab and try again.');
            await child[target[1]](target[2]);
            if (tab === 'objects' && action) child.openSubview?.(action);
        } catch (error) {
            if (generation !== this._navigationGeneration || this.activeTab !== tab) return;
            this.navigationError = error?.body?.message || error?.message || 'Could not open the requested item.';
        }
    }

    async handleConfigChange(event) {
        this.navigationError = '';
        if (event?.detail?.operation === 'publish' && Array.isArray(event.detail.publishedContexts)) {
            this.publishedContexts = event.detail.publishedContexts.filter(context => typeof context?.key === 'string' && typeof context?.draftId === 'string').map(context => ({key:context.key,draftId:context.draftId}));
        }
        try {
            await Promise.all([
                this.overviewResult ? refreshApex(this.overviewResult) : Promise.resolve(),
                this.template.querySelector('c-cardstack-dashboard')?.refresh(),
                this.template.querySelector('c-cardstack-publish-center')?.refresh(),
                ...(['publish', 'discard'].includes(event?.detail?.operation) && Array.isArray(event.detail.keys) ? [
                    this.template.querySelector('c-cardstack-object-config')?.refresh?.(event.detail.keys),
                    this.template.querySelector('c-cardstack-flow-config')?.refresh?.(event.detail.keys)
                ] : [])
            ]);
        } catch {
            this.navigationError = 'The change was recorded, but Studio summaries could not refresh. Reload before reviewing pending changes.';
        }
    }
}
