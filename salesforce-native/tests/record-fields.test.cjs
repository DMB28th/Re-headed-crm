'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../ui/opportunity-edit/fields.mjs'), import('../ui/opportunity-edit/record-contract.mjs')]);
const text = (dataType, value = null) => ({fieldApi: 'Literal', label: 'Literal', dataType, value, required: false, canClear: true, choices: [], length: 12});
const choice = (fieldApi = 'Rating', value = 'Retired_API') => ({fieldApi, label: fieldApi, dataType: 'PICKLIST', value, required: false, canClear: true, length: 40, choices: [{label: 'Hot affiché <x>', value: 'Hot_API'}]});
const view = (fields) => ({contractVersion:'record-card/v1', objectApiName:'Lead', recordId:'00Q000000000001EAA', recordName:'Synthetic lead', fields, actions:[]});
test('native typed strings preserve whitespace and exact text', async () => {
 const [{registry, validateChanges}, {publicView}] = await modules;
 for (const type of ['EMAIL','PHONE','URL']) {
  const field = text(type, '  Exact <x> ');
  assert.equal(registry[type]?.kind, 'text');
  assert.equal(publicView(view([field])).fields[0].value, field.value);
  assert.deepEqual(validateChanges([field], {Literal:{operation:'set', value:'  Exact <x> '}}).changes, [{fieldApi:'Literal',operation:'set',value:'  Exact <x> '}]);
  assert.equal(validateChanges([field], {Literal:{operation:'set',value:'x'.repeat(13)}}).errors.length, 1);
 }
});
test('generic choice descriptors keep two independent exact API sets', async () => {
 const [{validateChanges}, {publicView}] = await modules;
 const left = choice(), right = {...choice('LeadSource', null), choices:[{label:'Web',value:'Web_API'}]};
 const fields = publicView(view([left,right])).fields;
 assert.equal(fields[0].value,'Retired_API');
 assert.equal(fields[1].value,null);
 assert.equal(validateChanges(fields, {Rating:{operation:'set',value:'Web_API'}}).errors.length,1);
 assert.equal(validateChanges(fields, {Rating:{operation:'set',value:'Hot affiché <x>'}}).errors.length,1);
 assert.deepEqual(validateChanges(fields, {Rating:{operation:'keep'}}).changes,[]);
 assert.deepEqual(validateChanges(fields, {Rating:{operation:'clear'}}).changes,[{fieldApi:'Rating',operation:'clear'}]);
});
test('generic descriptor rejects forged choice authority members', async () => {
 const [, {publicView}] = await modules;
 const field = choice(); field.choices[0].validFor = [0];
 assert.throws(() => publicView(view([field])), /INVALID_CHOICES/);
});
test('generic descriptor rejects choices attached to typed strings', async () => {
 const [, {publicView}] = await modules;
 assert.throws(() => publicView(view([{...text('EMAIL'),choices:choice().choices}])), /INVALID_FIELDS/);
});
test('generic review rejects an unselectable new picklist value', async () => {
 const [, {publicView}] = await modules;
 const raw = {...view([choice()]),contractVersion:'record-edit/v1',status:'Review',revision:2,reviewRevision:1,expiresAt:'2026-10-13T12:00:00Z',diff:[{fieldApi:'Rating',label:'Rating',beforeValue:'Retired_API',afterValue:'Forged_API'}]};
 assert.throws(() => publicView(raw), /INVALID_VIEW/);
});
test('generic review accepts retired before-value with a selectable replacement', async () => {
 const [, {publicView}] = await modules;
 const raw = {...view([choice()]),contractVersion:'record-edit/v1',status:'Review',revision:2,reviewRevision:1,expiresAt:'2026-10-13T12:00:00Z',diff:[{fieldApi:'Rating',label:'Rating',beforeValue:'Retired_API',afterValue:'Hot_API'}]};
 assert.equal(publicView(raw).diff[0].beforeValue,'Retired_API');
});
test('typed-string public descriptors require native bounds and reject overlength values', async () => {
 const [, {publicView}] = await modules;
 for (const type of ['EMAIL','PHONE','URL']) {
  const field = text(type); delete field.length;
  assert.throws(() => publicView(view([field])), /INVALID_FIELDS/);
  assert.throws(() => publicView(view([text(type,'x'.repeat(13))])), /INVALID_FIELDS/);
 }
});
test('generic picklist public descriptors require native bounded API values', async () => {
 const [, {publicView}] = await modules;
 const field = choice(); delete field.length;
 assert.throws(() => publicView(view([field])), /INVALID_FIELDS/);
 const small = {...choice(),length:3};
 assert.throws(() => publicView(view([small])), /INVALID_FIELDS/);
});
test('completed receipt permits bounded historical picklist values without selectable choices', async () => {
 const [, {publicView}] = await modules;
 const field = {...choice(),value:'Saved_API',choices:[]};
 const raw = {...view([field]),contractVersion:'record-edit/v1',status:'Completed',revision:3,receipt:{reference:'receipt-'+ 'c'.repeat(32),actorDisplayName:'Synthetic actor',completedAt:'2026-10-13T12:00:00Z',status:'saved',diff:[{fieldApi:'Rating',label:'Rating',beforeValue:'Retired_API',afterValue:'Saved_API'}]}};
 const result=publicView(raw);
 assert.deepEqual(result.fields[0].choices,[]);
 assert.equal(result.receipt.diff[0].afterValue,'Saved_API');
 raw.receipt.diff[0].afterValue='x'.repeat(41);
 assert.throws(()=>publicView(raw),/INVALID_VIEW/);
});
test('completed projection strips selectable choices while review still requires exact native options', async () => {
 const [, {publicView}] = await modules;
 const raw = {...view([choice()]),contractVersion:'record-edit/v1',status:'Completed',revision:3,receipt:{reference:'receipt-'+ 'c'.repeat(32),actorDisplayName:'Synthetic actor',completedAt:'2026-10-13T12:00:00Z',status:'saved',diff:[{fieldApi:'Rating',label:'Rating',beforeValue:'Retired_API',afterValue:'Hot_API'}]}};
 assert.deepEqual(publicView(raw).fields[0].choices,[]);
 raw.status='Review'; raw.reviewRevision=1; raw.expiresAt='2026-10-13T12:00:00Z'; raw.diff=raw.receipt.diff; raw.fields[0].choices=[];
 assert.throws(()=>publicView(raw),/INVALID_VIEW/);
});

