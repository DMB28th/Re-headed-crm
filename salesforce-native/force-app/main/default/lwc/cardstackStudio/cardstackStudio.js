import { LightningElement, track } from 'lwc';

/**
 * cardstackStudio — main admin app shell.
 * Tabbed container hosting one child component per Studio section.
 * Dashboard is the default tab; child components can request tab
 * navigation via the `navigatetab` event (with optional `action`).
 */
export default class CardstackStudio extends LightningElement {
    @track activeTab = 'dashboard';

    handleTabActive(event) { this.activeTab = event.target.value; }

    handleNavigateTab(event) {
        const tab = event.detail?.tab;
        const action = event.detail?.action;
        if (tab) {
            this.activeTab = tab;
            if (tab === 'flows' && action === 'new') {
                // Let the tab render, then auto-open the wizard.
                requestAnimationFrame(() => {
                    const cfg = this.template.querySelector('c-cardstack-flow-config');
                    if (cfg && typeof cfg.openWizard === 'function') {
                        cfg.openWizard();
                    }
                });
            }
        }
    }
}
