'use strict';
// Root-only Stage C journal. Imports perform no I/O. No alternate directory.
const fs=require('node:fs'),path=require('node:path');
const PRIVATE_DIR='/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/work/install-auth-state-validation/canonical-stage-c';
const stores=new WeakMap();
const need=(v,c)=>{if(!v)throw Error(c);};
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
function storeAt(dir){
 need(dir===PRIVATE_DIR,'PRIVATE_DIRECTORY');
 function directory(){
  const s=fs.lstatSync(dir);
  need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o700&&fs.realpathSync(dir)===dir,'PRIVATE_DIRECTORY');return s;
 }
 const original=directory();
 function check(){need(same(original,directory()),'PRIVATE_DIRECTORY');}
 function target(n){check();need(/^[a-z0-9-]+(?:-private)?\.json$/.test(n),'RECORD_NAME');return path.join(dir,n);}
 function privateRecord(s){need(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o600&&s.nlink===1,'PRIVATE_RECORD');return s;}
 function stat(t){try{return privateRecord(fs.lstatSync(t));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 function syncDirectory(){check();const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{need(same(original,fs.fstatSync(fd)),'PRIVATE_DIRECTORY');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 function create(n,v){
  const t=target(n),fd=fs.openSync(t,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{privateRecord(fs.fstatSync(fd));check();fs.writeFileSync(fd,JSON.stringify(v,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDirectory();
 }
 const store=Object.freeze({
  exists:n=>Boolean(stat(target(n))),
  read(n){const t=target(n),before=stat(t);need(before,'PRIVATE_RECORD');const fd=fs.openSync(t,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{need(same(before,privateRecord(fs.fstatSync(fd))),'PRIVATE_RECORD');check();return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}},
  create,
  lock(){const n='controller-lock-private.json';create(n,{pid:process.pid});const held=stat(target(n));return ()=>{const t=target(n);need(same(held,stat(t)||{}),'PRIVATE_RECORD');fs.unlinkSync(t);syncDirectory();};}
 });
 stores.set(store,check);return store;
}
async function verifyAuthority(args,identity){
 need(args?.approved===true&&args.approval?.stage==='C'&&args.approval.approved===true,'APPROVAL');
 const check=stores.get(args.store);need(typeof check==='function','STAGE_C_STORE');check();
 const {normalizeId}=require('./core.cjs');
 need(identity&&Object.keys(identity).length===2&&typeof identity.org==='string'&&typeof identity.actor==='string','ACTOR_BINDING');
 const who={org:normalizeId(identity.org),actor:normalizeId(identity.actor)};
 const admins=(Array.isArray(args.pins?.foundationBaseline?.assignments)?args.pins.foundationBaseline.assignments:[]).filter(a=>a.permissionSet==='Cardstack_Admin');
 need(admins.length===1&&who.org===normalizeId(args.pins.targetOrgId)&&who.actor===normalizeId(admins[0].assigneeId),'ACTOR_BINDING');
 need(typeof args.verifyStageBClosure==='function','STAGE_B_CLOSURE_REQUIRED');
 let closed;try{closed=await args.verifyStageBClosure({identity:{...who}});}catch{throw Error('STAGE_B_CLOSURE_UNPROVED');}
 need(closed===true,'STAGE_B_CLOSURE_UNPROVED');check();return who;
}
function verifyStore(store){const check=stores.get(store);need(typeof check==='function','STAGE_C_STORE');check();return true;}
module.exports={storeAt,verifyAuthority,verifyStore,PRIVATE_DIR};
