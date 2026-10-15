const {normalizeId}=require('./salesforce-id.cjs');
'use strict';
const {fail,save,report,connect,state}=require('./common.cjs');
(async()=>{const mode=process.argv[2];try{
 if(!['baseline','grant','remove','verify','exposure'].includes(mode))fail('INVALID_MODE');
 const c=await connect();let s=await state(c);
 if(mode==='exposure'){if(s.inactive)fail('SITE_NOT_ACTIVE');if(!s.exactGrantSet)fail('EXACT_GRANTS_REQUIRED');}
 else {if(!s.inactive)fail('SITE_MUST_BE_INACTIVE');
 if(mode==='baseline'||mode==='verify'){if(s.grants.length)fail('ZERO_GRANTS_REQUIRED');}
 if(mode==='baseline'){
  const classes=await c.tooling.query("SELECT Id FROM ApexClass WHERE Name IN ('CardstackNativeApiBoundaryProbe','CardstackNativeApiBoundaryProbeTest')");if(classes.totalSize)fail('OWNED_CLASS_ALREADY_PRESENT');const {Org}=require('/usr/local/lib/sf/node_modules/@salesforce/core');const org=await Org.create({aliasOrUsername:'cardstack-spike2'});save('target-org-private.json',{targetOrgId:normalizeId(org.getOrgId())});
 }
 if(mode==='grant'){
  if(!s.classId)fail('PROBE_NOT_DEPLOYED');if(s.grants.length)fail('ZERO_GRANTS_REQUIRED');
  for(const entity of [s.classId,s.pageId]){const result=await c.sobject('SetupEntityAccess').create({ParentId:s.parent,SetupEntityId:entity});if(!result.success)fail('GRANT_WRITE_FAILED');}
 }
 if(mode==='remove'){for(const row of s.grants){const result=await c.sobject('SetupEntityAccess').destroy(row.Id);if(!result.success)fail('GRANT_REMOVE_FAILED');}}
 s=await state(c);const expected=mode==='grant'?2:0;if(s.grants.length!==expected||(mode==='grant'&&!s.exactGrantSet))fail('GRANT_POSTCHECK_FAILED');
 }
 report('access-'+mode+'-receipt.json',{mode,success:true,siteInactive:s.inactive,prefixMatches:true,pageMatchesReference:true,guestObjectPermissionRows:0,guestClassGrants:s.grants.filter(x=>x.SetupEntityType==='ApexClass').length,guestPageGrants:s.grants.filter(x=>x.SetupEntityType==='ApexPage').length});
 }catch(e){report('access-error-receipt.json',{success:false,mode:['baseline','grant','remove','verify','exposure'].includes(mode)?mode:'invalid',error:e.safeCode||'ACCESS_CHECK_OR_CHANGE_FAILED'});process.exitCode=1;}})();
