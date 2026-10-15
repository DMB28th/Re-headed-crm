'use strict';
// Read-only source. Root supplies managed API67 connection and separately observed
// UI proof. No CLI, private files, auth readers, token handling, or mutations.
const {normalizeId:id,equal,sha,normalizeRecords,secretFree}=require('./core.cjs');
const need=(v,c)=>{if(!v)throw Error(c);},list=v=>v==null?[]:Array.isArray(v)?v:[v];
const quote=v=>"'"+String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const inIds=v=>v.map(x=>quote(id(x))).join(',');
const CLASS_NAMES="('CardstackCanonicalProbe','CardstackCanonicalProbeTest')";
const PROPOSED_APP='Cardstack_ChatGPT_Fresh_Install_QA';
const ECA_SAFE_FIELDS=['fullName','contactEmail','distributionState','isProtected','label','orgScopedExternalApp','description'];
async function rows(c,q,tooling=false){const r=await(tooling?c.tooling.query(q):c.query(q));need(r?.done===true&&!r.nextRecordsUrl&&Array.isArray(r.records)&&Number(r.totalSize)===r.records.length,'QUERY_INCOMPLETE');return normalizeRecords(r.records);}
async function one(c,q,tooling=false){const r=await rows(c,q,tooling);need(r.length===1,'ROW_COUNT');return r[0];}
async function read(c,type,names){
 const r=normalizeRecords(await c.metadata.read(type,names));const want=list(names),records=list(r);
 need(records.length===want.length&&want.every(n=>records.filter(x=>x?.fullName===n&&!x.errors).length===1),'METADATA_READ_INCOMPLETE');return Array.isArray(names)?records:records[0];
}
async function inventory(c,type){const r=normalizeRecords(list(await c.metadata.list([{type}],'67.0')));need(r.length<1000&&r.every(x=>x?.fullName&&x.id),'METADATA_LIST_INCOMPLETE');return r;}
function requireConnection(c){need(c?.version==='67.0'&&typeof c.query==='function'&&typeof c.tooling?.query==='function'&&typeof c.metadata?.read==='function'&&typeof c.metadata?.list==='function','API67_CONNECTION_REQUIRED');}
function checkUi(raw,identity,apps,now){
 secretFree(raw);const ui=normalizeRecords(raw),age=now-Date.parse(ui?.checkedAt);
 need(ui?.source==='operator-ui'&&ui.org===identity.org&&ui.controller===identity.actor&&Number.isFinite(age)&&age>=0&&age<600000,'UI_PROOF_BINDING');
 need(ui.metadataJobs?.complete===true&&Array.isArray(ui.metadataJobs.pending)&&ui.metadataJobs.pending.length===0,'METADATA_JOB_UI_PROOF');
 const client=ui.clientObservation;need(client?.name==='Cardstack Fresh Install QA'&&client.coverage==='installed-only'&&client.installedNameAbsent===true&&client.draftInventory==='Unknown','CLIENT_OBSERVATION_REQUIRED');
 need(ui.appPolicies?.length===4&&apps.every(a=>ui.appPolicies.filter(p=>p.id===a.id&&p.name===a.name).length===1),'APP_UI_BINDING');
 for(const p of ui.appPolicies){need(p.values&&p.values.apiPolicyRead==='Unknown'&&p.values.source==='operator-ui','POLICY_PROJECTION');need(!('checkedAt' in p.values)&&!('screenshotSha256' in p.values),'POLICY_PROVENANCE_SEPARATE');if(p.name==='Card_Stack_SFAPP')need(typeof p.values.jwtEnabled==='boolean','JWT_UI_OBSERVATION_REQUIRED');}
 return ui;
}
function createCollectors({pins,readUiEvidence,recordProvenance,verifyReviewedDateTransition,now=()=>Date.now()}){
 need(typeof readUiEvidence==='function'&&typeof recordProvenance==='function','ROOT_EVIDENCE_CALLBACKS_REQUIRED');
 const p=normalizeRecords(pins);need(p?.org&&p.actor&&p.siteBase&&typeof p.constantPageMarkup==='string'&&p.historicalApps?.length===4&&p.foundationMetadata?.length===2&&/^[a-f0-9]{64}$/.test(p.resourceSha256)&&Number.isInteger(p.resourceByteLength)&&p.resourceByteLength>0,'COLLECTOR_PINS');
 for(const key of ['siteId','guestUserId','guestProfileId','guestSetId','pageId'])need(typeof p[key]==='string'&&id(p[key])===p[key],'REUSE_PIN_REQUIRED');
 function bind(identity){const v=normalizeRecords(identity);need(v.org===p.org&&v.actor===p.actor,'ACTOR_BINDING');return v;}
 async function captureSnapshot({connection:c,identity}){
  requireConnection(c);const who=bind(identity);
  const operator=await one(c,"SELECT Id,ProfileId,IsActive FROM User WHERE Id="+quote(who.actor));need(operator.IsActive===true,'OPERATOR_ACTIVE');
  const site=await one(c,"SELECT Id,GuestUserId,Status,UrlPathPrefix FROM Site WHERE Name='CardstackAuthDiscoveryProbe'");
  need(site.Id===p.siteId&&site.GuestUserId===p.guestUserId,'SITE_REUSE_BINDING');
  const siteMetadata=await read(c,'CustomSite','CardstackAuthDiscoveryProbe');
  const guestUser=await one(c,'SELECT Id,ProfileId FROM User WHERE Id='+quote(site.GuestUserId));
  need(guestUser.Id===p.guestUserId&&guestUser.ProfileId===p.guestProfileId,'GUEST_REUSE_BINDING');
  const profileInventory=await inventory(c,'Profile');
  async function profileMeta(profileId){const matches=profileInventory.filter(r=>r.id===profileId);need(matches.length===1,'PROFILE_METADATA_BINDING');return read(c,'Profile',matches[0].fullName);}
  const operatorProfile=await one(c,'SELECT Id,Name FROM Profile WHERE Id='+quote(operator.ProfileId)),guestProfile=await one(c,'SELECT Id,Name FROM Profile WHERE Id='+quote(guestUser.ProfileId));
  const psFields='Id,Name,ProfileId,IsOwnedByProfile,PermissionsApiEnabled,PermissionsViewSetup,PermissionsViewAllData,PermissionsModifyAllData';
  const operatorPS=await one(c,'SELECT '+psFields+' FROM PermissionSet WHERE ProfileId='+quote(operator.ProfileId));
  const guestSet=await one(c,'SELECT '+psFields+' FROM PermissionSet WHERE ProfileId='+quote(guestProfile.Id));
  need(operatorPS.IsOwnedByProfile===true&&guestSet.IsOwnedByProfile===true,'PROFILE_PS_BINDING');
  need(guestProfile.Id===p.guestProfileId&&guestSet.Id===p.guestSetId&&guestSet.ProfileId===p.guestProfileId,'GUEST_REUSE_BINDING');
  const guestGrants=await rows(c,'SELECT Id,ParentId,SetupEntityId,SetupEntityType FROM SetupEntityAccess WHERE ParentId='+quote(guestSet.Id));
  const guestObjectPermissions=await rows(c,'SELECT Id,ParentId,SObjectType,PermissionsRead,PermissionsCreate,PermissionsEdit,PermissionsDelete,PermissionsViewAllRecords,PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId='+quote(guestSet.Id));
  const objectFlags=['PermissionsRead','PermissionsCreate','PermissionsEdit','PermissionsDelete','PermissionsViewAllRecords','PermissionsModifyAllRecords'];
  const guestObjectGrants=guestObjectPermissions.filter(r=>objectFlags.some(k=>r[k]===true));
  const page=await one(c,"SELECT Id,Markup FROM ApexPage WHERE Name='CardstackSiteAuthProbeHome'",true);need(page.Id===p.pageId,'PAGE_REUSE_BINDING');need(typeof page.Markup==='string'&&page.Markup.trim()===p.constantPageMarkup.trim(),'PAGE_SOURCE');
  const foundationSets=await rows(c,"SELECT Id,Name FROM PermissionSet WHERE Name IN ('Cardstack_User','Cardstack_Admin') AND IsOwnedByProfile=false");need(foundationSets.length===2&&equal(foundationSets.map(r=>r.Name),['Cardstack_User','Cardstack_Admin']),'FOUNDATION_SCOPE');
  const foundationMetadata=await read(c,'PermissionSet',['Cardstack_User','Cardstack_Admin']);need(equal(foundationMetadata,p.foundationMetadata),'FOUNDATION_DRIFT');
  const assignments=await rows(c,'SELECT Id,PermissionSetId,AssigneeId,PermissionSetGroupId FROM PermissionSetAssignment WHERE PermissionSetId IN ('+inIds(foundationSets.map(r=>r.Id))+')');
  const foundationAssignments=assignments.map(r=>{const set=foundationSets.find(s=>s.Id===r.PermissionSetId);need(set,'FOUNDATION_ASSIGNMENT_BINDING');return {Id:r.Id,permissionSet:set.Name,permissionSetId:r.PermissionSetId,assigneeId:r.AssigneeId,permissionSetGroupId:r.PermissionSetGroupId??null};});
  const operatorAssignments=await rows(c,'SELECT Id,PermissionSetId,AssigneeId,PermissionSetGroupId FROM PermissionSetAssignment WHERE AssigneeId='+quote(who.actor));
  const cp=await one(c,"SELECT Id,DeveloperName FROM CustomPermission WHERE DeveloperName='Cardstack_Use_Connections'");need(cp.DeveloperName==='Cardstack_Use_Connections','USE_PERMISSION_BINDING');
  const direct=operatorAssignments.filter(r=>r.PermissionSetGroupId==null);need(direct.length>0,'EXISTING_USE_REQUIRED');
  const directSets=await rows(c,'SELECT Id,Name,HasActivationRequired FROM PermissionSet WHERE Id IN ('+inIds([...new Set(direct.map(r=>r.PermissionSetId))])+')');
  const useGrants=await rows(c,'SELECT Id,ParentId,SetupEntityId,SetupEntityType FROM SetupEntityAccess WHERE ParentId IN ('+inIds(directSets.map(r=>r.Id))+') AND SetupEntityId='+quote(cp.Id)+" AND SetupEntityType='CustomPermission'");
  const eligible=useGrants.filter(r=>r.SetupEntityId===cp.Id&&r.SetupEntityType==='CustomPermission'&&directSets.some(s=>s.Id===r.ParentId&&s.HasActivationRequired===false)).sort((a,b)=>a.Id.localeCompare(b.Id));need(eligible.length>0,'EXISTING_USE_REQUIRED');
  const useGrant=eligible[0],useAssignment=direct.find(r=>r.PermissionSetId===useGrant.ParentId);need(useAssignment?.AssigneeId===who.actor,'USE_ASSIGNMENT_BINDING');
  const operatorUse={effective:true,...who,permission:'Cardstack_Use_Connections',method:'directAssignment',hasActivationRequired:false,assigneeId:who.actor,permissionSetId:useGrant.ParentId,assignmentId:useAssignment.Id,assignmentPermissionSetId:useAssignment.PermissionSetId,customPermissionId:cp.Id,setupEntityAccessId:useGrant.Id,setupEntityParentId:useGrant.ParentId,setupEntityId:useGrant.SetupEntityId,permissionName:cp.DeveloperName};
  const appInventory=await inventory(c,'ExternalClientApplication');
  need(appInventory.every(r=>p.historicalApps.some(a=>a.name===r.fullName)||r.fullName===PROPOSED_APP),'APP_INVENTORY_DRIFT');
  const existingApps=[];for(const historical of p.historicalApps){const matches=appInventory.filter(r=>r.fullName===historical.name);need(matches.length===1&&matches[0].id===historical.id&&Number.isFinite(Date.parse(matches[0].lastModifiedDate)),'APP_BINDING');const metadata=await read(c,'ExternalClientApplication',historical.name);need(Object.keys(metadata).every(k=>ECA_SAFE_FIELDS.includes(k)),'ECA_SAFE_SCHEMA');need(equal(metadata,historical.metadata),'APP_METADATA_DRIFT');existingApps.push({name:historical.name,id:historical.id,lastModifiedDate:matches[0].lastModifiedDate,metadata});}
  const ui=checkUi(await readUiEvidence({identity:who,appInventory:structuredClone(appInventory)}),who,existingApps,now());
  for(const a of existingApps)a.policies=ui.appPolicies.find(x=>x.id===a.id).values;
  await require('./dates.cjs').verifyReviewedDates({baselineApps:p.historicalApps,currentApps:existingApps,identity:who,transitions:ui.reviewedAppDateTransitions,verifyProof:verifyReviewedDateTransition,now:now()});
  const classes=await rows(c,'SELECT Id,Name FROM ApexClass WHERE Name IN '+CLASS_NAMES,true),resources=await rows(c,"SELECT Id,Name FROM StaticResource WHERE Name='CardstackCanonicalProbeUi'"),permissionSets=await rows(c,"SELECT Id,Name FROM PermissionSet WHERE Name='Cardstack_Canonical_Probe' AND IsOwnedByProfile=false");
  const targets=[...classes,...resources,...permissionSets].map(r=>r.Id),references=[];
  let dependencies=[],globalAccess=[];if(targets.length){dependencies=await rows(c,'SELECT MetadataComponentId,MetadataComponentName,MetadataComponentType,RefMetadataComponentId,RefMetadataComponentName,RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentId IN ('+inIds(targets)+')',true);globalAccess=await rows(c,'SELECT Id,ParentId,SetupEntityId,SetupEntityType FROM SetupEntityAccess WHERE SetupEntityId IN ('+inIds(targets)+')');
   const parentIds=[...new Set(globalAccess.map(r=>r.ParentId))],parents=parentIds.length?await rows(c,'SELECT Id,Name,ProfileId,IsOwnedByProfile FROM PermissionSet WHERE Id IN ('+inIds(parentIds)+')'):[];
   for(const r of globalAccess){const parent=parents.filter(x=>x.Id===r.ParentId);need(parent.length===1,'REFERENCE_OWNER_BINDING');references.push({ownerType:parent[0].ProfileId?'Profile':'PermissionSet',ownerId:parent[0].ProfileId||parent[0].Id,entityType:r.SetupEntityType,entityId:r.SetupEntityId,enabled:true,accessId:r.Id,parentId:r.ParentId});}
   for(const r of dependencies)references.push({ownerType:r.MetadataComponentType,ownerId:id(r.MetadataComponentId),entityType:r.RefMetadataComponentType,entityId:id(r.RefMetadataComponentId),ownerName:r.MetadataComponentName,entityName:r.RefMetadataComponentName});
  }
  const ownedAssignments=permissionSets.length?await rows(c,'SELECT Id,PermissionSetId,AssigneeId,PermissionSetGroupId FROM PermissionSetAssignment WHERE PermissionSetId IN ('+inIds(permissionSets.map(r=>r.Id))+')'):[];
  const ownedPermissionSetGroups=permissionSets.length?await rows(c,'SELECT Id,PermissionSetId,PermissionSetGroupId FROM PermissionSetGroupComponent WHERE PermissionSetId IN ('+inIds(permissionSets.map(r=>r.Id))+')'):[];
  const siteUrl=new URL(p.siteBase);
  const client=ui.clientObservation;
  const snapshot={identity:who,site,siteMetadata,siteContext:{baseUrl:p.siteBase,domain:siteUrl.hostname,urlPathPrefix:site.UrlPathPrefix},guestUser,guestProfile:{...guestProfile,metadata:await profileMeta(guestProfile.Id)},guestSet,guestGrants,guestObjectPermissions,guestObjectGrants,page:{id:page.Id,sourceHash:sha(page.Markup.trim())},foundation:{sets:foundationSets,metadata:foundationMetadata,assignments:foundationAssignments},operator:{...operator,profileName:operatorProfile.Name,profileMetadata:await profileMeta(operator.ProfileId),permissionSet:operatorPS,assignments:operatorAssignments,directPermissionSets:directSets,useGrants},operatorUse,existingApps,collisions:{classes,resources,permissionSets,apps:appInventory.filter(r=>r.fullName===PROPOSED_APP).map(r=>({Id:r.id,Name:r.fullName}))},clientObservation:{name:client.name,coverage:client.coverage,installedNameAbsent:client.installedNameAbsent,draftInventory:client.draftInventory},references:{complete:true,records:references},ownedAssignments,ownedPermissionSetGroups,metadataJobs:{complete:ui.metadataJobs.complete,pending:ui.metadataJobs.pending},completeness:{guestGrants:true,guestObjects:true,foundationAssignments:true,apps:true,collisions:true,metadataJobs:true}};
  secretFree(snapshot);
  // Root callback must durably append private600; never overwrite the historical
  // pins. Current dates/UI times/full available list projections stay in provenance.
  await recordProvenance({kind:'READONLY_SNAPSHOT',identity:who,checkedAt:new Date(now()).toISOString(),appInventory,profileInventory,uiEvidence:ui,dependencies,globalAccess});
  return snapshot;
 }
 async function captureInstalled({connection:c}){
  requireConnection(c);const classes=await rows(c,'SELECT Id,Name,Body,ApiVersion,Status FROM ApexClass WHERE Name IN '+CLASS_NAMES,true);need(classes.length===2&&equal(classes.map(r=>r.Name),['CardstackCanonicalProbe','CardstackCanonicalProbeTest']),'INSTALLED_CLASSES');
  const resource=await one(c,"SELECT Id,Name,Body,ContentType,CacheControl FROM StaticResource WHERE Name='CardstackCanonicalProbeUi'");
  const body=resource.Body,match=typeof body==='string'&&body.match(/^\/services\/data\/v67\.0\/sobjects\/StaticResource\/([A-Za-z0-9]{15}(?:[A-Z0-5]{3})?)\/Body$/);need(match&&id(match[1])===resource.Id,'RESOURCE_PATH');
  const response=await c.request({method:'GET',url:body},{responseType:'text',followRedirect:false});let text;
  if(Buffer.isBuffer(response)){try{text=new TextDecoder('utf-8',{fatal:true}).decode(response);}catch{throw Error('RESOURCE_UTF8');}}
  else{need(typeof response==='string','RESOURCE_RESPONSE');text=response;need(!text.includes('\uFFFD')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text),'RESOURCE_UTF8');}
  const bytes=Buffer.from(text,'utf8');need(bytes.length===p.resourceByteLength&&sha(bytes)===p.resourceSha256,'RESOURCE_HASH');
  const ps=await one(c,"SELECT Id,Name FROM PermissionSet WHERE Name='Cardstack_Canonical_Probe' AND IsOwnedByProfile=false"),metadata=await read(c,'PermissionSet','Cardstack_Canonical_Probe');
  return {classes:classes.map(r=>({id:r.Id,name:r.Name,source:r.Body,apiVersion:r.ApiVersion,status:r.Status})),resource:{id:resource.Id,name:resource.Name,bytes,contentType:resource.ContentType,cacheControl:resource.CacheControl},permissionSet:{id:ps.Id,name:ps.Name,metadata}};
 }
 return {captureSnapshot,captureInstalled};
}
module.exports={createCollectors,rows};
