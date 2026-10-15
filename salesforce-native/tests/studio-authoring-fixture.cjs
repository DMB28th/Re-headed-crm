const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../force-app/main/default/lwc/cardstackRecordAuthoring/cardstackRecordAuthoring.js','utf8').replace('export default recordAuthoring;','globalThis.recordAuthoring = recordAuthoring;');
function install(context) { vm.runInNewContext('(function(){'+source+'})();',context); }
function capability(objectApiName,fields,nativeKeyPrefix='001') {
 const supported=['STRING','TEXTAREA','BOOLEAN','INTEGER','DOUBLE','DECIMAL','CURRENCY','DATE','EMAIL','PHONE','URL','PICKLIST'];
 return {contractVersion:'record-edit-eligibility/v1',objectApiName,nativeKeyPrefix,eligible:true,exclusionReason:null,fields:fields.map(field=>{
  const type=field.type?.toUpperCase(),specialized=objectApiName==='Opportunity'&&field.api==='StageName';
  const eligible=!specialized&&supported.includes(type)&&(field.updateable===true||field.updateable==='true');
  return {fieldApi:field.api,label:field.label||field.api,dataType:field.type,nativeRequired:field.nillable!==true&&field.nillable!=='true',canClear:type!=='BOOLEAN'&&(field.nillable===true||field.nillable==='true'),length:field.length??255,precision:field.precision??18,scale:field.scale??(type==='INTEGER'?0:2),eligible,exclusionReason:eligible?null:specialized?'SPECIALIZED_STAGE_ACTION':supported.includes(type)?'FIELD_NOT_EDITABLE':'UNSUPPORTED_FIELD_TYPE'};
 })};
}
module.exports={install,capability};
