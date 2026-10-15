'use strict';
const {normalizeId}=require('./salesforce-id.cjs');
const normalizeRecords=(result,fields)=>{for(const row of result.records)for(const field of fields)if(row[field]!=null)row[field]=normalizeId(row[field]);return result;};
process.env.SF_LOG_LEVEL='fatal';process.env.SFDX_LOG_LEVEL='fatal';
const {Org}=require('/usr/local/lib/sf/node_modules/@salesforce/core');
const fs=require('node:fs');
const fail=code=>{const e=new Error(code);e.safeCode=code;throw e;};
const save=(name,data)=>{fs.writeFileSync(__dirname+'/'+name,JSON.stringify(data,null,2)+'\n',{mode:0o600});};
const report=(name,data)=>{const receipt={checkedAt:new Date().toISOString(),...data};save(name,receipt);console.log(JSON.stringify(receipt));};
async function connect(){const c=(await Org.create({aliasOrUsername:'cardstack-spike2'})).getConnection('67.0');await c.request(c.instanceUrl+'/services/data/v67.0/');return c;}
async function state(c){
 const sites=await c.query("SELECT Id,GuestUserId,Status,UrlPathPrefix FROM Site WHERE Name='CardstackAuthDiscoveryProbe'");
 if(sites.totalSize!==1)fail('SITE_NOT_UNIQUE');normalizeRecords(sites,['Id','GuestUserId']);const s=sites.records[0];
 if(s.UrlPathPrefix!=='cardstackauthprobe')fail('SITE_PREFIX_DRIFT');
 const users=await c.query("SELECT ProfileId FROM User WHERE Id='"+s.GuestUserId+"'");if(users.totalSize!==1)fail('GUEST_PROFILE_UNAVAILABLE');
 normalizeRecords(users,['Id','ProfileId']);const ps=await c.query("SELECT Id FROM PermissionSet WHERE ProfileId='"+users.records[0].ProfileId+"'");if(ps.totalSize!==1)fail('GUEST_PERMISSIONSET_NOT_UNIQUE');normalizeRecords(users,['Id','ProfileId']);normalizeRecords(ps,['Id']);const parent=ps.records[0].Id;
 const objects=await c.query("SELECT Id FROM ObjectPermissions WHERE ParentId='"+parent+"' AND (PermissionsRead=true OR PermissionsCreate=true OR PermissionsEdit=true OR PermissionsDelete=true OR PermissionsViewAllRecords=true OR PermissionsModifyAllRecords=true)");if(objects.totalSize!==0)fail('GUEST_OBJECT_GRANT_DRIFT');
 const page=await c.tooling.query("SELECT Id,Markup FROM ApexPage WHERE Name='CardstackSiteAuthProbeHome'");
 if(page.totalSize!==1||page.records[0].Markup.trim()!==fs.readFileSync(__dirname+'/reference/CardstackSiteAuthProbeHome.page','utf8').trim())fail('LANDING_PAGE_DRIFT');
 const cls=await c.tooling.query("SELECT Id FROM ApexClass WHERE Name='CardstackNativeApiBoundaryProbe'");if(cls.totalSize>1)fail('PROBE_NOT_UNIQUE');
 const grants=await c.query("SELECT Id,SetupEntityId,SetupEntityType FROM SetupEntityAccess WHERE ParentId='"+parent+"' AND SetupEntityType IN ('ApexClass','ApexPage')");
 normalizeRecords(page,['Id']);normalizeRecords(cls,['Id']);normalizeRecords(grants,['Id','SetupEntityId']);const owned=new Set([page.records[0].Id,...cls.records.map(x=>x.Id)]);
 if(grants.records.some(x=>!owned.has(x.SetupEntityId)))fail('UNOWNED_GUEST_GRANT_DRIFT');
 const exactGrantSet=grants.records.length===2&&!!cls.records[0]?.Id&&grants.records.some(x=>x.SetupEntityId===page.records[0].Id)&&grants.records.some(x=>x.SetupEntityId===cls.records[0].Id);
 return {exactGrantSet,inactive:s.Status!=='Active',parent,pageId:page.records[0].Id,classId:cls.records[0]?.Id,grants:grants.records};
}
module.exports={fs,fail,save,report,connect,state};
