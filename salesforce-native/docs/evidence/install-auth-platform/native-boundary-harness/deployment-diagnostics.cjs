'use strict';
function category(e){
 if(e.safeCode)return e.safeCode;
 const code=String(e.code||e.errorCode||e.name||'');const message=String(e.message||'');
 if(/polling time out|timeout|timed out/i.test(message)||/timeout|ETIMEDOUT|ABORT_ERR/i.test(code))return 'METADATA_POLL_OR_REQUEST_TIMEOUT';
 if(/INVALID_SESSION_ID|INVALID_LOGIN|AUTHENTICATION_FAILURE/i.test(code+' '+message))return 'METADATA_AUTHENTICATION_FAILED';
 if(/ECONNRESET|ENOTFOUND|ECONNREFUSED|EPIPE|fetch failed|socket hang up/i.test(code+' '+message))return 'METADATA_TRANSPORT_FAILED';
 if(/ENOENT|EACCES|EPERM/.test(code))return 'LOCAL_ARTIFACT_ACCESS_FAILED';
 return 'METADATA_EXECUTION_FAILED';
}
module.exports={category};
