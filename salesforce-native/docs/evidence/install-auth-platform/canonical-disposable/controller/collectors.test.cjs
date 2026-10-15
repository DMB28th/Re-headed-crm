'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./core.cjs'),{createCollectors}=require('./collectors.cjs');
const identity={org:'00D000000000001EAA',actor:'005000000000001AAA'},now=Date.parse('2026-10-10T16:00:00Z');
function fixture(){
 const classes=[{Id:'01p000000000001AAA',Name:'CardstackCanonicalProbe',Body:'ingress',ApiVersion:67,Status:'Active'},{Id:'01p000000000002AAA',Name:'CardstackCanonicalProbeTest',Body:'test',ApiVersion:67,Status:'Active'}];
 const sets=[{Id:'0PS000000000003GAA',Name:'Cardstack_User',HasActivationRequired:false},{Id:'0PS000000000004GAA',Name:'Cardstack_Admin',HasActivationRequired:false}];
 const actorProfile='00e000000000002AAA',guestProfile='00e000000000001AAA',guestPS='0PS000000000001GAA';
 const ps=[...sets,{Id:'0PS000000000002GAA',Name:'AdminProfile',ProfileId:actorProfile,IsOwnedByProfile:true},{Id:guestPS,Name:'GuestProfile',ProfileId:guestProfile,IsOwnedByProfile:true}];
 const foundationMetadata=[{fullName:'Cardstack_User',customPermissions:[{enabled:true,name:'Cardstack_Use_Connections'}]},{fullName:'Cardstack_Admin'}];
 const apps=['Card_Stack_SFAPP','B','C','D'].map((name,i)=>({name,id:['0X0000000000001CAA','0X0000000000002CAA','0X0000000000003CAA','0X0000000000004CAA'][i],lastModifiedDate:'2026-10-10T15:00:00.000Z',metadata:{fullName:name,label:name,contactEmail:'operator@example.invalid',distributionState:'Local',isProtected:false,orgScopedExternalApp:true}}));
 const resourceText='<html>café ✓</html>',resource={Id:'081000000000001AAA',Name:'CardstackCanonicalProbeUi',Body:'/services/data/v67.0/sobjects/StaticResource/081000000000001AAA/Body',ContentType:'text/html',CacheControl:'Private'};
 const tempSet={Id:'0PS000000000005GAA',Name:'Cardstack_Canonical_Probe',IsOwnedByProfile:false};
 const state={installed:false,incomplete:false,requestBody:resourceText,ui:null,queries:[],reads:[],provenance:[],appMetadataDrift:false};
 const complete=records=>({done:!state.incomplete,totalSize:records.length,records:structuredClone(records),...(state.incomplete?{nextRecordsUrl:'/private-page'}:{})});
 const assignment={Id:'0Pa000000000001CAA',PermissionSetId:sets[0].Id,AssigneeId:identity.actor,PermissionSetGroupId:null};
 const seaUse={Id:'0J0000000000002CAA',ParentId:sets[0].Id,SetupEntityId:'0CP000000000001GAA',SetupEntityType:'CustomPermission'};
 const c={version:'67.0',async query(q){state.queries.push(q);
  if(q.includes('FROM Site WHERE'))return complete([{Id:'0DM000000000001GAA',GuestUserId:'005000000000002AAA',Status:'Inactive',UrlPathPrefix:'cardstackauthprobe'}]);
  if(q.includes('FROM User WHERE'))return complete(q.includes(identity.actor)?[{Id:identity.actor,ProfileId:actorProfile,IsActive:true}]:[{Id:'005000000000002AAA',ProfileId:guestProfile}]);
  if(q.includes('FROM Profile WHERE'))return complete(q.includes(actorProfile)?[{Id:actorProfile,Name:'System Administrator'}]:[{Id:guestProfile,Name:'Guest'}]);
  if(q.includes('FROM PermissionSet WHERE')){
   if(q.includes('ProfileId='))return complete(ps.filter(r=>r.ProfileId&&(q.includes(r.ProfileId))));
   if(q.includes("Name='Cardstack_Canonical_Probe'"))return complete(state.installed?[tempSet]:[]);
   if(q.includes("Name IN ('Cardstack_User','Cardstack_Admin')"))return complete(sets);
   return complete([...ps,tempSet].filter(r=>q.includes("'"+r.Id+"'")));
  }
  if(q.includes('FROM PermissionSetAssignment WHERE'))return complete(q.includes(tempSet.Id)?[]:[assignment]);
  if(q.includes('FROM CustomPermission WHERE'))return complete([{Id:'0CP000000000001GAA',DeveloperName:'Cardstack_Use_Connections'}]);
  if(q.includes('FROM SetupEntityAccess WHERE')){
   if(q.includes('SetupEntityType=\'CustomPermission\''))return complete([seaUse]);
   if(q.includes('ParentId='))return complete([{Id:'0J0000000000001CAA',ParentId:guestPS,SetupEntityId:'02r000000000001AAA',SetupEntityType:'TabSet'}]);
   return complete(state.installed?[{Id:'0J0000000000003CAA',ParentId:tempSet.Id,SetupEntityId:classes[0].Id,SetupEntityType:'ApexClass'}]:[]);
  }
  if(q.includes('FROM ObjectPermissions WHERE'))return complete([]);
  if(q.includes('FROM StaticResource WHERE'))return complete(state.installed?[resource]:[]);
  if(q.includes('FROM PermissionSetGroupComponent WHERE'))return complete([]);
  throw Error('UNEXPECTED_TEST_QUERY');
 },tooling:{async query(q){state.queries.push(q);if(q.includes('FROM ApexPage WHERE'))return complete([{Id:'066000000000001AAA',Markup:'<apex:page>constant</apex:page>\n'}]);if(q.includes('FROM ApexClass WHERE'))return complete(state.installed?classes:[]);if(q.includes('FROM MetadataComponentDependency WHERE'))return complete([]);throw Error('UNEXPECTED_TEST_TOOLING_QUERY');}},
 metadata:{async list(types,version){assert.equal(version,'67.0');if(types[0].type==='Profile')return [{fullName:'Admin',id:actorProfile},{fullName:'Guest',id:guestProfile}];assert.deepEqual(types,[{type:'ExternalClientApplication'}]);return apps.map(a=>({fullName:a.name,id:a.id,lastModifiedDate:a.lastModifiedDate}));},async read(type,names){state.reads.push([type,names]);if(type==='CustomSite')return {fullName:'CardstackAuthDiscoveryProbe',active:false,indexPage:'CardstackSiteAuthProbeHome',urlPathPrefix:'cardstackauthprobe',siteAdmin:'admin@example.invalid',siteGuestRecordDefaultOwner:'owner@example.invalid'};if(type==='Profile')return {fullName:names,tabVisibilities:[{tab:'baseline',visibility:'DefaultOn'}]};if(type==='ExternalClientApplication'){const m=structuredClone(apps.find(a=>a.name===names).metadata);if(state.appMetadataDrift)m.label='modified';return m;}if(type==='PermissionSet'&&Array.isArray(names))return structuredClone(foundationMetadata);if(type==='PermissionSet')return {fullName:'Cardstack_Canonical_Probe',label:'Cardstack Canonical Probe',classAccesses:[{apexClass:'CardstackCanonicalProbe',enabled:true}],userPermissions:[{name:'ApiEnabled',enabled:true}]};throw Error('UNEXPECTED_TEST_METADATA_TYPE');}},
 async request(request,options){assert.equal(arguments.length,2);assert.deepEqual(request,{method:'GET',url:resource.Body});assert.deepEqual(options,{responseType:'text',followRedirect:false});return state.requestBody;}};
 const ui={source:'operator-ui',org:identity.org,controller:identity.actor,checkedAt:new Date(now-1000).toISOString(),metadataJobs:{complete:true,pending:[]},clientObservation:{name:'Cardstack Fresh Install QA',installedNameAbsent:true,draftInventory:'Unknown',coverage:'installed-only'},appPolicies:apps.map((a,i)=>({name:a.name,id:a.id,values:{source:'operator-ui',apiPolicyRead:'Unknown',...(i===0?{jwtEnabled:true}:{status:'Unknown'})}}))};state.ui=ui;
 const pins={...identity,siteId:'0DM000000000001GAA',guestUserId:'005000000000002AAA',guestProfileId:guestProfile,guestSetId:guestPS,pageId:'066000000000001AAA',siteBase:'https://fixture.example/cardstackauthprobe',constantPageMarkup:'<apex:page>constant</apex:page>\n',historicalApps:structuredClone(apps),foundationMetadata:structuredClone(foundationMetadata),resourceSha256:core.sha(Buffer.from(resourceText)),resourceByteLength:Buffer.byteLength(resourceText)};
 const api=createCollectors({pins,readUiEvidence:async()=>structuredClone(state.ui),recordProvenance:async p=>state.provenance.push(p),now:()=>now});
 return {api,state,c,pins,apps,resource,classes};
}
test('supported collector captures complete safe current metadata/relationships and preserves drafts/API policies Unknown',async()=>{
 const f=fixture(),s=await f.api.captureSnapshot({connection:f.c,identity});
 assert.equal(s.site.Id,'0DM000000000001GAA');assert.equal(s.siteMetadata.siteAdmin,'admin@example.invalid');assert.equal(s.guestGrants[0].ParentId,s.guestSet.Id);assert.equal(s.operatorUse.method,'directAssignment');assert.equal(s.operatorUse.hasActivationRequired,false);assert.equal(s.clientObservation.draftInventory,'Unknown');assert.equal(s.existingApps[0].policies.apiPolicyRead,'Unknown');assert.equal(s.existingApps[0].lastModifiedDate,'2026-10-10T15:00:00.000Z');assert.equal(s.foundation.assignments[0].permissionSetId,'0PS000000000003GAA');assert.equal(f.state.provenance.length,1);
 assert(!JSON.stringify(s).includes('checkedAt'));assert(!JSON.stringify(s).includes('screenshotSha256'));assert(!('clientDrafts' in s.collisions));
 core.validateSnapshot(s,identity,{pageSourceHash:core.sha(f.pins.constantPageMarkup.trim()),existingAppNames:f.apps.map(a=>a.name)});
 assert(f.state.reads.every(([type])=>['CustomSite','Profile','PermissionSet','ExternalClientApplication'].includes(type)));
});
test('CustomSite username references retain actual schema string values instead of being parsed as IDs',async()=>{
 const f=fixture(),read=f.c.metadata.read;f.c.metadata.read=async(type,names)=>{const r=await read(type,names);if(type==='CustomSite'){r.siteAdmin='admin@example.invalid';r.siteGuestRecordDefaultOwner='owner@example.invalid';}return r;};const s=await f.api.captureSnapshot({connection:f.c,identity});assert.equal(s.siteMetadata.siteAdmin,'admin@example.invalid');assert.equal(s.siteMetadata.siteGuestRecordDefaultOwner,'owner@example.invalid');
});
test('collector rejects incomplete queries, stale/unbound/absent UI proof and historical full metadata drift without provenance',async()=>{
 for(const mutate of [f=>f.state.incomplete=true,f=>f.state.ui.checkedAt=new Date(now-600001).toISOString(),f=>f.state.ui.controller='005000000000009AAA',f=>f.state.ui.metadataJobs.complete=false,f=>delete f.state.ui.clientObservation,f=>f.state.appMetadataDrift=true]){const f=fixture();mutate(f);await assert.rejects(f.api.captureSnapshot({connection:f.c,identity}));assert.equal(f.state.provenance.length,0);}
});
test('optional safe ECA descriptions preserve complete historical metadata; unknown/secret fields and description drift fail closed',async()=>{
 const make=()=>{const f=fixture();for(let i=1;i<4;i++){f.apps[i].metadata.description='Preserved fixture app '+i;f.pins.historicalApps[i].metadata.description=f.apps[i].metadata.description;}f.api=createCollectors({pins:f.pins,readUiEvidence:async()=>structuredClone(f.state.ui),recordProvenance:async p=>f.state.provenance.push(p),now:()=>now});return f;};
 const f=make(),s=await f.api.captureSnapshot({connection:f.c,identity});assert(!('description' in s.existingApps[0].metadata));for(let i=1;i<4;i++)assert.equal(s.existingApps[i].metadata.description,f.pins.historicalApps[i].metadata.description);assert.equal(f.state.provenance.length,1);
 for(const field of ['unreviewedSetting','consumerSecret']){const bad=make();bad.apps[1].metadata[field]='synthetic fixture value';bad.pins.historicalApps[1].metadata[field]='synthetic fixture value';bad.api=createCollectors({pins:bad.pins,readUiEvidence:async()=>bad.state.ui,recordProvenance:async p=>bad.state.provenance.push(p),now:()=>now});await assert.rejects(bad.api.captureSnapshot({connection:bad.c,identity}),/ECA_SAFE_SCHEMA/);assert.equal(bad.state.provenance.length,0);}
 const drift=make();drift.apps[1].metadata.description='Changed description';await assert.rejects(drift.api.captureSnapshot({connection:drift.c,identity}),/APP_METADATA_DRIFT/);assert.equal(drift.state.provenance.length,0);
});
test('same-name Site/page/guest rows cannot replace independently approved historical component identities',async()=>{
 for(const field of ['siteId','guestUserId','guestProfileId','guestSetId','pageId']){const f=fixture();f.pins[field]='005000000000099AAA';const api=createCollectors({pins:f.pins,readUiEvidence:async()=>f.state.ui,recordProvenance:async p=>f.state.provenance.push(p),now:()=>now});await assert.rejects(api.captureSnapshot({connection:f.c,identity}),/SITE_REUSE_BINDING|GUEST_REUSE_BINDING|PAGE_REUSE_BINDING/);assert.equal(f.state.provenance.length,0);}
});
test('installed collector follows only exact relative managed resource path and rejects malformed/invalid UTF8 bytes',async()=>{
 const f=fixture();f.state.installed=true;const r=await f.api.captureInstalled({connection:f.c});assert.equal(r.classes.length,2);assert.equal(r.resource.bytes.toString('utf8'),'<html>café ✓</html>');assert.equal(r.permissionSet.metadata.classAccesses[0].apexClass,'CardstackCanonicalProbe');
 for(const response of [null,{},'\uFFFD',Buffer.from([0xc3,0x28])]){f.state.requestBody=response;await assert.rejects(f.api.captureInstalled({connection:f.c}),/RESOURCE_RESPONSE|RESOURCE_UTF8|RESOURCE_HASH/);}
 const wrong=fixture();wrong.state.installed=true;wrong.resource.Body='https://foreign.invalid/body';await assert.rejects(wrong.api.captureInstalled({connection:wrong.c}),/RESOURCE_PATH/);
});
test('installed snapshot collects global owned references and maps profile/permission owners from actual PS rows',async()=>{
 const f=fixture();f.state.installed=true;const s=await f.api.captureSnapshot({connection:f.c,identity});assert.equal(s.references.complete,true);assert.deepEqual(s.references.records,[{ownerType:'PermissionSet',ownerId:'0PS000000000005GAA',entityType:'ApexClass',entityId:'01p000000000001AAA',enabled:true,accessId:'0J0000000000003CAA',parentId:'0PS000000000005GAA'}]);assert(f.state.queries.some(q=>q.includes('FROM MetadataComponentDependency WHERE RefMetadataComponentId IN')));assert(f.state.queries.some(q=>q.includes('FROM SetupEntityAccess WHERE SetupEntityId IN')));
});
