import { LightningElement, api } from 'lwc';
export default class CardstackLayoutField extends LightningElement {
    @api field;
    @api sectionKey;
    @api columnCount = 2;
    @api moveOptions = [];
    get columnOptions() {
        const options = [{ label: 'Full width', value: 'full' }];
        if (Number(this.columnCount) > 1) options.push({ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' });
        if (Number(this.columnCount) === 3) options.splice(2, 0, { label: 'Middle', value: 'center' });
        return options;
    }
    get hasMoveOptions() { return this.moveOptions.length > 0; }
    get invalid() { return !this.field.valid; }
    emit(action, value) { this.dispatchEvent(new CustomEvent('fieldedit', { detail: { key: this.field.key, section: this.sectionKey, action, value } })); }
    stopDrag(e) { e.stopPropagation(); e.preventDefault(); }
    menuSelect(e) { this.emit(e.detail.value); }
    changeLabel(e) { this.emit('label', e.target.value); }
    changeColumn(e) { this.emit('column', e.detail.value); }
    changeSection(e) { this.emit('section', e.detail.value); }
    changeEditable(e) { this.emit('editable', e.target.checked); }
}
