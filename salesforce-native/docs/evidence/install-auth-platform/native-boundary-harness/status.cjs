'use strict';
const {normalizeId}=require('./salesforce-id.cjs');
const {fs,fail,report,connect}=require('./common.cjs');const {category}=require('./deployment-diagnostics.cjs');
(async()=>{try{const mode=process.argv[2];if(!['deploy','update','cleanup'].includes(mode))fail('INVALID_MODE');
 const saved=JSON.parse(fs.readFileSync(__dirname+'/'+mode+'-job-private.json','utf8'));if(saved.mode!==mode||!/^0Af[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(saved.jobId))fail('PRIVATE_JOB_REFERENCE_REQUIRED');
 const c=await connect();const r=await c.metadata.checkDeployStatus(normalizeId(saved.jobId),true,true);
 const expected=new Set(['CardstackNativeApiBoundaryProbe','CardstackNativeApiBoundaryProbeTest']);const arr=x=>!x?[]:Array.isArray(x)?x:[x];
 report(mode+'-status-receipt.json',{readOnly:true,done:r.done===true,success:r.success===true,status:['Pending','InProgress','Succeeded','Failed','Canceled','Canceling','SucceededPartial','FinalizingDeploy','FinalizingFailed'].includes(r.status)?r.status:'other',componentErrors:Number(r.numberComponentErrors),componentsTotal:Number(r.numberComponentsTotal),testErrors:Number(r.numberTestErrors),testsCompleted:Number(r.numberTestsCompleted),coverage:arr(r.details?.runTestResult?.codeCoverage).filter(x=>expected.has(x.name)).map(x=>({name:x.name,locations:Number(x.numLocations),uncovered:Number(x.numLocationsNotCovered)}))});
 }catch(e){report('status-error-receipt.json',{readOnly:true,success:false,error:category(e)});process.exitCode=1;}})();
