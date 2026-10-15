'use strict';
// Binding layer only. Root supplies an existing API67 managed connection and
// reviewed read-only collectors. This module never imports Salesforce core.
const {normalizeId}=require('./core.cjs');
const need=(v,c)=>{if(!v)throw Error(c);};
const qstr=v=>String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
function createRootAdapter({connection:c,orgId,username,captureSnapshot,captureInstalled}){
 need(c&&typeof c.query==='function'&&typeof username==='string'&&username.length>0&&typeof captureSnapshot==='function'&&typeof captureInstalled==='function','ROOT_ADAPTER_INPUT');
 const org=normalizeId(orgId);
 return {
  async identity(){const r=await c.query("SELECT Id FROM User WHERE Username='"+qstr(username)+"'");need(r.done!==false&&!r.nextRecordsUrl&&r.totalSize===1&&r.records?.length===1,'QUERY_INCOMPLETE');return {org,actor:normalizeId(r.records[0].Id)};},
  snapshot:identity=>captureSnapshot({connection:c,identity}),
  installed:()=>captureInstalled({connection:c}),
  async enqueue(zip,options){const job=c.metadata.deploy(zip,options);if(typeof job.on==='function')job.on('error',()=>{});return await job;},
  async status(jobId,includeDetails,retrieveResult){need(includeDetails===true&&retrieveResult===true,'STATUS_OPTIONS');return c.metadata.checkDeployStatus(normalizeId(jobId),true,true);}
 };
}
module.exports={createRootAdapter};
