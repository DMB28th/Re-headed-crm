import { LightningElement, track, wire } from 'lwc';
import getConnectionInfo from '@salesforce/apex/CardstackStudioController.getConnectionInfo';

/**
 * cardstackConnections — native connection status.
 * The org IS the CRM: show org identity, signed-in user, and hosted
 * MCP server definitions with activation state.
 */
export default class CardstackConnections extends LightningElement {
    @track info = null;
    @track error = null;

    serverColumns = [
        { label: 'Server', fieldName: 'name' },
        { label: 'Developer Name', fieldName: 'developerName' },
        { label: 'Description', fieldName: 'description', wrapText: true },
        { label: 'Active', fieldName: 'active', type: 'boolean' }
    ];

    @wire(getConnectionInfo)
    wired(result) {
        if (result.data) {
            this.info = result.data;
            this.error = null;
        } else if (result.error) {
            this.error = result.error.body?.message || 'Failed to load connection info.';
            this.info = null;
        }
    }

    get servers() {
        return this.info?.mcpServers || [];
    }

    get orgType() {
        if (!this.info) return '';
        return this.info.isSandbox ? 'Sandbox' : 'Production / Dev Edition';
    }
}
