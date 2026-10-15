'use strict';
function normalizeId(value){
 if(typeof value!=='string'||!/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(value))throw Object.assign(new Error(),{safeCode:'INVALID_SALESFORCE_ID'});
 const base=value.substring(0,15),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';let suffix='';
 for(let block=0;block<3;block++){let bits=0;for(let i=0;i<5;i++)if(/[A-Z]/.test(base[block*5+i]))bits|=1<<i;suffix+=alphabet[bits];}
 const full=base+suffix;if(value.length===18&&value!==full)throw Object.assign(new Error(),{safeCode:'INVALID_SALESFORCE_ID_CHECKSUM'});return full;
}
function sameId(a,b){return normalizeId(a)===normalizeId(b);}
module.exports={normalizeId,sameId};
