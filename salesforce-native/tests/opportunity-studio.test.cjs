const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = __dirname + '/../force-app/main/default/';
function component(name, extra = {}) {
  const source = fs.readFileSync(base + `lwc/${name}/${name}.js`, 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^\s*@wire\(.*\)\s*$/gm, '')
    .replace(/@(track|api)\s+/g, '').replace(/export default class \w+/, 'globalThis.Component = class');
  const context = { LightningElement: class { dispatchEvent() {} }, ShowToastEvent: class {}, CustomEvent:class {}, setTimeout, ...extra };
  require('./studio-authoring-fixture.cjs').install(context);vm.runInNewContext(source, context);
  return { instance: new context.Component(), context };
}
function studio() {
  const { instance: b, context } = component('cardstackObjectConfig');
  b.selectedObject = 'Opportunity'; b.toast = () => {};
  b.wiredFieldsResult = { data: [
    { api:'StageName', label:'Stage', type:'PICKLIST', updateable:'true' },
    { api:'CloseDate', label:'Close date', type:'DATE', updateable:'true' },
    { api:'Amount', label:'Amount', type:'CURRENCY', updateable:'true' }
  ] };
  b.recordEditCapability=require('./studio-authoring-fixture.cjs').capability('Opportunity',b.wiredFieldsResult.data,'006');
  b.parseWorkingModel(JSON.stringify({permissions:{writeEnabled:true}, fields:[
    {api:'StageName',editable:true},{api:'CloseDate',editable:true},{api:'Amount',editable:true}
  ]}));
  b.loadStaging = async () => {};
  return {b,context};
}
const plain = value => JSON.parse(JSON.stringify(value));
const expectedMappings = [
  {fieldApi:'StageName',source:'current'}, {fieldApi:'CloseDate',source:'current'}, {fieldApi:'Amount',source:'current'}
];
test('Opportunity preset persists the exact ordered current mappings and disabled label through reload', async () => {
  const {b,context}=studio(); let saved;
  assert.ok(b.actionTargetOptions.some(o=>o.value==='record-edit'));
  b.handleActionTarget({detail:{value:'opportunity-stage'}});
  b.newAction={...b.newAction,label:'Update forecast',enabled:false};
  context.saveDraft=async p=>{saved=p;}; await b.addAction();
  assert.ok(saved); b.parseWorkingModel(saved.value);
  const action=JSON.parse(b.buildLayoutJson()).actions[0];
  assert.equal(action.label,'Update forecast'); assert.equal(action.enabled,false);
  assert.deepEqual(action.mappings,expectedMappings); assert.equal(action.type,'record-edit');
});
test('missing exposure, readOnly, denylist and native read-only each block preset authoring without widening fields', async () => {
  for (const risk of ['missing','readonly','denylist','native']) {
    const {b,context}=studio(); let calls=0; context.saveDraft=async()=>{calls++;};
    if(risk==='missing')b.workingSections[0].fields=b.workingSections[0].fields.filter(f=>f.api!=='Amount');
    if(risk==='readonly')b.workingSections[0].fields.find(f=>f.api==='Amount').readOnly=true;
    if(risk==='denylist')b.workingPermissions.fieldDenylist=['Amount'];
    if(risk==='native')b.wiredFieldsResult.data.find(f=>f.api==='Amount').updateable='false';
    const before=b.buildLayoutJson(); b.handleActionTarget({detail:{value:'opportunity-stage'}});
    b.newAction={...b.newAction,label:'Edit opportunity'}; await b.addAction();
    assert.equal(calls,0,risk); assert.equal(b.buildLayoutJson(),before,risk);
    assert.ok(b.opportunityAuthoringErrors.some(e=>e.includes('Amount')),risk);
  }
});
test('mutated constants, reordered and extra mappings are rejected by the Studio preset path', async () => {
  for (const mappings of [
    [{fieldApi:'StageName',source:'constant',value:'Closed Won'},...expectedMappings.slice(1)],
    [expectedMappings[1],expectedMappings[0],expectedMappings[2]],
    [...expectedMappings,{fieldApi:'Name',source:'current'}]
  ]) {
    const {b,context}=studio(); let calls=0; context.saveDraft=async()=>{calls++;};
    b.newAction={type:'record-edit',label:'Edit',mappings}; await b.addAction(); assert.equal(calls,0);
  }
});
test('existing Account mappings and unknown action/layout metadata survive Opportunity additions', async () => {
  const {b}=studio(); b.selectedObject='Account';
  const cfg={extensions:{version:7},permissions:{writeEnabled:true,extension:'keep'},fields:[{api:'Amount',editable:true}],actions:[
    {name:'account_edit',label:'Account edit',type:'record-edit',enabled:false,mappings:[{fieldApi:'Amount',source:'constant',value:'',extension:'mapped'}],extension:{keep:true}}
  ]};
  b.parseWorkingModel(JSON.stringify(cfg)); const actual=JSON.parse(b.buildLayoutJson());
  assert.deepEqual(actual.extensions,cfg.extensions); assert.deepEqual(actual.actions[0].mappings,cfg.actions[0].mappings);
  assert.deepEqual(actual.actions[0].extension,{keep:true}); assert.equal(actual.actions[0].enabled,false);
  assert.equal(actual.permissions.extension,'keep');
});
test('preview sends only fixed synthetic fields after load and rejects executable layout metadata', () => {
  const {instance:p}=component('cardstackOpportunityPreview',{previewResource:'/resource/preview',window:{addEventListener(){},removeEventListener(){}}});
  const sent=[]; const frame={contentWindow:{postMessage:(data,origin)=>sent.push({data:plain(data),origin})}};
  p.template={querySelector:()=>frame}; p.layout={version:1,sections:[{id:'details',label:'Synthetic details',columns:2,fields:['StageName','CloseDate','Amount']}]};
  p.handleFrameLoad(); assert.equal(sent.length,1); assert.equal(sent[0].origin,'*');
  assert.equal(sent[0].data.type,'cardstack-preview/v1'); assert.equal(sent[0].data.fields[2].value,'10000');
  p.layout={version:1,sections:[{id:'details',label:'Bad',columns:2,fields:['StageName','CloseDate','Amount'],html:'<script>'}]};
  assert.equal(sent.length,1); assert.ok(p.errorMessage);
  p.layout={version:1,sections:[{id:'details',label:'Synthetic',columns:2,fields:['StageName','StageName','Amount']}]};
  assert.equal(sent.length,1); assert.ok(p.errorMessage);
});
test('preview unload and unrelated message sources cannot send data or acquire execution authority', () => {
  const listeners=new Map();const w={addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:(t,f)=>{if(listeners.get(t)===f)listeners.delete(t);}};
  const {instance:p}=component('cardstackOpportunityPreview',{previewResource:'/resource/preview',window:w});
  let calls=0; const frame={contentWindow:{postMessage(){calls++;}}};p.template={querySelector:()=>frame};
  p.connectedCallback(); const message=listeners.get('message');
  message({source:{},data:{type:'confirm'}}); message({source:frame.contentWindow,data:{type:'confirm'}});
  assert.equal(calls,0); p.disconnectedCallback(); assert.equal(listeners.size,0);
  p.handleFrameLoad(); assert.equal(calls,0);
});
test('enabled Opportunity preset stages without any authorization payload or synthetic values', async () => {
  const {b,context}=studio();let saved;
  context.saveDraft=async p=>{saved=p;};b.handleActionTarget({detail:{value:'opportunity-stage'}});
  b.newAction={...b.newAction,label:'Edit opportunity'};await b.addAction();
  assert.ok(saved);const action=JSON.parse(saved.value).actions[0];
  assert.deepEqual(action.mappings,expectedMappings);assert.equal(action.enabled,true);
  assert.equal(saved.value.includes('Discovery'),false);assert.equal(saved.value.includes('reviewGrant'),false);
});
test('disabled staged preset permits reducing chat rights and removing its field exposure', async () => {
  const {b,context}=studio();let saved;
  b.workingActions=[b.normalizeAction({name:'forecast',label:'Forecast',type:'record-edit',enabled:false,mappings:expectedMappings},0)];
  b.workingPermissions.writeEnabled=false;
  b.workingSections[0].fields=b.workingSections[0].fields.filter(f=>f.api!=='Amount');
  context.saveDraft=async p=>{saved=p;};await b.stageLayout();
  assert.ok(saved);assert.equal(JSON.parse(saved.value).permissions.writeEnabled,false);
  assert.equal(JSON.parse(saved.value).actions[0].enabled,false);
  assert.deepEqual(JSON.parse(saved.value).actions[0].mappings,expectedMappings);
});
test('enabled preset revalidates after layout edits before staging any policy change', async () => {
  const {b,context}=studio();let calls=0;
  b.workingActions=[b.normalizeAction({name:'forecast',label:'Forecast',type:'record-edit',enabled:true,mappings:expectedMappings},0)];
  b.workingSections[0].fields.find(f=>f.api==='Amount').editable=false;
  context.saveDraft=async()=>{calls++;};await b.stageLayout();assert.equal(calls,0);
});
test('Studio frame payload renders through the accepted static resource and can review but never save', async () => {
  const { JSDOM }=require(require.resolve('jsdom',{paths:[process.env.CARDSTACK_UI_DEPENDENCIES || '/Users/danielben-atar/Re-headed-crm/packages/widgets/node_modules']}));
  const template=fs.readFileSync(base+'lwc/cardstackOpportunityPreview/cardstackOpportunityPreview.html','utf8');
  const markup=new JSDOM(template.replace(/<(\/?)template\b/g, '<$1div')).window.document.querySelector('iframe');
  assert.equal(markup.getAttribute('sandbox'),'allow-scripts');
  assert.ok(markup.getAttribute('title').includes('Save disabled'));
  const resource=fs.readFileSync(base+'staticresources/CardstackOpportunityPreviewUi.resource','utf8');
  const dom=new JSDOM(resource,{runScripts:'dangerously',url:'https://synthetic.invalid/preview'});
  const win=dom.window;const parent={};Object.defineProperty(win,'parent',{value:parent});
  const {instance:p}=component('cardstackOpportunityPreview',{previewResource:'/resource/preview',window:{}});
  p.template={querySelector:()=>({contentWindow:{postMessage(data,origin){
    assert.equal(origin,'*');win.dispatchEvent(new win.MessageEvent('message',{source:parent,data:plain(data)}));
  }}})};
  p.layout={version:1,sections:[{id:'details',label:'Synthetic Studio details',columns:2,fields:['StageName','CloseDate','Amount']}]};
  p.handleFrameLoad();
  assert.match(win.document.body.textContent,/Synthetic Studio details/);
  const amount=win.document.querySelector('[data-field=Amount]');assert.equal(amount.value,'10,000');
  amount.value='12500.25';amount.dispatchEvent(new win.Event('input',{bubbles:true}));
  const review=win.document.querySelector('[data-action=review]');review.click();
  const confirm=win.document.querySelector('[data-action=confirm]');assert.ok(confirm);assert.equal(confirm.disabled,true);
  assert.match(win.document.body.textContent,/12,500\.25/);
  win.dispatchEvent(new win.MessageEvent('message',{source:{},data:{type:'cardstack-preview/v1',fields:[]}}));
  assert.equal(win.document.querySelector('[data-action=confirm]').disabled,true);
  win.close();
});
test('malformed and stale unused mapping payloads return authoring errors without throwing or staging', async () => {
  for (const malformed of [[null,expectedMappings[1],expectedMappings[2]],'abc']) {
    const {b,context}=studio();let calls=0;context.saveDraft=async()=>{calls++;};
    b.newAction={type:'record-edit',label:'Edit',enabled:true,mappings:malformed};
    await assert.doesNotReject(()=>b.addAction());assert.equal(calls,0);
  }
  const {b,context}=studio();let calls=0;context.saveDraft=async()=>{calls++;};
  b.newAction={type:'record-edit',label:'Edit',enabled:true,mappings:expectedMappings,flowApiName:''};
  await b.addAction();assert.equal(calls,0);
});

test('Boolean field catalog preserves Opportunity preset validation and disabled retained mappings',async()=>{
 const {b,context}=studio();b.wiredFieldsResult.data.forEach(field=>{field.updateable=true;});assert.equal(b.opportunityAuthoringErrors.length,0);b.handleActionTarget({detail:{value:'opportunity-stage'}});b.newAction.label='Edit opportunity';let saved;context.saveDraft=async input=>{saved=input;};context.getStagingInfoFresh=async()=>({draft:{Draft_Value__c:saved.value}});await b.addAction();assert.deepEqual(JSON.parse(saved.value).actions[0].mappings,expectedMappings);
 b.wiredFieldsResult.data.find(field=>field.api==='StageName').updateable=false;assert.ok(b.opportunityAuthoringErrors.length);b.workingActions[0].enabled=false;saved=undefined;await b.stageLayout();assert.equal(JSON.parse(saved.value).actions[0].enabled,false);assert.deepEqual(JSON.parse(saved.value).actions[0].mappings,expectedMappings);
});
