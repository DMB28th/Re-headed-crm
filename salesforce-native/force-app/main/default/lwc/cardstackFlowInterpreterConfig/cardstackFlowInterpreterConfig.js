import { LightningElement, wire, track } from 'lwc';
import getActiveFlows from '@salesforce/apex/CardstackStudioController.getActiveFlows';
import prepareInterpretedFlowDraft from '@salesforce/apex/CardstackStudioController.prepareInterpretedFlowDraft';
import getStagingInfoFresh from '@salesforce/apex/CardstackStudioController.getStagingInfoFresh';

/** Exact native acquisition stays server-owned; compatibility never implies publication. */
export default class CardstackFlowInterpreterConfig extends LightningElement {
    @track flows=[];
    @track selectedId='';
    @track busy=false;
    @track unknown=false;
    @track error='';
    @track prepared=null;
    @track report=null;
    @track loading=true;
    _generation=0;
    @wire(getActiveFlows)
    activeFlows({data,error}) {
        this.loading=false;
        if(data)this.flows=data.filter(item=>item.processType==='Flow' && item.definitionId18 && item.activeVersionId18);
        if(error){this.flows=[];this.error='Active Flow metadata is unavailable.';}
    }
    get options(){return this.flows.map(item=>({label:item.label||item.apiName,value:item.definitionId18}));}
    get selectedFlow(){return this.flows.find(item=>item.definitionId18===this.selectedId);}
    get disabled(){return this.busy||this.unknown||this.loading&&!this.flows.length||!this.selectedFlow;}
    get verdict(){return this.report?.verdict||'';}
    get issues(){return (this.report?.issues||[]).map((item,index)=>({key:String(index),code:item.code,path:item.path,reason:item.reason||'This metadata behavior is outside the supported interpreter.'}));}
    get hasPrepared(){return !!this.prepared?.draftId;}
    handleSelection(event){if(this.busy||this.unknown)return;this.selectedId=event.detail.value;this.prepared=null;this.report=null;this.error='';this._generation++;}
    async prepare(){
        if(this.disabled)return;
        const generation=++this._generation,selectedId=this.selectedId;
        this.busy=true;this.error='';this.prepared=null;this.report=null;
        try{
            const response=await prepareInterpretedFlowDraft({definitionId18:selectedId});
            if(generation!==this._generation||selectedId!==this.selectedId)return;
            this.report=response.report;
            if(response.report?.verdict==='SUPPORTED'&&response.draftId){this.prepared=response;this.dispatchEvent(new CustomEvent('configchange',{detail:{keys:[response.key],operation:'save'},bubbles:true,composed:true}));}
            else if(!response.report)this.error='Preparation returned no compatibility result. No plan is advertised.';
        }catch{if(generation===this._generation){this.unknown=true;this.error='Preparation outcome is unknown. Check the saved candidate before retrying.';}}
        finally{if(generation===this._generation)this.busy=false;}
    }
    async checkSaved(){
        if(this.busy||!this.selectedFlow)return;
        this.busy=true;const key='flow-plan:'+this.selectedFlow.apiName+':default';
        try{
            const staging=await getStagingInfoFresh({key});
            if(staging.draft){const candidate=JSON.parse(staging.draft.Draft_Value__c);this.prepared={key,draftId:staging.draft.Id,planHash:candidate.planHash};this.report=null;this.error='Current saved candidate found. Review it before publishing; this does not prove it came from the interrupted attempt.';}
            else{this.prepared=null;this.error='No saved candidate is present. You can prepare again.';}
            this.unknown=false;
        }catch{this.error='Saved state could not be checked. Preparation remains blocked.';}
        finally{this.busy=false;}
    }
    openPublish(){if(this.hasPrepared)this.dispatchEvent(new CustomEvent('navigatetab',{detail:{tab:'publish',draftId:this.prepared.draftId},bubbles:true,composed:true}));}
}
