const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {install,capability}=require('./studio-authoring-fixture.cjs');
const base=__dirname+'/../force-app/main/default/';
const plain=v=>JSON.parse(JSON.stringify(v));
function component(name) {
 const source=fs.readFileSync(base+'lwc/'+name+'/'+name+'.js','utf8').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s*/g,'').replace(/export default class \w+/,'globalThis.Component = class');
 const context={LightningElement:class{dispatchEvent(){}},ShowToastEvent:class{},CustomEvent:class{},setTimeout,previewResource:'/resource/preview'};install(context);vm.runInNewContext(source,context);return {b:new context.Component(),context};
}
const mappings=['LastName','Description','HasOptedOutOfEmail','Email'].map(fieldApi=>({fieldApi,source:'current'}));
function studio() {
 const {b,context}=component('cardstackObjectConfig');b.selectedObject='Contact';b.toast=(t,m)=>b.message=m;
 b.wiredFieldsResult={data:[{api:'Name',type:'STRING',updateable:false},{api:'LastName',type:'STRING',updateable:true},{api:'Description',type:'TEXTAREA',updateable:true,nillable:true},{api:'HasOptedOutOfEmail',type:'BOOLEAN',updateable:true,nillable:true},{api:'Email',type:'EMAIL',updateable:true,nillable:true,length:80},{api:'OwnerId',type:'REFERENCE',updateable:true,nillable:true}]};
 b.recordEditCapability=capability('Contact',b.wiredFieldsResult.data,'003');
 b.parseWorkingModel(JSON.stringify({permissions:{writeEnabled:true},sections:[{label:'Identity',fields:[{api:'Name'},{api:'LastName',editable:true,required:true}]},{label:'Preferences',fields:[{api:'Description',editable:true},{api:'HasOptedOutOfEmail',editable:true},{api:'Email',editable:true},{api:'OwnerId',editable:true}]}]}));return {b,context};
}
test('Contact uses shared eligibility and stages only ordered current-value mappings as a draft',async()=>{
 const {b,context}=studio();let saved;context.saveDraft=async input=>saved=input;context.getStagingInfoFresh=async()=>({draft:{Draft_Value__c:saved.value}});b.handleActionTarget({detail:{value:'record-edit'}});b.newAction.label='Edit Contact';await b.addAction();assert.deepEqual(JSON.parse(saved.value).actions[0].mappings,mappings);assert.equal(b.staging.layout.liveValue,undefined);assert.match(b.recordAuthoringNotice,/draft.*publish/i);
});
test('Contact native exclusions and duplicate-placement/policy intersections remain explicit',()=>{
 const {b}=studio();assert.deepEqual(plain(b.editableActionFields).map(f=>f.value),['LastName','Description','HasOptedOutOfEmail','Email']);assert.match(b.recordEditFieldNotices.join(' '),/OwnerId.*UNSUPPORTED_FIELD_TYPE/);assert.match(b.recordEditFieldNotices.join(' '),/Name.*FIELD_NOT_EDITABLE/);b.workingHighlights=[{api:'Description',editable:false}];b.recordEditCapability.fields.find(f=>f.fieldApi==='LastName').eligible=false;assert.deepEqual(plain(b.editableActionFields).map(f=>f.value),['HasOptedOutOfEmail','Email']);b.workingPermissions.fieldDenylist=['hasoptedoutofemail','EMAIL'];assert.deepEqual(plain(b.editableActionFields),[]);
});
test('shared shape validation rejects duplicates, stale values, constants and malformed inputs without staging',async()=>{
 for(const invalid of [[mappings[0],mappings[0]],[{...mappings[0],source:'constant',value:'Changed'}],[{...mappings[0],value:''}],[{fieldApi:'Name',source:'current'}],[{fieldApi:'OwnerId',source:'current'}],[],Array(21).fill(mappings[0]),[null],'bad']) {
 const {b,context}=studio();let writes=0;context.saveDraft=async()=>writes++;b.newAction={type:'record-edit',label:'Edit',mappings:invalid};await assert.doesNotReject(()=>b.addAction());assert.equal(writes,0);assert.ok(b.message);
 }
});
test('disabled shared action preserves shape while permitting intentional exposure and permission reduction',async()=>{
 const {b,context}=studio();b.workingActions=[{name:'edit',label:'Edit',type:'record-edit',enabled:false,mappings}];b.workingPermissions.writeEnabled=false;b.workingSections[0].fields=b.workingSections[0].fields.filter(f=>f.api!=='LastName');let saved;context.saveDraft=async input=>saved=input;context.getStagingInfoFresh=async()=>({draft:{Draft_Value__c:saved.value}});await b.stageLayout();assert.deepEqual(JSON.parse(saved.value).actions[0].mappings,mappings);b.newAction=b.workingActions[0];assert.deepEqual(plain(b.recordPreviewFields),[]);
});
test('Contact preview projects ordered sections with native required and Boolean constraints',()=>{
 const {b}=studio();b.handleActionTarget({detail:{value:'record-edit'}});assert.deepEqual(plain(b.recordPreviewLayout).sections.map(s=>s.fields),[['LastName'],['Description','HasOptedOutOfEmail','Email']]);assert.equal(b.recordPreviewFields[0].canClear,false);assert.equal(b.recordPreviewFields[2].value,'false');assert.equal(b.recordPreviewFields[2].canClear,false);assert.deepEqual(plain(b.mappedSourceOptions),[{label:'Current field value',value:'current'}]);
});
test('arbitrary Contact FirstName is descriptor-driven and rejects injected live values at preview boundary',()=>{
 const {b}=studio();b.recordEditCapability.fields.push({fieldApi:'FirstName',label:'First name',dataType:'String',nativeRequired:false,canClear:true,length:40,precision:0,scale:0,eligible:true,exclusionReason:null});b.workingSections[0].fields.push({api:'FirstName',editable:true});b.newAction={type:'record-edit',mappings:[{fieldApi:'FirstName',source:'current'},{fieldApi:'HasOptedOutOfEmail',source:'current'}]};const {b:p}=component('cardstackOpportunityPreview');let sent;p.template={querySelector:()=>({contentWindow:{postMessage:data=>sent=plain(data)}})};p.scenario='Contact';p.nativeKeyPrefix='003';p.fields=b.recordPreviewFields;p.layout=b.recordPreviewLayout;p.handleFrameLoad();assert.equal(sent.fields[0].value,'Synthetic text');p.fields=[{...b.recordPreviewFields[0],value:'Live injected'}];assert.ok(p.errorMessage);
});
test('Contact synthetic frame supports Boolean and clearing with Save disabled',()=>{
 const {b}=studio();b.handleActionTarget({detail:{value:'record-edit'}});const {b:p}=component('cardstackOpportunityPreview');const {JSDOM}=require('jsdom');const dom=new JSDOM(fs.readFileSync(base+'staticresources/CardstackOpportunityPreviewUi.resource','utf8'),{runScripts:'dangerously'}),win=dom.window,parent={};Object.defineProperty(win,'parent',{value:parent});p.template={querySelector:()=>({contentWindow:{postMessage:data=>win.dispatchEvent(new win.MessageEvent('message',{source:parent,data:plain(data)}))}})};p.scenario='Contact';p.nativeKeyPrefix='003';p.fields=b.recordPreviewFields;p.layout=b.recordPreviewLayout;p.handleFrameLoad();const email=win.document.querySelector('[data-field=Email]');assert.ok(email);assert.equal(email.type,'text');assert.equal(email.value,'synthetic@example.invalid');email.value='  exact@example.invalid  ';email.dispatchEvent(new win.Event('input',{bubbles:true}));const bool=win.document.querySelector('[data-field=HasOptedOutOfEmail]');assert.ok(bool);bool.checked=true;bool.dispatchEvent(new win.Event('input',{bubbles:true}));const clear=win.document.querySelector('[data-clear=Description]');clear.checked=true;clear.dispatchEvent(new win.Event('change',{bubbles:true}));win.document.querySelector('[data-action=review]').click();assert.equal(win.document.querySelector('[data-action=confirm]').disabled,true);assert.match(win.document.querySelector('#root').textContent,/Cleared/);assert.ok([...win.document.querySelectorAll('td')].some(cell=>cell.textContent==='  exact@example.invalid  '));assert.equal(win.document.querySelector('a'),null);win.close();
});

test('Contact Email uses native length and exact typed text with strict synthetic preview values',async()=>{
 const {b,context}=studio();b.handleActionTarget({detail:{value:'record-edit'}});const email=b.recordPreviewFields.find(field=>field.fieldApi==='Email');assert.equal(email.dataType,'EMAIL');assert.equal(email.length,80);assert.equal(email.value,'synthetic@example.invalid');assert.equal(email.canClear,true);assert.deepEqual(plain(email.choices),[]);
 const {validateChanges}=await import('../ui/opportunity-edit/fields.mjs');assert.deepEqual(validateChanges([email],{Email:{operation:'set',value:'  exact@example.invalid  '}}).changes,[{fieldApi:'Email',operation:'set',value:'  exact@example.invalid  '}]);assert.equal(validateChanges([email],{Email:{operation:'set',value:'x'.repeat(81)}}).errors.length,1);assert.throws(()=>context.recordAuthoring.checkedPreviewFields([{...email,value:'live@example.invalid'}]));
 const malformed=plain(b.recordEditCapability);malformed.fields.find(field=>field.fieldApi==='Email').length=0;assert.throws(()=>context.recordAuthoring.descriptor(malformed,'Contact'));
});
