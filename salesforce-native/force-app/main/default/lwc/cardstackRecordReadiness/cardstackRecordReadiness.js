import { LightningElement, api } from 'lwc';
const LABELS = {fields:'1. Fields',edits:'2. Allowed edits',actions:'3. Actions',save:'4. Save draft',publish:'5. Review & Publish',test:'6. Test in chat'};
export default class CardstackRecordReadiness extends LightningElement {
    @api items = [];
    @api publishedContext;
    get steps() { return (Array.isArray(this.items) ? this.items : []).map(item => ({...item,label:LABELS[item.key] || item.key})); }
    get hasSteps() { return this.steps.length > 0; }
    get hasPublishedContext() { return !!this.publishedContext?.key && !!this.publishedContext?.draftId; }
    get contextLabel() { return `${this.publishedContext?.key || ''} · Draft ${this.publishedContext?.draftId || ''}`; }
    get manualTestInstructions() { return 'Read-only manual test: open the advertised chat client as the intended Salesforce user, ask for a record you can access, and check the published fields and action destinations. Record the client, user, time and result. Salesforce sharing and field access apply. These instructions do not establish successful verification.'; }
    get governedEditInstructions() { return 'Optional governed edit test: use a disposable record and an eligible published action. Review the exact changes, cancel once, then confirm a harmless edit. Check an independent Salesforce read-back and Activity, and restore the disposable values. A preview or publication alone is not evidence of access or a successful chat save.'; }
    navigate(event) { const item = this.steps.find(step => step.key === event.currentTarget.dataset.key); if (item?.target) this.dispatchEvent(new CustomEvent('readinessnavigate',{detail:item.target,bubbles:true,composed:true})); }
}
