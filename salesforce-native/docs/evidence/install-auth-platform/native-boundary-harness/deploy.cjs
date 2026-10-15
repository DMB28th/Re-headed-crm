'use strict';
const {normalizeId}=require('./salesforce-id.cjs');
const {Org}=require('/usr/local/lib/sf/node_modules/@salesforce/core');
const {fs,fail,save,report,state}=require('./common.cjs');
const {category}=require('./deployment-diagnostics.cjs');
const arr=x=>!x?[]:Array.isArray(x)?x:[x];
const expected=new Set(['CardstackNativeApiBoundaryProbe','CardstackNativeApiBoundaryProbeTest']);
const number=x=>Number.isFinite(Number(x))?Number(x):null;
const safeName=x=>expected.has(x)?x:'other';
function compileProblem(text){
 const allowed=[[/Method does not exist|incorrect signature/i,'Method does not exist or incorrect signature'],[/Invalid type|Unknown type/i,'Invalid or unknown type'],[/Unexpected token/i,'Unexpected token'],[/Variable does not exist/i,'Variable does not exist'],[/Missing.*[;}]|Expecting/i,'Missing or unexpected syntax'],[/Dependent class is invalid/i,'Dependent class is invalid'],[/Code coverage/i,'Code coverage requirement failed'],[/Cannot delete|referenced/i,'Component deletion blocked by dependency']];
 return allowed.find(([pattern])=>pattern.test(String(text)))?.[1]||'Unclassified compiler or metadata failure';
}
(async()=>{const mode=process.argv[2];const safeMode=['deploy','update','cleanup'].includes(mode)?mode:'invalid';const stages={connectionCreated:false,opaquePreconditionPassed:false,baselineChecked:false,submissionStarted:false,enqueued:false,pollingStarted:false,terminalResultReceived:false};let lastStatus='Unknown';const checkpoint=()=>save(safeMode+'-stage-receipt.json',{checkedAt:new Date().toISOString(),mode:safeMode,stages,lastStatus});checkpoint();try{
 if(!['deploy','update','cleanup'].includes(mode))fail('INVALID_MODE');
 const c=(await Org.create({aliasOrUsername:'cardstack-spike2'})).getConnection('67.0');
 stages.connectionCreated=true;checkpoint();
 const token=c.getAuthInfo().getConnectionOptions().accessToken;
 if(!token||/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token))fail('FRESH_OPAQUE_DEPLOYMENT_AUTH_REQUIRED');
 stages.opaquePreconditionPassed=true;checkpoint();
 const s=await state(c);if(!s.inactive||s.grants.length)fail('INACTIVE_ZERO_GRANTS_REQUIRED');
 if(mode==='deploy'){
  const b=JSON.parse(fs.readFileSync(__dirname+'/access-baseline-receipt.json','utf8'));if(!b.success||!b.siteInactive)fail('BASELINE_RECEIPT_REQUIRED');
  const existing=await c.tooling.query("SELECT Id FROM ApexClass WHERE Name IN ('CardstackNativeApiBoundaryProbe','CardstackNativeApiBoundaryProbeTest')");if(existing.totalSize)fail('OWNED_CLASS_ALREADY_PRESENT');
 }
 if(mode==='update'){const existing=await c.tooling.query("SELECT Id FROM ApexClass WHERE Name IN ('CardstackNativeApiBoundaryProbe','CardstackNativeApiBoundaryProbeTest')");if(existing.totalSize!==2)fail('EXPECTED_TWO_CLASSES_REQUIRED');}
 stages.baselineChecked=true;checkpoint();
 c.metadata.pollTimeout=120000;c.metadata.pollInterval=1000;
 const options={checkOnly:false,rollbackOnError:true,singlePackage:true,testLevel:mode==='cleanup'?'NoTestRun':'RunSpecifiedTests'};
 if(mode!=='cleanup')options.runTests=['CardstackNativeApiBoundaryProbeTest'];
 const zip=fs.readFileSync(__dirname+'/'+(mode==='cleanup'?'cleanup':'deploy')+'.zip');stages.submissionStarted=true;checkpoint();
 const job=c.metadata.deploy(zip,options);job.on('error',()=>{});
 const queued=await job;
 if(typeof queued.id!=='string'||!/^0Af[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(queued.id))fail('ENQUEUE_RESULT_UNAVAILABLE');
 save(mode+'-job-private.json',{jobId:normalizeId(queued.id),apiVersion:'67.0',mode,queuedAt:new Date().toISOString()});
 stages.enqueued=true;checkpoint();
 job.on('progress',progress=>{lastStatus=['Pending','InProgress','Canceling','FinalizingDeploy','FinalizingFailed'].includes(progress.status)?progress.status:'other';checkpoint();});
 stages.pollingStarted=true;checkpoint();const result=await job.complete(true);stages.terminalResultReceived=true;lastStatus=['Succeeded','Failed','Canceled','SucceededPartial'].includes(result.status)?result.status:'other';checkpoint();
 const receipt={mode,success:result.success===true,done:result.done===true,status:['Succeeded','Failed','Canceled','SucceededPartial'].includes(result.status)?result.status:'other',componentErrors:result.numberComponentErrors,componentsTotal:result.numberComponentsTotal,testErrors:result.numberTestErrors,testsCompleted:result.numberTestsCompleted};
 receipt.coverage=arr(result.details?.runTestResult?.codeCoverage).filter(x=>expected.has(x.name)).map(x=>({name:safeName(x.name),locations:number(x.numLocations),uncovered:number(x.numLocationsNotCovered)}));
 if(!result.success){receipt.error='METADATA_DEPLOYMENT_REJECTED';receipt.componentFailures=arr(result.details?.componentFailures).map(x=>({name:safeName(x.fullName),line:number(x.lineNumber),problem:compileProblem(x.problem)}));receipt.testFailures=arr(result.details?.runTestResult?.failures).map(x=>({name:safeName(x.name),method:['shouldMatchOnlyApprovedPaths','shouldDenyGuestClassification','shouldReturnOnlyBooleansWithoutDataAccess','shouldRejectNestedPath'].includes(x.methodName)?x.methodName:'other',problem:compileProblem(x.message)}));}
 if(mode==='cleanup'&&result.success){const q=await c.tooling.query("SELECT Id FROM ApexClass WHERE Name IN ('CardstackNativeApiBoundaryProbe','CardstackNativeApiBoundaryProbeTest')");receipt.ownedClassesAbsent=q.totalSize===0;if(!receipt.ownedClassesAbsent)fail('CLEANUP_CLASSES_REMAIN');}
 report(mode+'-receipt.json',{...receipt,stages});if(!receipt.success)process.exitCode=1;
 }catch(e){report(safeMode+'-error-receipt.json',{success:false,error:category(e),stages,lastStatus,jobIdSaved:stages.enqueued,deploymentOutcome:stages.enqueued?'Unknown; use read-only status before any retry':'Unknown; inspect Deployment Status before any retry'});process.exitCode=1;}})();
