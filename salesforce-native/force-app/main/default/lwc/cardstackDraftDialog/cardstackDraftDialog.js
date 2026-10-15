import { api } from 'lwc';
import LightningModal from 'lightning/modal';
export default class CardstackDraftDialog extends LightningModal {
    @api description;
    save() { this.close('save'); }
    discard() { this.close('discard'); }
    stay() { this.close('stay'); }
}
