const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = __dirname + '/../force-app/main/default/lwc/';
const context = { LightningElement: class {}, ShowToastEvent: class {} };
vm.runInNewContext(fs.readFileSync(base + 'cardstackStudioKeys/cardstackStudioKeys.js', 'utf8').replace(/export /g, ''), context);
const listContext = {};
vm.runInNewContext(fs.readFileSync(base+'cardstackListConfigModel/cardstackListConfigModel.js','utf8').replace(/export /g,''),listContext);
context.parseExposure = listContext.parseExposure;
const moduleFile = base + 'cardstackConfigDiff/cardstackConfigDiff.js';
test('comparison module exists', () => assert.ok(fs.existsSync(moduleFile), 'Missing semantic comparison module'));
if (fs.existsSync(moduleFile)) vm.runInNewContext(fs.readFileSync(moduleFile, 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, ''), context);
const compare = (live, draft, key = 'layout:Account:default') => context.compareConfig(key, live === null ? null : JSON.stringify(live), JSON.stringify(draft));
const layout = { sections: [{ label: 'Details', columns: 1, fields: [{ api: 'Description', editable: false }] }], permissions: { writeEnabled: false } };
const plain = v => JSON.parse(JSON.stringify(v));
test('modernSectionsAndPolicyHaveExplicitDiff', () => {
 const draft = plain(layout); draft.sections[0].fields[0].editable = true; draft.sections[0].fields.push({api:'NumberOfEmployees',editable:true}); draft.permissions.writeEnabled = true;
 const result = compare(layout, draft); assert.equal(result.status, 'changed');
 assert.match(result.changes.find(c=>c.path==='sections[0].fields[0].editable').label,/Description/);
 for (const path of ['sections[0].fields[0].editable','sections[0].fields[1]','permissions.writeEnabled']) assert.ok(result.changes.some(c => c.path === path),path);
 assert.deepEqual(plain(result.changes.find(c=>c.path==='permissions.writeEnabled')), {path:'permissions.writeEnabled',label:'Write enabled (permissions.writeEnabled)',before:false,after:true});
 assert.equal(compare(layout, plain(layout)).status,'unchanged');
 for (const [property,value] of [['label','Other'],['columns',3]]) { const d=plain(layout);d.sections[0][property]=value;assert.ok(compare(layout,d).changes.some(c=>c.path===`sections[0].${property}`)); }
 for (const [property,value] of [['required',true],['readOnly',true],['label','Narrative']]) {const d=plain(layout);d.sections[0].fields[0][property]=value;assert.ok(compare(layout,d).changes.some(c=>c.path.endsWith('.'+property)));}
});
test('legacyAndModernEquivalentLayoutsCompareEqual', () => {
 const sections=layout.sections;
 assert.equal(compare({recordCard:{sections}}, {sections}).status,'unchanged');
 assert.equal(compare({fields:['Name']}, {sections:[{label:'Account Information',columns:2,fields:['Name']}]}).status,'unchanged');
 const live={recordCard:{sections,unknown:'retained'}};const draft={sections,recordCard:{unknown:'changed'}};
 assert.ok(compare(live,draft).changes.some(c=>c.path==='recordCard.unknown'&&c.before==='retained'));
 assert.deepEqual(live,{recordCard:{sections,unknown:'retained'}});
});
test('actionsAndMappingsAreCompared', () => {
 const live={actions:[{name:'review',enabled:false,mappings:[{fieldApi:'Description',source:'constant',value:'0'}]}]}; const draft=plain(live);draft.actions[0].enabled=true;draft.actions[0].mappings[0].value='';
 const r=compare(live,draft);assert.ok(r.changes.some(c=>c.path==='actions[0].enabled'&&c.before===false&&c.after===true));assert.ok(r.changes.some(c=>c.path==='actions[0].mappings[0].value'&&c.before==='0'&&c.after===''));
 const reordered={sections:[{fields:['Name','Description']}]};const swapped={sections:[{fields:['Description','Name']}]};assert.equal(compare(reordered,swapped).status,'changed');
 assert.equal(compare({highlights:['Name']},{highlights:['Industry']}).status,'changed');
 assert.equal(compare({permissions:{fieldDenylist:[]}},{permissions:{fieldDenylist:['Description']}}).status,'changed');
});
test('malformed known mapping properties are unavailable in comparison and Publish Center', () => {
 const action = mapping => ({actions:[{name:'review',mappings:[mapping]}]});
 for (const mapping of [
  {fieldApi:'Description',source:42},
  {fieldApi:'Description',source:'unsupported'},
  {fieldApi:'Description'},
  {fieldApi:'',source:'current'},
  {fieldApi:'Description',source:'field',sourceField:42},
  {fieldApi:'Description',source:'field'},
  {fieldApi:'Description',source:'current',sourceField:{}},
  {fieldApi:'Description',source:'constant',value:42},
  {fieldApi:'Description',source:'constant',value:null},
  {fieldApi:'Description',source:'constant',value:{}},
  {fieldApi:'Description',source:'answer',value:[]}
 ]) {
  const malformed=action(mapping); const result=compare(malformed,malformed);
  assert.equal(result.status,'unavailable',JSON.stringify(mapping));
  assert.match(result.message,/Comparison unavailable/); assert.doesNotMatch(result.message,/No changes/i);
  assert.equal(compare(action({fieldApi:'Description',source:'current'}),malformed).status,'unavailable');
  const lines=consumer().computeDiff('layout:Account:default',JSON.stringify(malformed),JSON.stringify(malformed));
  assert.match(lines[0].text,/Comparison unavailable/);assert.doesNotMatch(lines[0].text,/No changes/i);
 }
});
test('supported mapping sources retain literal and unknown metadata comparison', () => {
 const mappings=[
  {fieldApi:'Description',source:'current',sourceField:null,value:null},
  {fieldApi:'Description',source:'field',sourceField:'Name'},
  {fieldApi:'Description',source:'constant',value:''},
  {fieldApi:'NumberOfEmployees',source:'constant',value:'0'},
  {fieldApi:'Description',source:'answer',future:{retained:true}}
 ];
 for (const mapping of mappings) {
  const value={actions:[{name:'review',mappings:[mapping]}]};
  assert.equal(compare(value,plain(value)).status,'unchanged',JSON.stringify(mapping));
 }
 const live={actions:[{name:'review',mappings:[mappings[4]]}]};const draft=plain(live);draft.actions[0].mappings[0].future.retained=false;
 const change=compare(live,draft).changes.find(c=>c.path==='actions[0].mappings[0].future.retained');
 assert.equal(change.before,true);assert.equal(change.after,false);
 assert.equal(live.actions[0].mappings[0].future.retained,true);
});
test('listExposureChangesAreCompared', () => {
 const live={version:1,views:[{viewId:'00B000000000001EAA',enabled:false}],customLists:[]};const d=plain(live);d.views[0].enabled=true;
 assert.ok(compare(live,d,'exposures:Account').changes.some(c=>c.path==='views[0].enabled'));
 assert.equal(compare([], [{apiName:'AccountFlow',enabled:true}], 'flows').status,'changed');
 assert.equal(compare([{apiName:'AccountFlow',enabled:true}], [{enabled:true,apiName:'AccountFlow'}], 'flows').status,'unchanged');
});
test('unknownOrMalformedSchemaIsUnavailable', () => {
 for (const value of [null, [], {}, {sections:'bad'}, {sections:[{fields:[null]}]}, {permissions:{writeEnabled:'yes'}}, {actions:'bad'}, {sections:[{label:{},fields:[]}]}, {sections:[{fields:[{api:'Name',editable:'yes'}]}]}]) assert.equal(compare(value,value).status,'unavailable',JSON.stringify(value));
 assert.equal(context.compareConfig('layout:Account:default',null,'{broken').status,'unavailable');
 assert.equal(compare({sections:[]},{sections:[]},'homecard').status,'unavailable');
 assert.equal(compare({}, {}, 'flows').status,'unavailable');
 assert.equal(compare([{apiName:'Flow',enabled:'yes'}],[{apiName:'Flow',enabled:'yes'}],'flows').status,'unavailable');
 assert.equal(compare({views:[{enabled:'yes'}]},{views:[{enabled:'yes'}]},'exposures:Account').status,'unavailable');
 assert.equal(compare({views:'bad'}, {views:'bad'}, 'exposures:Account').status,'unavailable');
 assert.equal(compare({sections:[],future:{v:1}},{sections:[],future:{v:2}}).status,'changed');
 assert.equal(compare(null,{sections:[]}).status,'changed');
});
function consumer() {
 const source=fs.readFileSync(base+'cardstackPublishCenter/cardstackPublishCenter.js','utf8').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace('export default class CardstackPublishCenter','globalThis.Consumer = class CardstackPublishCenter');
 vm.runInNewContext(source,context);const c=new context.Consumer();c.toast=()=>{};return c;
}
test('Publish Center shows material values and comparison failures instead of no changes', async () => {
 const c=consumer();const lines=c.computeDiff('layout:Account:default',JSON.stringify(layout),JSON.stringify({...layout,permissions:{writeEnabled:true}}));
 assert.ok(lines.some(l=>l.text.includes('false → true')));
 context.getStagingInfo=async()=>{throw new Error('Read failed');};
 const row={Id:'draft',Status__c:'Draft',Config__r:{Name:'layout:Account:default'},Draft_Value__c:JSON.stringify(layout)};
 await c.loadDiffs([row]);assert.equal(c.enrichDraft(row).prettyLiveValue,'Published value unavailable.');assert.match(c.diffCache.draft.summary[0].text,/Comparison unavailable/);assert.doesNotMatch(c.diffCache.draft.summary[0].text,/No changes/i);
});