test('picklist keep rerender shows eligible current value without submitting it and preserves clear and retired semantics',async()=>{
 const {createRequire}=require('node:module'),path=require('node:path');const dependency=process.env.CARDSTACK_UI_DEPENDENCIES;const local=dependency?createRequire(path.resolve(dependency,'../package.json')):require;const {JSDOM}=local('jsdom');const {renderScreen}=await import('../ui/opportunity-edit/view.mjs');const [{validateChanges}]=await modules;const dom=new JSDOM('<main id="root"></main>'),root=dom.window.document.querySelector('#root');
 for(const current of ['Hot_API','Retired_API',null]){
  const field=choice('Rating',current);const form=renderScreen(root,{status:'Editing',editable:true,fields:[field],drafts:{Rating:{operation:'keep'}},errors:[{fieldApi:'Rating',message:'Other validation rerender'}]});assert.equal(root.querySelector('[data-field=Rating]').value,current??'');assert.deepEqual(form.readDraft(),{Rating:{operation:'keep'}});assert.deepEqual(validateChanges([field],form.readDraft()).changes,[]);
  if(current==='Retired_API')assert.equal(root.querySelector('option[value=Retired_API]').disabled,true);
  const cleared=renderScreen(root,{status:'Editing',editable:true,fields:[field],drafts:{Rating:{operation:'clear'}}});assert.equal(root.querySelector('[data-field=Rating]').value,'');assert.equal(root.querySelector('[data-clear=Rating]').checked,true);assert.deepEqual(cleared.readDraft(),{Rating:{operation:'clear'}});
 }
 const field=choice('Rating','Retired_API'),form=renderScreen(root,{status:'Editing',editable:true,fields:[field],drafts:{Rating:{operation:'keep'}}});const input=root.querySelector('[data-field=Rating]');input.value='Hot_API';input.dispatchEvent(new dom.window.Event('change'));assert.deepEqual(form.readDraft(),{Rating:{operation:'set',value:'Hot_API'}});dom.window.close();
});
