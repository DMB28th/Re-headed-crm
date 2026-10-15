const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = __dirname + '/../force-app/main/default/';
const read = p => fs.readFileSync(root + p, 'utf8');
function harness(rows = []) {
 const events=[]; const context={LightningElement:class {dispatchEvent(e){events.push(e);}},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},ShowToastEvent:class {},refreshApex:async()=>{},getDrafts:async()=>rows,LightningConfirm:{open:async()=>true},CardstackReviewDialog:{open:async()=>true}};
 vm.runInNewContext(read('lwc/cardstackStudioKeys/cardstackStudioKeys.js').replace(/export /g,''),context);
 const model=root+'lwc/cardstackPublishModel/cardstackPublishModel.js';
 if(fs.existsSync(model))vm.runInNewContext(fs.readFileSync(model,'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),context);
 vm.runInNewContext(read('lwc/cardstackPublishCenter/cardstackPublishCenter.js').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace(/export default class \w+/,'globalThis.Component = class'),context);
 const component=new context.Component();component.wiredResult={data:rows};component.toast=()=>{};return{component,context,events};
}
const row=(id,key='flows')=>({Id:id,Name:'Draft '+id,Status__c:'Draft',Config__r:{Name:key},Draft_Value__c:'[]'});
const review=id=>({draftId:id,key:'flows',liveValue:null,draftValue:'[]',liveDigest:'live-'+id,draftDigest:'draft-'+id});
const click=id=>({currentTarget:{dataset:{id}}});
test('partialBatchNamesSuccessfulAndFailedDrafts',async()=>{
 const {context}=harness();assert.equal(typeof context.publishSelection,'function','Missing sequential publication model');
 const calls=[];const results=await context.publishSelection([review('first'),review('second')],async r=>{calls.push(r.draftId);if(r.draftId==='second')throw Object.assign(new Error('STALE_REVIEW'),{errorCode:'STALE_REVIEW'});});
 assert.deepEqual(JSON.parse(JSON.stringify(results)),[{draftId:'first',status:'published'},{draftId:'second',status:'failed',errorCode:'STALE_REVIEW'}]);assert.deepEqual(calls,['first','second']);
});
test('individualPublishUsesReviewedDigests and repeat click while busy issues one request',async()=>{
 const {component:c,context,events}=harness([row('first')]);let resolve;const gate=new Promise(r=>resolve=r);let calls=0;
 context.getDraftReview=async({draftId})=>review(draftId);context.publishReviewedDraft=async args=>{calls++;assert.deepEqual(JSON.parse(JSON.stringify(args)),{draftId:'first',expectedLiveDigest:'live-first',expectedDraftDigest:'draft-first'});await gate;};
 const first=c.publish(click('first'));await Promise.resolve();const second=c.publish(click('first'));resolve();await Promise.all([first,second]);assert.equal(calls,1);assert.ok(events.some(e=>e.type==='configchange'&&e.detail.operation==='publish'));
});
test('retiredOrUnsupportedDraftCannotEnterStudioSelection',async()=>{
 const {component:c,context}=harness([row('one'),row('home','homecard'),row('audience','layout:Account:sales')]);let calls=0;context.getDraftReview=async()=>{calls++;return review('bad');};
 c.selectedIds=['home','audience'];await c.publishSelected();await c.publish(click('home'));assert.equal(calls,0);
});
test('explicit selection among more than 200 candidates publishes exactly the selected set',async()=>{
 const rows=Array.from({length:251},(_,i)=>row(String(i)));const {component:c,context}=harness(rows);const calls=[];
 context.getDraftReview=async({draftId})=>review(draftId);context.publishReviewedDraft=async({draftId})=>calls.push(draftId);
 c.selectedIds=['7','243'];await c.publishSelected();assert.deepEqual(calls,['7','243']);assert.match(c.publishSelectedLabel,/\(0\)/);assert.doesNotMatch(read('lwc/cardstackPublishCenter/cardstackPublishCenter.html'),/Publish All/);
});
test('lost response reconciles exact authoritative status before offering retry',async()=>{
 const {component:c,context}=harness([row('first')]);const calls=[];context.getDraftReview=async()=>review('first');context.publishReviewedDraft=async()=>{calls.push('publish');throw new Error('Network lost');};context.getDraftStatus=async({draftId})=>{calls.push('status:'+draftId);return 'Published';};
 await c.publish(click('first'));assert.deepEqual(calls,['publish','status:first']);assert.equal(c.operationResults[0].status,'published');
});
test('unresolved publication blocks retry until authoritative status can be read',async()=>{
 const {component:c,context}=harness([row('first')]);let calls=0;context.getDraftReview=async()=>review('first');context.publishReviewedDraft=async()=>{calls++;throw new Error('Lost');};context.getDraftStatus=async()=>{throw new Error('Offline');};
 await c.publish(click('first'));await c.publish(click('first'));assert.equal(calls,1);assert.equal(c.operationResults[0].errorCode,'PUBLISH_STATUS_UNKNOWN');context.getDraftStatus=async()=> 'Draft';await c.refresh();await c.publish(click('first'));assert.equal(calls,2);
});
test('cancelled review and cancelled discard perform no writes',async()=>{
 const {component:c,context}=harness([row('first')]);context.getDraftReview=async()=>review('first');context.CardstackReviewDialog.open=async()=>undefined;context.LightningConfirm.open=async()=>false;context.publishReviewedDraft=async()=>assert.fail('Must not publish');context.rollbackDraft=async()=>assert.fail('Must not discard');await c.publish(click('first'));await c.askRollback(click('first'));
});
test('unavailable comparisons require native detail inspection and explicit acknowledgement',()=>{
 const path=root+'lwc/cardstackReviewDialog/cardstackReviewDialog.js';assert.ok(fs.existsSync(path),'Missing native review dialog');const source=fs.readFileSync(path,'utf8');assert.match(source,/LightningModal/);assert.match(source,/compareConfig/);assert.match(source,/unavailable/);assert.match(source,/acknowledged/);assert.match(read('lwc/cardstackReviewDialog/cardstackReviewDialog.html'),/Published raw JSON/);
});
test('changedLiveOrDraftRejectsReviewedPublish locks and hashes exact raw values',()=>{
 const source=read('classes/CardstackConfigService.cls');assert.match(source,/public static void publishReviewedDraft/);assert.match(source,/STALE_REVIEW/);assert.match(source,/JSON.serialize\(new List<String>\{rawStoredValue\}\)/);assert.match(source,/FOR UPDATE/);assert.match(read('classes/CardstackStudioController.cls'),/public static Map<String, Object> getDraftReview/);
});
test('partial batch persists exact successes and failures and retains failed candidate',async()=>{
 const rows=[row('first'),row('second')];const {component:c,context}=harness(rows);context.getDraftReview=async({draftId})=>review(draftId);context.publishReviewedDraft=async({draftId})=>{if(draftId==='second')throw Object.assign(new Error('STALE_REVIEW'),{errorCode:'STALE_REVIEW'});rows[0].Status__c='Published';};context.getDraftStatus=async()=> 'Draft';c.selectedIds=['first','second'];await c.publishSelected();
 assert.deepEqual(JSON.parse(JSON.stringify(c.operationResults)).map(({draftId,status})=>({draftId,status})),[{draftId:'first',status:'published'},{draftId:'second',status:'failed'}]);assert.equal(c.pendingDrafts[0].Id,'second');assert.equal(c.selectedIds[0],'second');assert.match(c.resultRows[1].text,/Draft second \(second\): failed — STALE_REVIEW/);
});
test('resolved lost response refresh emits affected key even after candidate leaves bounded history',async()=>{
 const {component:c,context,events}=harness([row('first')]);context.getDraftReview=async()=>review('first');context.publishReviewedDraft=async()=>{throw new Error('Lost');};context.getDraftStatus=async()=>{throw new Error('Offline');};await c.publish(click('first'));c.wiredResult={data:[]};context.getDraftStatus=async()=> 'Published';await c.refresh();assert.ok(events.some(e=>e.type==='configchange'&&e.detail.keys[0]==='flows'),'Refresh must notify the exact reviewed key when publication is confirmed');
});
test('focusDraft loads an out of window pending candidate and focuses native review button',async()=>{
 const {component:c,context}=harness([]);let focused=0;context.getDraftReview=async()=>review('outside');context.getDraftStatus=async()=> 'Draft';c.template={querySelectorAll:()=>[{dataset:{id:'outside'},focus:()=>focused++}]};await c.focusDraft('outside');assert.equal(c.pendingDrafts[0].Id,'outside');assert.equal(focused,1);context.getDraftStatus=async()=> 'Published';await c.refresh();assert.equal(c.pendingDrafts.length,0,'Published synthetic focus row must not survive authoritative refresh');
});
function modal() {
 const ctx={LightningModal:class {close(value){this.closed=value;}}};
 vm.runInNewContext(read('lwc/cardstackStudioKeys/cardstackStudioKeys.js').replace(/export /g,''),ctx);
 vm.runInNewContext(read('lwc/cardstackConfigDiff/cardstackConfigDiff.js').replace(/^import .*;$/gm,'').replace(/export /g,''),ctx);
 vm.runInNewContext(read('lwc/cardstackReviewDialog/cardstackReviewDialog.js').replace(/^import .*;$/gm,'').replace(/@api\s+/g,'').replace(/export default class \w+/,'globalThis.Dialog = class'),ctx);return new ctx.Dialog();
}
test('native review confirmation requires unavailable values inspected and explicit acknowledgement',()=>{
 const d=modal();d.reviews=[{...review('one'),draftValue:'{bad'}, {...review('two'),draftValue:'{bad'}];assert.equal(d.confirmDisabled,true);d.confirm();assert.equal(d.closed,undefined);
 for(const id of ['one','two']){d.inspect(click(id));assert.equal(d.confirmDisabled,true);d.acknowledge({...click(id),target:{checked:true}});}assert.equal(d.confirmDisabled,false);d.confirm();assert.equal(d.closed,true);
});
test('native review presents false zero empty and unknown metadata without rewriting saved values',()=>{
 const d=modal();const live='[{"apiName":"Flow","enabled":false,"count":0,"extra":""}]';const draft='[{"apiName":"Flow","enabled":true,"count":1,"extra":"changed"}]';d.reviews=[{...review('one'),liveValue:live,draftValue:draft}];assert.equal(d.confirmDisabled,false);const texts=d.rows[0].changes.map(c=>c.text).join('\n');assert.match(texts,/false → true/);assert.match(texts,/0 → 1/);assert.match(texts,/"" → "changed"/);d.inspect(click('one'));assert.equal(d.rows[0].liveRaw,live);assert.equal(d.rows[0].draftRaw,draft);
});
test('unresolved results survive another draft publication so later reconciliation still names the key',async()=>{
 const {component:c,context,events}=harness([row('unknown'),row('other','exposures:Account')]);context.getDraftReview=async({draftId})=>({...review(draftId),key:draftId==='unknown'?'flows':'exposures:Account'});context.publishReviewedDraft=async({draftId})=>{if(draftId==='unknown')throw new Error('Lost');};context.getDraftStatus=async()=>{throw new Error('Offline');};await c.publish(click('unknown'));await c.publish(click('other'));assert.ok(c.operationResults.some(r=>r.draftId==='unknown'),'Unresolved identity must persist across subsequent operations');context.getDraftStatus=async()=> 'Published';c.wiredResult={data:[]};await c.refresh();assert.ok(events.some(e=>e.type==='configchange'&&e.detail.keys.includes('flows')));
});
test('confirmed publication queues configchange across refresh rejection and emits once after recovery',async()=>{
 const {component:c,context,events}=harness([row('one')]);context.getDraftReview=async()=>review('one');context.publishReviewedDraft=async()=>{};context.refreshApex=async()=>{throw new Error('Refresh unavailable');};await c.publish(click('one'));
 assert.equal(c.operationResults[0].status,'published');assert.equal(events.length,0);assert.match(c.persistentError,/Refresh unavailable/);assert.equal(c.uncertainIds.length,0);
 context.refreshApex=async()=>{};await c.handleRefresh();await c.refresh();assert.equal(c.persistentError,'');assert.deepEqual(events.map(e=>JSON.parse(JSON.stringify(e.detail))),[{keys:['flows'],operation:'publish',publishedContexts:[{key:'flows',draftId:'one'}]}]);
});
test('confirmed discard queues configchange across refresh rejection and emits once after recovery',async()=>{
 const {component:c,context,events}=harness([row('one','exposures:Account')]);let writes=0;context.rollbackDraft=async()=>writes++;context.refreshApex=async()=>{throw new Error('Refresh unavailable');};await c.askRollback(click('one'));assert.equal(writes,1);assert.equal(events.length,0);assert.match(c.persistentError,/Refresh unavailable/);
 context.refreshApex=async()=>{};await c.handleRefresh();await c.refresh();assert.deepEqual(events.map(e=>JSON.parse(JSON.stringify(e.detail))),[{keys:['exposures:Account'],operation:'discard'}]);assert.equal(writes,1);
});
test('recovery merges queued confirmed publication and resolved uncertain publication without duplicate notifications',async()=>{
 const {component:c,context,events}=harness([row('one'),row('two','exposures:Account')]);context.getDraftReview=async({draftId})=>({...review(draftId),key:draftId==='one'?'flows':'exposures:Account'});context.publishReviewedDraft=async({draftId})=>{if(draftId==='two')throw new Error('Lost response');};context.getDraftStatus=async()=>{throw new Error('Status unavailable');};context.refreshApex=async()=>{throw new Error('Refresh unavailable');};c.selectedIds=['one','two'];await c.publishSelected();assert.equal(events.length,0);
 context.refreshApex=async()=>{};context.getDraftStatus=async()=> 'Published';await c.handleRefresh();await c.refresh();assert.deepEqual(events.map(e=>JSON.parse(JSON.stringify(e.detail))),[{keys:['flows','exposures:Account'],operation:'publish',publishedContexts:[{key:'flows',draftId:'one'},{key:'exposures:Account',draftId:'two'}]}]);assert.equal(c.uncertainIds.length,0);
});
test('postPublishContextQueuesExactDraftsAndDoesNotReemitHistoricalDraftForSameKey',async()=>{
 const {component:c,context,events}=harness([row('current')]);c.operationResults=[{draftId:'historic',key:'flows',status:'published'}];context.getDraftReview=async()=>review('current');context.publishReviewedDraft=async()=>{};context.refreshApex=async()=>{throw new Error('Unavailable');};await c.publish(click('current'));assert.equal(events.length,0);
 context.refreshApex=async()=>{};await c.refresh();await c.refresh();assert.deepEqual(events.map(e=>JSON.parse(JSON.stringify(e.detail))),[{keys:['flows'],operation:'publish',publishedContexts:[{key:'flows',draftId:'current'}]}]);
});
test('resolvedUnknownPublicationCarriesExactDraftContextAfterAuthoritativeRefresh',async()=>{
 const {component:c,context,events}=harness([row('uncertain')]);c.operationResults=[{draftId:'historic',key:'flows',status:'published'}];context.getDraftReview=async()=>review('uncertain');context.publishReviewedDraft=async()=>{throw new Error('Lost response');};context.getDraftStatus=async()=>{throw new Error('Unknown status');};await c.publish(click('uncertain'));assert.equal(events.length,0);context.getDraftStatus=async()=> 'Published';await c.refresh();assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail.publishedContexts)),[{key:'flows',draftId:'uncertain'}]);
});
