'use strict';
// Root-only, read-only evidence callback. Import performs no filesystem I/O.
const fs=require('node:fs'),path=require('node:path'),core=require('./core.cjs');
const {PRIVATE_DIR}=require('./stage-b-session.cjs');
const need=(v,c)=>{if(!v)throw Error(c);};
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const exact=core.guestMetadataEqual;
const names=['intent','result','ui','before','after'].map(n=>'root-site-restoration-'+n+'-private.json').concat('root-site-restoration-inactive.png');
const sealName='root-site-restoration-evidence-seal-private.json';
function keys(v,k){return v&&typeof v==='object'&&!Array.isArray(v)&&exact(Object.keys(v),k);}
function id(v){need(typeof v==='string'&&v.length===18&&core.normalizeId(v)===v,'RESTORATION_ID');return v;}
function date(v){need(typeof v==='string'&&Number.isFinite(Date.parse(v)),'RESTORATION_CHRONOLOGY');return Date.parse(v);}
function createRootRestorationEvidenceReader({dir,baseline}){
 need(dir===PRIVATE_DIR,'PRIVATE_DIRECTORY');
 const b=structuredClone(baseline);
 need(b?.snapshot&&b.binding===core.digest(b.snapshot),'BASELINE_BINDING');
 need(keys(b.snapshot.identity,['org','actor']),'RESTORATION_ID');
 id(b.snapshot.identity.org);id(b.snapshot.identity.actor);id(b.snapshot.site?.Id);id(b.snapshot.site?.GuestUserId);
 need(b.snapshot.site.Status==='Inactive'&&b.snapshot.site.UrlPathPrefix==='cardstackauthprobe','RESTORATION_SITE');
 function directory(){const s=fs.lstatSync(dir);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o700&&fs.realpathSync(dir)===dir,'PRIVATE_DIRECTORY');return s;}
 const original=directory();
 function check(){need(same(original,directory()),'PRIVATE_DIRECTORY');}
 function privateFile(s){need(s&&s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o600&&s.nlink===1,'PRIVATE_RECORD');return s;}
 function read(name){
  check();const target=path.join(dir,name),before=privateFile(fs.lstatSync(target));
  const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
   const opened=privateFile(fs.fstatSync(fd));need(same(before,opened),'PRIVATE_RECORD');check();
   const bytes=fs.readFileSync(fd);const after=privateFile(fs.fstatSync(fd));
   need(same(opened,after)&&opened.size===after.size&&opened.mtimeMs===after.mtimeMs&&opened.birthtimeMs===after.birthtimeMs,'PRIVATE_RECORD');
   need(same(after,privateFile(fs.lstatSync(target))),'PRIVATE_RECORD');check();return {bytes,stat:after};
  }finally{fs.closeSync(fd);}
 }
 return async ({intent,result})=>{
  core.secretFree({intent,result});
  const entries=Object.fromEntries(names.map(n=>[n,read(n)]));
  const seal=JSON.parse(read(sealName).bytes.toString('utf8'));
  need(keys(seal,names)&&names.every(n=>typeof seal[n]==='string'&&/^[a-f0-9]{64}$/.test(seal[n])&&seal[n]===core.sha(entries[n].bytes)),'RESTORATION_SEAL');
  const [i,r,u,before,after]=names.slice(0,5).map(n=>JSON.parse(entries[n].bytes.toString('utf8')));
  core.secretFree({i,r,u,before,after});
  need(exact(i,intent)&&exact(r,result),'RESTORATION_INPUT');
  need(keys(i,['kind','version','org','controller','siteId','siteName','fromActive','toActive','baselineBinding','ownedDigest','accessPreparationDigest','priorJournalDigest','checkedAt'])&&keys(r,['source','org','controller','siteId','active','savedVerified','checkedAt','intentDigest']),'RESTORATION_SCHEMA');
  const identity=b.snapshot.identity,siteId=b.snapshot.site.Id;
  for(const v of [i,r]){id(v.org);id(v.controller);id(v.siteId);need(v.org===identity.org&&v.controller===identity.actor&&v.siteId===siteId,'RESTORATION_BINDING');}
  need(i.kind==='ROOT_SITE_RESTORATION_INTENT'&&i.version===1&&i.siteName==='CardstackAuthDiscoveryProbe'&&i.fromActive===true&&i.toActive===false&&i.baselineBinding===b.binding&&['ownedDigest','accessPreparationDigest','priorJournalDigest'].every(k=>typeof i[k]==='string'&&/^[a-f0-9]{64}$/.test(i[k])),'RESTORATION_BINDING');
  need(r.source==='operator-ui'&&r.active===false&&r.savedVerified===true&&r.intentDigest===core.digest(i),'RESTORATION_RESULT');
  need(keys(u,['checkedAt','proof','ax'])&&exact(u.proof,r)&&u.checkedAt===r.checkedAt&&typeof u.ax==='string'&&/^\s*\d+ link Activate, Help: Activate - Record 1 - Cardstack Auth Discovery Probe, Value: [^\r\n]+\s*$/m.test(u.ax)&&!/Deactivate|Insufficient Privileges/i.test(u.ax),'RESTORATION_UI');
  need(keys(before,['checkedAt','identity','priorJournalDigest','site'])&&keys(after,['checkedAt','identity','site'])&&before.priorJournalDigest===i.priorJournalDigest,'RESTORATION_REST');
  for(const [record,status] of [[before,'Active'],[after,'Inactive']]){
   need(keys(record.identity,['org','actor']),'RESTORATION_ID');id(record.identity.org);id(record.identity.actor);
   need(exact(record.identity,identity)&&keys(record.site,['done','totalSize','records'])&&record.site.done===true&&record.site.totalSize===1&&Array.isArray(record.site.records)&&record.site.records.length===1,'RESTORATION_REST');
   const row=record.site.records[0];id(row?.Id);
   // Preserve and compare ALL original Site keys, including attributes.
   need(exact(row,{...b.snapshot.site,Status:status}),'RESTORATION_SITE');
  }
  const ti=date(i.checkedAt),tr=date(r.checkedAt),tb=date(before.checkedAt),ta=date(after.checkedAt);
  need(ti>=tb&&tr>ti&&ta>=tr&&ta<=Date.now(),'RESTORATION_CHRONOLOGY');
  const si=entries[names[0]].stat,sr=entries[names[1]].stat;
  need([si.birthtimeMs,si.mtimeMs,sr.birthtimeMs,sr.mtimeMs].every(Number.isFinite)&&si.birthtimeMs<=sr.birthtimeMs&&si.mtimeMs<=sr.mtimeMs,'RESTORATION_PERSISTENCE');
  check();return {verified:true,intentDigest:core.digest(i),resultDigest:core.digest(r),intentPersistedBeforeUi:true,actualSavedUiVerified:true,restSiteInactiveVerified:true,identity:structuredClone(identity),siteId};
 };
}
module.exports={createRootRestorationEvidenceReader};