test('publishedListDiffNamesAffectedTargetsAndAdHocChange',()=>{
 const live={version:1,allowAdHoc:false,views:[{viewId:'00B000000000001EAA',enabled:false}],customLists:[{key:'listview:Account:approved',enabled:false}],future:0};const draft=plain(live);draft.views[0].enabled=true;draft.customLists[0].enabled=true;draft.allowAdHoc=true;const result=compare(live,draft,'exposures:Account');
 assert.equal(result.status,'changed');assert.match(result.changes.find(c=>c.path==='views[0].enabled').label,/00B000000000001EAA/);assert.match(result.changes.find(c=>c.path==='customLists[0].enabled').label,/listview:Account:approved/);assert.match(result.changes.find(c=>c.path==='allowAdHoc').label,/unnamed filtered requests/i);
 assert.equal(compare({...live,allowAdHoc:undefined},live,'exposures:Account').status,'unchanged');
});
test('strictListComparisonNeverReportsMalformedPolicyUnchanged',()=>{
 const v={version:1,views:[],customLists:[]};for(const malformed of [{...v,version:2},{...v,version:'1'},{...v,allowAdHoc:0},{version:1,views:[]},{...v,views:[{viewId:'bad',enabled:true}]},{...v,views:[{viewId:'00B000000000001EAA',enabled:true},{viewId:'00B000000000001',enabled:false}]},{...v,customLists:[{key:'listview:Contact:wrong',enabled:true}]},{views:[{viewId:'00B000000000001EAA',enabled:true}],customLists:[]}]) assert.equal(compare(malformed,malformed,'exposures:Account').status,'unavailable',JSON.stringify(malformed));
 const legacy={views:[{viewId:'legacy',exposed:false,unknown:0}],customLists:[{id:'old',name:'Old'}]};assert.equal(compare(legacy,legacy,'exposures:Account').status,'unchanged');assert.equal(compare({views:[],customLists:[]},v,'exposures:Account').status,'changed');assert.equal(compare({...v,future:false},{...v,future:0},'exposures:Account').status,'changed');
});
test('firstPublishedListPolicyShowsTargetsEnablementAndUnnamedRequestDecision',()=>{
 const value={version:1,allowAdHoc:false,views:[{viewId:'00B000000000001EAA',enabled:true}],customLists:[{key:'listview:Account:approved',enabled:false}]};const result=compare(null,value,'exposures:Account');assert.equal(result.status,'changed');assert.ok(result.changes.some(change=>/00B000000000001EAA/.test(change.label)));assert.ok(result.changes.some(change=>/listview:Account:approved/.test(change.label)));assert.ok(result.changes.some(change=>change.path==='allowAdHoc'&&change.after===false));
});
