import { LightningElement, track } from 'lwc';

/**
 * cardstackStudio — main admin app shell.
 * Tabbed container hosting one child component per Studio section.
 */
export default class CardstackStudio extends LightningElement {
    @track activeTab = 'objects';
}
