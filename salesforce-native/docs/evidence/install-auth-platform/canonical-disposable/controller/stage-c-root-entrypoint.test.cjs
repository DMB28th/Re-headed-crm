'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const composition=path.resolve(__dirname,'../../../../../../.superpowers/sdd/2026-10-08-mcp-apps-install-auth/task-12-root-composition');
// Execute the real CLI catch paths, replacing all runtime dependencies and the
// filesystem/store boundary. No actual C directory, SDK or provider is touched.
async function rejectedCli(name,error){
 const filename=path.join(composition,name),source=fs.readFileSync(filename,'utf8'),module={exports:{}},output=[],dir='/synthetic/canonical-stage-c';
 let finish;const completed=new Promise(resolve=>{finish=resolve;});
 const processBoundary={env:{},argv:name==='run-step.cjs'?['node',filename,'snapshot','config-private.json','--stage-c-approved']:['node',filename,'config-private.json','--stage-c-approved']};
 Object.defineProperty(processBoundary,'exitCode',{set(value){this.exitStatus=value;finish();}});
 const store={read(record){assert.equal(record,'config-private.json');return {};}};
 const requireBoundary=specifier=>{
  if(specifier.endsWith('/core.cjs'))return {secretFree(){},snapshot(){assert.fail('step must not execute');}};
  if(specifier.endsWith('/access.cjs')||specifier.endsWith('/cleanup.cjs'))return {};
  if(specifier.endsWith('/stage-c-session.cjs'))return {storeAt(actual){assert.equal(actual,dir);return store;}};
  if(specifier==='./runtime-context.cjs')return {async createContext(config){assert.deepEqual(config,{});throw error;}};
  assert.fail('Unapproved dependency: '+specifier);
 };
 requireBoundary.main=module;
 const context={require:requireBoundary,module,exports:module.exports,__dirname:dir,process:processBoundary,console:{log(value){output.push(value);}}};
 vm.runInNewContext(source,context,{filename});await completed;
 return {output,exitCode:processBoundary.exitStatus};
}
const entries=[['run-route-observation.cjs','ROUTE_OBSERVATION_GUARD_OR_OUTCOME_UNRESOLVED'],['run-step.cjs','CANONICAL_STEP_GUARD_OR_OUTCOME_UNRESOLVED']];
for(const [name,safeError] of entries)for(const message of ['PRIVATE_TOKEN','PROVIDER_DENIED','TOKEN_SESSION_PRIVATE','Provider denied token secret','private https://provider.invalid/session?id=secret','ROOT_CONFIG_SCHEMA']){
 test(name+' emits only fixed safe JSON for '+message.split(' ')[0],async()=>{
  const result=await rejectedCli(name,Error(message));
  assert.equal(result.exitCode,1);assert.deepEqual(result.output,[JSON.stringify({success:false,error:safeError})]);assert(!result.output[0].includes(message));
 });
}
for(const [name,safeError] of entries)test(name+' never accesses a rejected object message getter',async()=>{
 let reads=0;const poisoned={get message(){reads++;throw Error('PRIVATE_MESSAGE_GETTER');}};
 const result=await rejectedCli(name,poisoned);assert.equal(reads,0);assert.equal(result.exitCode,1);assert.deepEqual(result.output,[JSON.stringify({success:false,error:safeError})]);
});
