<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-tAKQ+y9YDUp0AlkCEe7tzRszJt1EPl+A/9gafChdyKg='; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Cardstack synthetic Studio preview</title>
<style>:root {
  font-family: var(--font-sans, system-ui, sans-serif);
  color: var(--color-text-primary, #202c3c);
  background: var(--color-background-primary, #fff);
  font-size: 14px;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  padding: var(--workspace-safe-top, 12px) var(--workspace-safe-right, 12px)
    var(--workspace-safe-bottom, 12px) var(--workspace-safe-left, 12px);
}
main {
  max-width: var(--workspace-max-width, 800px);
  margin: auto;
  min-width: 0;
}
.workspace {
  display: flex;
  flex-direction: column;
  height: calc(
    var(--workspace-height, 500px) - var(--workspace-safe-top, 12px) -
      var(--workspace-safe-bottom, 12px)
  );
  min-height: 0;
  border: 1px solid var(--color-border-primary, #d6dde5);
  border-radius: var(--border-radius-md, 8px);
  overflow: hidden;
  background: var(--color-background-primary, #fff);
}
.workspace-header {
  flex: none;
  padding: 14px 18px 10px;
  background: var(--color-background-secondary, #f6f8fa);
  border-bottom: 1px solid var(--color-border-primary, #d6dde5);
}
.workspace-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 14px 18px;
}
.workspace-actions {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 18px;
  border-top: 1px solid var(--color-border-primary, #d6dde5);
  background: var(--color-background-primary, #fff);
}
.workspace-actions:empty {
  display: none;
}
h1 {
  font-size: 1.3rem;
  margin: 2px 0 6px;
  overflow-wrap: anywhere;
}
h2 {
  font-size: 1.08rem;
  margin: 0 0 14px;
}
h3 {
  font-size: 0.95rem;
  margin: 10px 0;
}
p {
  line-height: 1.45;
}
.object-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.status {
  margin: 4px 0 0;
  color: var(--color-text-secondary, #536277);
  font-size: 0.86rem;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0 0 18px;
  min-width: 0;
}
legend {
  font-weight: 600;
  width: 100%;
  padding: 7px 9px;
  margin: 0 0 12px;
  background: var(--color-background-secondary, #f6f8fa);
  border-bottom: 1px solid var(--color-border-primary, #d6dde5);
}
.field-grid {
  display: grid;
  gap: 14px 18px;
}
.columns-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.columns-1 {
  grid-template-columns: minmax(0, 1fr);
}
.field {
  min-width: 0;
}
label {
  display: block;
  font-weight: 600;
  font-size: 0.88rem;
}
input:not([type="checkbox"]),
select,
textarea {
  display: block;
  width: 100%;
  margin-top: 5px;
  padding: 8px 10px;
  border: 1px solid var(--color-border-primary, #b9c2cc);
  border-radius: 4px;
  color: inherit;
  background: var(--color-background-primary, #fff);
  font: inherit;
  min-height: 36px;
}
input[type="checkbox"] {
  width: 17px;
  height: 17px;
  vertical-align: middle;
  accent-color: var(--color-text-info, #1559ad);
}
.clear {
  font-weight: 400;
  margin-top: 6px;
  font-size: 0.8rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
button {
  padding: 8px 13px;
  font: inherit;
  font-weight: 600;
  color: var(--color-text-inverse, #fff);
  background: var(--color-text-info, #1559ad);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  min-height: 38px;
}
button[data-action="cancel"],
button[data-action="back"],
button[data-action="refresh"],
button[data-action="resume"] {
  background: var(--color-background-primary, #fff);
  color: var(--color-text-primary, #202c3c);
  border-color: var(--color-border-primary, #b9c2cc);
}
button[data-action="review"],
button[data-action="confirm"] {
  margin-left: auto;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
h2:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--color-text-info, #307ad2);
  outline-offset: 2px;
}
.error {
  color: var(--color-text-danger, #ae1e1e);
  margin: 6px 0 0;
  font-size: 0.85rem;
}
[aria-invalid="true"] {
  border-color: var(--color-text-danger, #ae1e1e) !important;
}
small {
  display: block;
  margin-top: 5px;
  color: var(--color-text-secondary, #536277);
  overflow-wrap: anywhere;
  font-size: 0.78rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
th,
td {
  text-align: left;
  padding: 9px 6px;
  border-bottom: 1px solid var(--color-border-primary, #d6dde5);
  overflow-wrap: anywhere;
  vertical-align: top;
}
thead th {
  font-size: 0.8rem;
  color: var(--color-text-secondary, #536277);
}
tbody th {
  font-weight: 500;
}
dl {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 2fr;
  gap: 9px;
  margin: 10px 0 16px;
}
dt {
  color: var(--color-text-secondary, #536277);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.receipt {
  padding: 12px;
  border: 1px solid var(--color-border-primary, #d6dde5);
  border-radius: 6px;
}
.receipt h3 {
  margin-top: 0;
}
.receipt p {
  margin: 6px 0;
}
summary {
  cursor: pointer;
  margin-top: 10px;
  font-weight: 600;
}
.synthetic {
  background: #fff1ce;
  color: #513c00;
  padding: 10px;
  border-radius: 4px;
  font-weight: 600;
}
nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
nav label {
  font-size: 12px;
}
.preview-tools {
  max-width: 800px;
  margin: auto;
}
.preview-tools select {
  max-width: 320px;
}
:is(
  [data-workspace-size="flow"] .workspace,
  .workspace[data-chrome-fit="flow"]
) {
  height: auto;
  overflow: visible;
}
:is([data-workspace-size="flow"] .workspace, .workspace[data-chrome-fit="flow"])
  .workspace-actions {
  order: -1;
  border-top: 0;
  border-bottom: 1px solid var(--color-border-primary, #d6dde5);
}
:is([data-workspace-size="flow"] .workspace, .workspace[data-chrome-fit="flow"])
  .workspace-content {
  overflow: visible;
}
@media (max-width: 520px) {
  .columns-2 {
    grid-template-columns: minmax(0, 1fr);
  }
  .workspace-header,
  .workspace-content {
    padding: 12px;
  }
  .workspace-actions {
    padding: 8px;
    gap: 6px;
  }
  .workspace-actions button {
    flex: 1 1 120px;
  }
  h1 {
    font-size: 1.15rem;
  }
  th,
  td {
    padding: 8px 4px;
  }
  dl {
    grid-template-columns: 1fr 1.5fr;
  }
}

.delivery-qa {
  border: 1px solid var(--color-border-primary, #d6dde5);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}
.delivery-qa summary {
  cursor: pointer;
  font-weight: 600;
}
.delivery-qa-controls,
.delivery-qa form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.delivery-qa input {
  flex: 1 1 190px;
  min-width: 0;
}
.delivery-qa button,
.delivery-qa select,
.delivery-qa input {
  font-size: 12px;
  padding: 6px 8px;
}
</style></head><body><main id="root"></main><script>(()=>{var te=t=>typeof t=="string"&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(t),pe=["STRING","TEXTAREA","BOOLEAN","INTEGER","DATE","DECIMAL","DOUBLE","CURRENCY","EMAIL","PHONE","URL","PICKLIST"],xe=["EMAIL","PHONE","URL","PICKLIST"],qe=[{label:"Synthetic option A",value:"SYNTHETIC_A"},{label:"Synthetic option B",value:"SYNTHETIC_B"}],ee=(t,e)=>typeof t=="string"&&t.length>0&&t.length<=e&&!/[\u0000-\u001f\u007f<>]/.test(t);function et(t,e){if(!t||t.contractVersion!=="record-edit-eligibility/v1"||t.objectApiName!==e||!te(e)||typeof t.eligible!="boolean"||!Array.isArray(t.fields)||t.fields.length>2e3||t.eligible&&!/^[A-Za-z0-9]{3}$/.test(t.nativeKeyPrefix||""))throw Error("Native edit metadata is unavailable or malformed.");if(!t.eligible){if(!ee(t.exclusionReason,256))throw Error("Native edit metadata is malformed.");return t}let a=new Set;for(let i of t.fields)if(!i||!te(i.fieldApi)||a.has(i.fieldApi.toLowerCase())||!ee(i.label,256)||typeof i.dataType!="string"||typeof i.nativeRequired!="boolean"||typeof i.canClear!="boolean"||typeof i.eligible!="boolean"||!["length","precision","scale"].every(r=>Number.isInteger(i[r])&&i[r]>=0)||!i.eligible&&!ee(i.exclusionReason,256)||i.eligible&&(!pe.includes(i.dataType.toUpperCase())||i.nativeRequired&&i.canClear||i.dataType.toUpperCase()==="BOOLEAN"&&i.canClear||["INTEGER","DECIMAL","DOUBLE","CURRENCY"].includes(i.dataType.toUpperCase())&&(i.precision<1&&i.dataType.toUpperCase()!=="INTEGER"||i.precision>28||i.scale>i.precision||i.dataType.toUpperCase()==="INTEGER"&&i.scale!==0))||(a.add(i.fieldApi.toLowerCase()),i.eligible&&xe.includes(i.dataType.toUpperCase())&&(i.length<1||i.length>131072)))throw Error("Native edit field metadata is malformed.");return JSON.parse(JSON.stringify(t))}function je(t,e,a){if(!t?.eligible)return[];let i=new Set((a.fieldDenylist||[]).map(s=>s.trim().toLowerCase())),r=new Set;return e.filter(s=>!(t.fields.find(f=>f.fieldApi===s.api)?.eligible&&!i.has(s.api.toLowerCase())&&e.filter(f=>f.api===s.api).every(f=>f.editable&&!f.readOnly))||r.has(s.api)?!1:(r.add(s.api),!0)).map(s=>({label:s.label||t.fields.find(n=>n.fieldApi===s.api).label,value:s.api}))}function Ue(t,e,a,i){let r=t.mappings;if(t.flowApiName!=null||!Array.isArray(r)||r.length<1||r.length>20||r.some(l=>!l||!te(l.fieldApi)||l.source!=="current"||l.sourceField!=null||l.value!=null)||new Set(r.map(l=>l.fieldApi.toLowerCase())).size!==r.length)return["Choose one to twenty distinct fields with current-value mappings only."];if(!e?.eligible||!Array.isArray(e.fields))return["Native edit metadata is unavailable."];let s=[];if(r.forEach(l=>{let f=e.fields.find(E=>E.fieldApi===l.fieldApi);(!f?.eligible||typeof f.dataType!="string"||!pe.includes(f.dataType.toUpperCase()))&&s.push(`${l.fieldApi}: native editor field unavailable (${f?.exclusionReason||"UNKNOWN_OR_NONCANONICAL_FIELD"}).`)}),s.length||t.enabled===!1)return s;i.writeEnabled||s.push("Enable chat edits in Permissions before enabling this action. Drafts do not grant Salesforce access.");let n=new Set(je(e,a,i).map(l=>l.value));return r.forEach(l=>{n.has(l.fieldApi)||s.push(`${l.fieldApi}: expose an eligible native field and enable editing in every placement; Salesforce update access is required.`)}),s}function _e(t){let e=t.dataType.toUpperCase();return e==="BOOLEAN"?"false":e==="DATE"?"2026-11-30":["INTEGER","DECIMAL","DOUBLE","CURRENCY"].includes(e)?"0":e==="PICKLIST"?"SYNTHETIC_A":e==="EMAIL"?"synthetic@example.invalid".slice(0,t.length):e==="PHONE"?"+1 555 0100".slice(0,t.length):e==="URL"?"https://example.invalid".slice(0,t.length):(e==="TEXTAREA"?"Synthetic description":"Synthetic text").slice(0,t.length||255)}function tt(t,e,a,i){return Ue({...t,enabled:!0},e,a,i).length?[]:t.mappings.map(r=>{let s=e.fields.find(l=>l.fieldApi===r.fieldApi),n=s.nativeRequired||a.some(l=>l.api===s.fieldApi&&l.required===!0);return{fieldApi:s.fieldApi,label:s.label,dataType:s.dataType.toUpperCase(),required:n,canClear:s.canClear&&!n,length:s.length,precision:s.dataType.toUpperCase()==="INTEGER"&&s.precision===0?10:s.precision,scale:s.scale,choices:s.dataType.toUpperCase()==="PICKLIST"?qe.map(l=>({...l})):[],value:_e(s),...s.dataType.toUpperCase()==="CURRENCY"?{currencyCode:"USD"}:{}}})}function at(t){if(!Array.isArray(t)||t.length<1||t.length>20)throw Error("Invalid fields");let e=new Set;return t.map(a=>{if(!a||Object.keys(a).some(r=>!["fieldApi","label","dataType","required","canClear","length","precision","scale","choices","value","currencyCode"].includes(r))||!te(a.fieldApi)||e.has(a.fieldApi)||!ee(a.label,256)||!pe.includes(a.dataType)||typeof a.required!="boolean"||typeof a.canClear!="boolean"||a.required&&a.canClear||a.dataType==="BOOLEAN"&&a.canClear||!Array.isArray(a.choices)||!["length","precision","scale"].every(r=>Number.isInteger(a[r])&&a[r]>=0&&a[r]<=131072)||a.value!==_e(a)||["INTEGER","DECIMAL","DOUBLE","CURRENCY"].includes(a.dataType)&&(a.precision<1||a.precision>28||a.scale>a.precision||a.dataType==="INTEGER"&&a.scale!==0)||a.dataType==="CURRENCY"&&a.currencyCode!=="USD"||xe.includes(a.dataType)&&(a.length<1||a.value.length>a.length))throw Error("Invalid fields");let i=a.dataType==="PICKLIST"?qe:[];if(a.choices.length!==i.length||a.choices.some((r,s)=>!r||Object.keys(r).some(n=>!["label","value"].includes(n))||r.label!==i[s].label||r.value!==i[s].value||r.value.length>a.length))throw Error("Invalid synthetic choices");return e.add(a.fieldApi),{...a,choices:a.choices.map(r=>({...r}))}})}function rt(t,e,a){let i=new Set((Array.isArray(t.mappings)?t.mappings:[]).filter(Boolean).map(l=>l.fieldApi)),r=new Set,n=[{label:"Highlights",fields:e},...a].map((l,f)=>({id:`section-${f}`,label:l.label||"Details",columns:l.columns===1?1:2,fields:l.fields.filter(E=>i.has(E.api)&&!r.has(E.api)&&r.add(E.api)).map(E=>E.api)})).filter(l=>l.fields.length);return n.length?{version:1,sections:n}:null}function nt(t){if(!/^[A-Za-z0-9]{3}$/.test(t||""))throw Error("Invalid native key prefix");let e=t+"000000000001",a="ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",i="";for(let r=0;r<15;r+=5){let s=0;for(let n=0;n<5;n++)/[A-Z]/.test(e[r+n])&&(s|=1<<n);i+=a[s]}return e+i}var it={descriptor:et,eligibleFields:je,actionErrors:Ue,previewFields:tt,previewLayout:rt,checkedPreviewFields:at,syntheticId:nt},ue=it;var K=Object.freeze({STRING:{tag:"input",kind:"text"},TEXTAREA:{tag:"textarea",kind:"text"},EMAIL:{tag:"input",kind:"text"},PHONE:{tag:"input",kind:"text"},URL:{tag:"input",kind:"text"},BOOLEAN:{tag:"input",kind:"checkbox"},INTEGER:{tag:"input",kind:"integer"},DECIMAL:{tag:"input",kind:"decimal"},DOUBLE:{tag:"input",kind:"decimal"},CURRENCY:{tag:"input",kind:"decimal"},DATE:{tag:"input",kind:"date"},PICKLIST:{tag:"select",kind:"choice"}}),N=(t,e=256)=>typeof t=="string"&&t.length<=e,B=t=>t===null||N(t,4096);function V(t){if(!Array.isArray(t)||t.length>100)throw Error("INVALID_FIELDS");let e=new Set;return t.map(a=>{if(!a||Object.keys(a).some(n=>!["fieldApi","label","value","dataType","required","canClear","choices","currencyCode","length","precision","scale"].includes(n))||!N(a.fieldApi,80)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(a.fieldApi)||e.has(a.fieldApi)||!N(a.label)||!N(a.dataType,40)||!B(a.value))throw Error("INVALID_FIELDS");e.add(a.fieldApi);let i=a.choices??[],r=new Set;if(!Array.isArray(i)||i.length>500)throw Error("INVALID_CHOICES");let s=i.map(n=>{if(!n||Object.keys(n).some(l=>!["label","value"].includes(l))||!N(n.label)||!N(n.value,256)||!n.value||r.has(n.value))throw Error("INVALID_CHOICES");return r.add(n.value),{label:n.label,value:n.value}});if(a.currencyCode!=null&&!/^[A-Z]{3}$/.test(a.currencyCode))throw Error("INVALID_CURRENCY");for(let n of["length","precision","scale"])if(a[n]!=null&&(!Number.isSafeInteger(a[n])||a[n]<0||a[n]>131072))throw Error("INVALID_FIELDS");return{fieldApi:a.fieldApi,label:a.label,value:a.value,dataType:a.dataType.toUpperCase(),required:a.required===!0,canClear:a.canClear===!0,choices:s,currencyCode:a.currencyCode??null,...a.length==null?{}:{length:a.length},...a.precision==null?{}:{precision:a.precision},...a.scale==null?{}:{scale:a.scale}}})}function fe(t){if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let[e,a,i]=t.split("-").map(s=>parseInt(s,10)),r=e%4===0&&(e%100!==0||e%400===0);return e>=1&&a>=1&&a<=12&&i>=1&&i<=[31,r?29:28,31,30,31,30,31,31,30,31,30,31][a-1]}function he(t,e){let a=O(t,e?.dataType);if(a===null)return null;let i=a.replace(/^-/,""),[r,s=""]=i.split("."),n=(r||"0").replace(/^0+/,""),l=s.replace(/0+$/,"");return e?.precision!=null&&(e.precision<1||e.scale==null||e.scale>e.precision||n.length>e.precision-e.scale||l.length>e.scale)||e?.dataType==="INTEGER"&&e.precision!=null&&(n.length>10||n.length===10&&n>(a.startsWith("-")?"2147483648":"2147483647"))?null:a}function O(t,e){if(!N(t,5463))return null;let a=K[typeof e=="string"?e.toUpperCase():""]?.kind;if(!(a==="integer"?/^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(t):a==="decimal"&&(/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(t)||/^-?\.\d+$/.test(t))))return null;let n=t.replaceAll(",","").replace(/^(-?)\./,"$10.");return N(n,4096)?n:null}function _(t,e){let a=O(e,t?.dataType);if(a===null)return e;let i=a.startsWith("-"),r=i?a.slice(1):a,[s,n]=r.split(".");return(i?"-":"")+s.replace(/\B(?=(\d{3})+(?!\d))/g,",")+(n===void 0?"":"."+n)}function Pe(t,e={}){let a=[],i=[];for(let r of t){let s=Object.hasOwn(e,r.fieldApi)?e[r.fieldApi]:null;if(!s||s.operation==="keep")continue;let n;if(!K[r.dataType])n="This field type is unavailable for editing.";else if(s.operation==="clear")if(r.required||!r.canClear)n="This field cannot be cleared.";else{a.push({fieldApi:r.fieldApi,operation:"clear"});continue}else if(s.operation!=="set"||!N(s.value,["integer","decimal"].includes(K[r.dataType].kind)?5463:4096))n="Enter a supported value.";else{let l=s.value,f=K[r.dataType].kind;r.required&&l.trim()===""?n="Enter a value for this required field.":f==="integer"&&O(l,r.dataType)===null?n="Enter a whole number; commas must separate groups of three digits.":f==="decimal"&&O(l,r.dataType)===null?n="Enter an exact decimal; commas must group three digits. Exponents are not allowed. Use Clear to remove the value.":["integer","decimal"].includes(f)&&he(l,r)===null?n="Enter a number within the native precision, scale and range.":["STRING","TEXTAREA","EMAIL","PHONE","URL"].includes(r.dataType)&&r.length!=null&&l.length>r.length?n="Enter text within the native field length.":f==="date"&&!fe(l)?n="Enter a valid calendar date as YYYY-MM-DD.":f==="checkbox"&&!["true","false"].includes(l)?n="Choose true or false.":f==="choice"&&!r.choices.some(E=>E.value===l)?n="Choose an available option or keep the current value.":a.push({fieldApi:r.fieldApi,operation:"set",value:["integer","decimal"].includes(f)?O(l,r.dataType):l})}n&&i.push({fieldApi:r.fieldApi,code:"CLIENT_VALUE",message:n})}return{changes:a,errors:i}}var $e=(t,e)=>t&&typeof t=="object"&&!Array.isArray(t)&&Object.keys(t).every(a=>e.includes(a));function x(t,e){if(e==null)return[{id:"fields",label:"Details",columns:2,fields:t.map(n=>n.fieldApi)}];if(!$e(e,["version","sections"])||e.version!==1||!Array.isArray(e.sections)||e.sections.length>20)throw Error("INVALID_LAYOUT");let a=new Set(t.map(n=>n.fieldApi)),i=new Set,r=new Set,s=e.sections.map(n=>{if(!$e(n,["id","label","fields","columns"])||typeof n.id!="string"||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(n.id)||r.has(n.id)||typeof n.label!="string"||n.label.length>256||![1,2].includes(n.columns)||!Array.isArray(n.fields)||n.fields.length===0)throw Error("INVALID_LAYOUT");r.add(n.id);for(let l of n.fields){if(!a.has(l)||i.has(l))throw Error("INVALID_LAYOUT");i.add(l)}return{id:n.id,label:n.label,columns:n.columns,fields:[...n.fields]}});if(i.size!==a.size)throw Error("INVALID_LAYOUT");return s}function Me(t,e){if(e!=null)return{version:1,sections:x(t,e)}}var st=["Editing","Review","Completed","Cancelled","Expired","Conflict","Rejected"],P=t=>t!==null&&typeof t=="object"&&!Array.isArray(t),ye=t=>Number.isSafeInteger(t)&&t>0;var be=t=>typeof t=="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t)&&Number.isFinite(Date.parse(t));function ae(t){if(typeof t!="string"||!/^[A-Za-z0-9]{18}$/.test(t))return!1;let e="ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",a="";for(let i=0;i<15;i+=5){let r=0;for(let s=0;s<5;s++)/[A-Z]/.test(t[i+s])&&(r|=1<<s);a+=e[r]}return t.slice(15)===a}var F=t=>typeof t=="string"&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(t),ot=["STRING","TEXTAREA","BOOLEAN","INTEGER","DATE","DECIMAL","DOUBLE","CURRENCY","EMAIL","PHONE","URL","PICKLIST"];function Ae(t,e){return e===null?t.dataType!=="BOOLEAN":t.dataType==="BOOLEAN"?["true","false"].includes(e):t.dataType==="DATE"?fe(e):["INTEGER","DECIMAL","DOUBLE","CURRENCY"].includes(t.dataType)?/^-?(?:\d+)(?:\.\d+)?$/.test(e)&&he(e,t)!==null:B(e)&&(!["EMAIL","PHONE","URL","PICKLIST"].includes(t.dataType)||e.length<=t.length)}function Ke(t){let e=V(t);if(e.length<1||e.length>20||t.some(a=>typeof a.required!="boolean"||typeof a.canClear!="boolean"||!ot.includes(a.dataType)||!Ae(a,a.value)||["INTEGER","DECIMAL","DOUBLE","CURRENCY"].includes(a.dataType)&&(!Number.isInteger(a.precision)||a.precision<1||a.precision>28||!Number.isInteger(a.scale)||a.scale<0||a.scale>a.precision)||a.dataType==="INTEGER"&&a.scale!==0||a.dataType==="CURRENCY"&&!/^[A-Z]{3}$/.test(a.currencyCode)||a.dataType==="BOOLEAN"&&(a.canClear||!["true","false"].includes(a.value))||a.required&&a.canClear||["EMAIL","PHONE","URL","PICKLIST"].includes(a.dataType)&&(!Number.isSafeInteger(a.length)||a.length<1||a.length>131072)||a.dataType==="PICKLIST"&&a.choices?.some(i=>i.value.length>a.length)||a.dataType!=="PICKLIST"&&(a.choices??[]).length))throw Error("INVALID_FIELDS");return e}function lt(t,e){if(!Array.isArray(t)||t.length>10)throw Error("INVALID_VIEW");return t.map(a=>{if(!P(a)||!N(a.message)||typeof a.code!="string"||!/^[A-Z_]{1,80}$/.test(a.code)||a.fieldApi!=null&&!e.includes(a.fieldApi))throw Error("INVALID_VIEW");return{fieldApi:a.fieldApi??null,code:a.code,message:a.message}})}function Be(t,e,a=!1){if(!Array.isArray(t)||t.length>20)throw Error("INVALID_VIEW");let i=new Set;return t.map(r=>{if(!P(r)||!e.some(n=>n.fieldApi===r.fieldApi)||i.has(r.fieldApi)||!N(r.label)||!B(r.beforeValue)||!B(r.afterValue))throw Error("INVALID_VIEW");let s=e.find(n=>n.fieldApi===r.fieldApi);if(!Ae(s,r.beforeValue)||!Ae(s,r.afterValue)||!a&&s.dataType==="PICKLIST"&&r.afterValue!==null&&r.afterValue!==r.beforeValue&&!s.choices.some(n=>n.value===r.afterValue)||s.dataType==="BOOLEAN"&&![r.beforeValue,r.afterValue].every(n=>["true","false"].includes(n))||r.afterValue===null&&(!s.canClear||s.required))throw Error("INVALID_VIEW");return i.add(r.fieldApi),{fieldApi:r.fieldApi,label:r.label,beforeValue:r.beforeValue,afterValue:r.afterValue}})}function ct(t){if(!P(t)||!["Matches","Empty","Rejected"].includes(t.status)||!["hasMore","needsSelection","searchIndexMayLag"].every(i=>typeof t[i]=="boolean")||!["searchedObjects","unavailableObjects"].every(i=>Array.isArray(t[i])&&t[i].length<=12&&t[i].every(F))||!Array.isArray(t.candidates)||t.candidates.length>10||t.status==="Matches"!=t.candidates.length>0||t.status==="Rejected"&&!/^[A-Z_]{1,80}$/.test(t.errorCode))throw Error("INVALID_DISCOVERY");let e=new Set,a=t.candidates.map(i=>{if(!P(i)||!ae(i.recordId)||!F(i.objectApiName)||!N(i.objectLabel)||!N(i.recordName)||e.has(i.recordId)||!Array.isArray(i.context)||i.context.length>2)throw Error("INVALID_DISCOVERY");e.add(i.recordId);let r=i.context.map(s=>{if(!P(s)||!F(s.fieldApi)||!N(s.label)||!B(s.value))throw Error("INVALID_DISCOVERY");return{fieldApi:s.fieldApi,label:s.label,value:s.value}});return{recordId:i.recordId,objectApiName:i.objectApiName,objectLabel:i.objectLabel,recordName:i.recordName,context:r}});return{status:"Discovery",searchStatus:t.status,candidates:a,hasMore:t.hasMore,needsSelection:t.needsSelection,searchIndexMayLag:t.searchIndexMayLag,searchedObjects:[...t.searchedObjects],unavailableObjects:[...t.unavailableObjects]}}function Fe(t){if(!P(t))throw Error("INVALID_VIEW");if(t.contractVersion==="record-discovery/v1")return ct(t);if(t.contractVersion==="record-card/v1"){if(!ae(t.recordId)||!N(t.recordName)||!Array.isArray(t.actions)||t.actions.length>50||!F(t.objectApiName))throw Error("INVALID_CARD");let n=Ke(t.fields),l=t.actions.map(f=>{if(!P(f)||!/^[A-Za-z0-9_-]{1,80}$/.test(f.name)||!N(f.label)||!["record-edit","screen-flow"].includes(f.type))throw Error("INVALID_CARD");return{name:f.name,label:f.label,...f.type==="screen-flow"?{type:f.type}:{}}});return{status:"Card",objectApiName:t.objectApiName,recordId:t.recordId,recordName:t.recordName,fields:n,layout:Me(n,t.layout),actions:l}}if(t.contractVersion!=="record-edit/v1"||!st.includes(t.status))throw Error("INVALID_VIEW");let e=["Editing","Review","Completed"].includes(t.status)||t.recordId!=null;if(e&&!F(t.objectApiName)||!e&&t.objectApiName!=null&&!F(t.objectApiName))throw Error("INVALID_VIEW");let a=e?Ke(t.fields):V(t.fields??[]);if(t.status==="Completed")for(let n of a)n.choices=[];let i=a.map(n=>n.fieldApi),r=lt(t.errors??[],i),s={status:t.status,errors:r,fields:a,layout:Me(a,t.layout),diff:Be(t.diff??[],a)};if(["Editing","Review","Completed"].includes(t.status)){if(!ae(t.recordId)||!N(t.recordName)||!ye(t.revision))throw Error("INVALID_VIEW");Object.assign(s,{objectApiName:t.objectApiName,recordId:t.recordId,recordName:t.recordName,revision:t.revision})}else if(t.recordId!=null){if(!ae(t.recordId)||!N(t.recordName)||!ye(t.revision))throw Error("INVALID_VIEW");Object.assign(s,{objectApiName:t.objectApiName,recordId:t.recordId,recordName:t.recordName,revision:t.revision})}if(t.status==="Editing"){if(!be(t.expiresAt)||t.fields.some(n=>typeof n.required!="boolean"||typeof n.canClear!="boolean"))throw Error("INVALID_VIEW");s.expiresAt=t.expiresAt}if(t.status==="Review"){if(!be(t.expiresAt)||!ye(t.reviewRevision)||s.diff.length===0)throw Error("INVALID_VIEW");Object.assign(s,{expiresAt:t.expiresAt,reviewRevision:t.reviewRevision})}if(t.status==="Completed"){let n=t.receipt;if(!P(n)||!/^(receipt-[a-f0-9]{32})$/.test(n.reference)||!N(n.actorDisplayName)||!be(n.completedAt)||!["saved","noChanges"].includes(n.status))throw Error("INVALID_RECEIPT");let l=Be(n.diff,a,!0);if(n.status==="saved"&&l.length===0||n.status==="noChanges"&&l.length!==0)throw Error("INVALID_RECEIPT");s.receipt={reference:n.reference,actorDisplayName:n.actorDisplayName,completedAt:n.completedAt,status:n.status,diff:l}}return s}function dt(t,e,a){return t-e-a>=96}function ge(t,e){if(!e.isConnected)return;let a=t.defaultView.getComputedStyle(t.documentElement),i=parseFloat(a.getPropertyValue("--workspace-height"))||500,r=f=>{let E=a.getPropertyValue(`--workspace-safe-${f}`);return E.trim()?parseFloat(E):12},s=i-r("top")-r("bottom"),n=e.children[0].getBoundingClientRect().height,l=e.children[2].getBoundingClientRect().height;e.dataset.chromeFit=dt(s,n,l)?"bounded":"flow"}var Ye=new WeakMap;function ve(t,e){if(t.nodeType!==e.nodeType||t.nodeName!==e.nodeName||e._fieldIdentity&&t._fieldIdentity!==e._fieldIdentity)return t.replaceWith(e),e;if(t.nodeType===3)return t.textContent=e.textContent,t;for(let s of[...t.attributes])!e.hasAttribute(s.name)&&!(t.nodeName==="DETAILS"&&s.name==="open")&&t.removeAttribute(s.name);for(let s of[...e.attributes])t.setAttribute(s.name,s.value);if(t.matches("[data-field], [data-clear]"))return t;let a=s=>s.nodeType===1?s.getAttribute("data-field-box")||s.getAttribute("data-section"):null,i=[...t.childNodes],r=new Set;for(let[s,n]of[...e.childNodes].entries()){let l=a(n),f=l?i.find(z=>a(z)===l):i[s],E;f&&!r.has(f)?(r.add(f),E=ve(f,n)):E=n,t.childNodes[s]!==E&&t.insertBefore(E,t.childNodes[s]||null)}for(let s of i)r.has(s)||s.remove();return t}function Ee(t,e,a={}){let i=t.ownerDocument,r=Ye.get(t);r||(r={callbacks:{},phase:null,key:null,fields:new Map},Ye.set(t,r)),r.callbacks=a,a=new Proxy({},{get:(c,p)=>r.callbacks[p]});let s=e.workspaceKey!=null&&r.key===e.workspaceKey&&r.phase===e.status,l=s&&e.status==="Editing"?r.fields:new Map,f=new Map,E=V(e.fields||[]),z=Object.fromEntries(E.map(c=>[c.fieldApi,{dataType:c.dataType}])),Ne=c=>Object.hasOwn(z,c)?z[c]:Object.hasOwn(e.fieldTypes||{},c)?e.fieldTypes[c]:null,o=(c,p,d={})=>{let h=i.createElement(c);p!=null&&(h.textContent=p);for(let[y,v]of Object.entries(d))h.setAttribute(y,String(v));return h},b=i.createDocumentFragment(),Ge=o("p",e.message||e.status,{role:"status","aria-live":"polite","data-state":e.busyStatus||e.status,class:"status"}),Te=e.currentCard||e,Le=o("header",null,{class:"record-header"});Le.append(o("small",Te.objectApiName||"",{class:"object-label"}),o("h1",Te.recordName||"Cardstack"),Ge),b.append(Le),e.synthetic&&b.prepend(o("p",e.synthetic,{class:"synthetic"}));let Ze=o("h2",{Editing:"Edit details",Review:"Review changes",Completed:"Completion receipt"}[e.status]||e.objectApiName||"Record workspace",{tabindex:"-1"});b.append(Ze);let D=(c,p,d=!1)=>{let h=o("button",p,{type:"button","data-action":c});return h.disabled=d,h.addEventListener("click",()=>{!h.disabled&&t.contains(h)&&a[c]?.()}),h},W=c=>c===null?"Cleared":c===""?"Empty text":c;function se(c,p){let d=o("table"),h=o("tr");for(let I of["Field","Before","After"])h.append(o("th",I,{scope:"col"}));let y=o("thead");y.append(h),d.append(y);let v=o("tbody");for(let I of c){let u=o("tr");u.append(o("th",I.label,{scope:"row"}),o("td",W(_(Ne(I.fieldApi),I.beforeValue))),o("td",W(_(Ne(I.fieldApi),I.afterValue)))),v.append(u)}d.append(v),p.append(d)}function Re(c,p){let d=x(c.fields||[],c.layout);for(let h of d){let y=o("section",null,{class:"record-section"});y.append(o("h3",h.label));let v=o("dl");for(let I of h.fields){let u=c.fields.find(L=>L.fieldApi===I);v.append(o("dt",u.label),o("dd",`${u.currencyCode?u.currencyCode+" ":""}${W(_(u,u.value))}`))}y.append(v),p.append(y)}}if(e.status==="Discovery"){b.append(o("p",e.searchStatus==="Empty"?"No matching records.":e.searchStatus==="Rejected"?"Search is unavailable. Try a known Salesforce ID.":"Select the record you intend to open.")),e.hasMore&&b.append(o("p","More matches exist. Narrow your search.")),e.unavailableObjects.length&&b.append(o("p","Some configured objects are unavailable to search.")),e.searchIndexMayLag&&b.append(o("p","Recent record changes may take time to appear in search."));for(let y of e.candidates){let v=o("section",null,{class:"field-box"});v.append(o("h3",y.recordName),o("p",y.objectLabel),o("small",y.recordId));for(let u of y.context)v.append(o("p",`${u.label}: ${u.value??"Empty"}`));let I=o("button","Open record",{type:"button","data-candidate":y.recordId,"aria-label":`Open ${y.objectLabel} ${y.recordName}`});I.disabled=!e.ready,I.addEventListener("click",()=>{!I.disabled&&t.contains(I)&&a.choose?.(y.recordId)}),v.append(I),b.append(v)}let c=o("form"),p=o("label","Find a record",{for:"record-query"}),d=o("input",null,{id:"record-query",type:"search",maxlength:"160",required:"","data-search-query":""}),h=o("button","Search",{type:"submit"});h.disabled=!e.ready,c.append(p,d,h),c.addEventListener("submit",y=>{y.preventDefault(),e.ready&&t.contains(c)&&a.search?.(d.value)}),b.append(c)}if(e.status==="Card"){if(Re(e,b),e.breadcrumb){let p=D("parent",`Back to ${e.breadcrumb.recordName}`,!e.ready);p.setAttribute("data-parent-record",e.breadcrumb.recordId),b.append(p)}if(e.supportsRelated&&b.append(D("related","Related records",!e.ready)),e.related){let p=o("section",null,{"data-related":""});p.append(o("h2","Related records")),e.related.error&&p.append(o("p",e.related.error,{role:"alert"})),!e.related.lists.length&&!e.related.error&&p.append(o("p","No related lists are configured."));for(let d of e.related.lists){let h=o("section");h.append(o("h3",d.label));let y=o("button","Read / refresh list",{type:"button","data-related-list":d.listKey});y.disabled=!e.ready||e.relatedPending?.includes(d.listKey),y.addEventListener("click",()=>{!y.disabled&&t.contains(y)&&a.relatedPage?.(d.listKey)}),h.append(y),e.relatedPending?.includes(d.listKey)&&h.append(o("p","Reading related records\u2026",{"data-related-loading":d.listKey,role:"status"}));let v=e.related.pages[d.listKey];if(v){v.rows.length||h.append(o("p","No related records."));let I=o("table",null,{"data-related-rows":d.listKey}),u=o("tr");u.append(o("th","Record",{scope:"col"}));for(let R of v.columns)u.append(o("th",R.label,{scope:"col"}));let L=o("thead");L.append(u),I.append(L);let H=o("tbody");for(let R of v.rows){let C=o("tr"),A=o("th",null,{scope:"row"}),m=o("button",R.recordName,{type:"button","data-related-child":R.recordId});m.disabled=!e.ready,m.addEventListener("click",()=>{!m.disabled&&t.contains(m)&&a.relatedChild?.(d.listKey,R.recordId)}),A.append(m),C.append(A),R.cells.forEach((w,le)=>C.append(o("td",_({...v.columns[le],currencyCode:w.currencyCode},w.value)??"Empty"))),H.append(C)}if(I.append(H),h.append(I),v.hasMore){let R=o("button","Next page",{type:"button","data-related-next":d.listKey});R.disabled=!e.ready||e.relatedPending?.includes(d.listKey),R.addEventListener("click",()=>{!R.disabled&&t.contains(R)&&a.relatedPage?.(d.listKey,!0)}),h.append(R)}}p.append(h)}b.append(p)}let c=o("div",null,{class:"actions"});for(let p of e.actions||[]){let d=D("start",p.label,!e.ready);d.addEventListener("click",()=>{!d.disabled&&t.contains(d)&&a.launch?.(p.name)}),c.append(d)}e.actions?.length||b.append(o("p","No published edit action is available for this record.")),b.append(c,D("refresh","Refresh card",!e.ready))}let oe=()=>({});if(e.status==="Editing"){if(e.flow&&e.screen){b.append(o("h3",e.screen.label));for(let u of e.screen.plainTextBlocks)b.append(o("p",u))}let c=E,p=x(c,e.layout),d=o("form");d.noValidate=!0;let h=[];for(let u of p){let L=o("fieldset",null,{"data-section":u.id}),H=o("legend",u.label);L.append(H);let R=o("div",null,{class:`field-grid columns-${u.columns}`});L.append(R);for(let C of u.fields){let A=c.find(T=>T.fieldApi===C),m=K[A.dataType],w=o("div",null,{class:"field","data-field-box":C}),le=o("label",`${A.label}${A.currencyCode?" ("+A.currencyCode+")":""}${A.required?" *":""}`,{for:"field-"+C});if(w.append(le),!m){w.append(o("p",`${W(A.value)} \u2014 Editing unavailable for this field type.`)),R.append(w);continue}let g=o(m.tag,null,{id:"field-"+C,"data-field":C}),q=e.drafts?.[C],ce=!1;g.addEventListener("input",()=>ce=!0),g.addEventListener("change",()=>ce=!0);let G=q?.operation==="set"?q.value:A.value;if(g.disabled=!e.editable,g.setAttribute("aria-required",String(A.required)),m.kind==="choice"){let T=o("option","Keep the current record value");if(T.value="",g.append(T),A.value&&!A.choices.some(U=>U.value===A.value)){let U=o("option",`Starting value: ${A.value} (unavailable for selection)`);U.value=A.value,U.disabled=!0,g.append(U)}for(let U of A.choices){let Ve=o("option",U.label);Ve.value=U.value,g.append(Ve)}g.value=q?.operation==="set"?q.value:q?.operation==="clear"?"":A.value??""}else m.kind==="checkbox"?(g.type="checkbox",g.checked=G==="true"):(m.tag==="input"&&(g.type=m.kind==="date"?"date":"text"),g.value=_(A,G)??"",m.kind==="date"&&(g.min="0001-01-01",g.max="9999-12-31"),["integer","decimal"].includes(m.kind)&&g.addEventListener("blur",()=>{O(g.value,A.dataType)!==null&&(g.value=_(A,g.value))}),["integer","decimal"].includes(m.kind)&&(g.inputMode=m.kind==="integer"?"numeric":"decimal"),m.tag==="textarea"&&(g.rows=3),g.maxLength=["integer","decimal"].includes(m.kind)?5463:4096);let Xe=o("small",`Starting value: ${W(_(A,A.value))}`);w.append(g,Xe);let j=null;if(A.canClear&&!A.required){let T=o("label",null,{class:"clear"});j=o("input",null,{"data-clear":C,type:"checkbox"}),j.checked=q?.operation==="clear",j.disabled=!e.editable,T.append(j,i.createTextNode("Clear value")),w.append(T),j.addEventListener("change",()=>{g.disabled=j.checked||!r.editable}),j.checked&&(g.disabled=!0)}let ke=(e.errors||[]).find(T=>T.fieldApi===C);if(ke){let T=o("p",ke.message,{id:"error-"+C,class:"error"});w.append(T),g.setAttribute("aria-invalid","true"),g.setAttribute("aria-describedby","error-"+C)}let Je=m.kind==="choice"?g.value:m.kind==="checkbox"?G==="true"?"true":"false":O(G,A.dataType)??G??"",Qe=()=>{if(j?.checked)return[C,{operation:"clear"}];let T=m.kind==="checkbox"?String(g.checked):O(g.value,A.dataType)??g.value;return q?.operation==="set"&&T===q.value?[C,{operation:"set",value:T}]:T===Je&&!(ce&&m.kind==="checkbox"&&A.value===null)||m.kind==="choice"&&T===""?[C,{operation:"keep"}]:[C,{operation:"set",value:T}]},de=JSON.stringify([A.fieldApi,A.dataType,A.value,A.required,A.canClear,A.choices.map(T=>T.value)]);w._fieldIdentity=de;let we=l.get(C),Oe=we?.fingerprint===de?we.reader:Qe;f.set(C,{fingerprint:de,reader:Oe}),h.push(Oe),R.append(w)}d.append(L)}oe=()=>Object.fromEntries(h.map(u=>u()));let y=o("div",null,{class:"actions"}),v=o("button",e.flow?"Next":"Review changes",{type:"button","data-action":"review"});v.disabled=!e.editable||e.flow&&!e.screen.canNext,y.append(D("cancel","Cancel",!e.editable||e.flow&&!e.screen.canCancel)),e.flow&&e.screen.canBack&&y.append(D("back","Back",!e.editable)),y.append(v),d.append(y);let I=()=>{r.editable&&t.contains(d)&&a.review?.(r.readDraft())};if(v.addEventListener("click",()=>{t.contains(v)&&r.editable&&a.review?.(r.readDraft())}),d.addEventListener("keydown",u=>{let L=u.target;u.key!=="Enter"||u.defaultPrevented||u.isComposing||u.repeat||u.altKey||u.ctrlKey||u.metaKey||u.shiftKey||L?.tagName!=="INPUT"||L.type!=="text"||L.disabled||(u.preventDefault(),I())}),e.flow&&e.screen.needsAnswerRefresh){let u=L=>{r.editable&&L.target?.matches("[data-field], [data-clear]")&&t.contains(d)&&a.answer?.(r.readDraft(),L.target.getAttribute("data-field")||L.target.getAttribute("data-clear"))};d.addEventListener("change",u),d.addEventListener("focusout",u)}d.addEventListener("submit",u=>u.preventDefault()),b.append(d)}for(let c of(e.errors||[]).filter(p=>!p.fieldApi))b.append(o("p",c.message,{class:"error"}));if(e.status==="Review"){if(e.layout&&E.length)for(let p of x(E,e.layout)){let d=p.fields.flatMap(h=>(e.diff||[]).filter(y=>y.fieldApi===h));d.length&&(b.append(o("h3",p.label)),se(d,b))}else se(e.diff||[],b);b.append(o("p","Salesforce validates business rules when you save."));let c=o("div",null,{class:"actions"});c.append(...e.busyStatus==="Saving"?[]:[D("cancel","Cancel",!e.ready)],D("back",e.flow?"Back to screen":"Back to edit",!e.ready||e.flow&&!e.screen?.canBack),D("confirm",e.saveDisabled?"Save disabled in Studio preview":"Confirm and save",!e.canConfirm||e.saveDisabled)),b.append(c)}if(e.receipt){let c=o("section",null,{"data-receipt":"",class:"receipt"});c.append(o("h3",e.receipt.status==="noChanges"?"No changes were needed":"Reviewed changes saved"),o("p",`${e.receipt.actorDisplayName} \xB7 ${e.receipt.completedAt}`),o("small",`Receipt ${e.receipt.reference}`));let p=o("details");p.append(o("summary","View saved changes"));let d=e.layout&&E.length?x(E,e.layout).flatMap(h=>h.fields.flatMap(y=>(e.receipt.diff||[]).filter(v=>v.fieldApi===y))):e.receipt.diff||[];se(d,p),c.append(p),b.append(c)}if(e.status==="Completed"&&b.append(D("refresh",e.refreshing?"Refreshing\u2026":"Refresh current record",!e.ready||e.refreshing)),e.currentCard){let c=o("section",null,{"data-current-card":""});c.append(o("h3","Current record \xB7 fresh read")),Re(e.currentCard,c),b.append(c)}["Unknown","Recoverable","Saving"].includes(e.busyStatus||e.status)&&b.append(D("resume","Check save status",!e.ready)),["Cancelled","Expired","Conflict","Rejected"].includes(e.status)&&b.append(D("refresh","Refresh card",!e.ready));let S=t.querySelector(".workspace");if(!S){S=o("section",null,{class:"workspace"}),S.append(o("div",null,{class:"workspace-header"}),o("div",null,{class:"workspace-content"}),o("footer",null,{class:"workspace-actions"})),t.replaceChildren(S);let c=i.defaultView.ResizeObserver;if(c){let p=new c(()=>{if(!S.isConnected){p.disconnect();return}ge(i,S)});p.observe(S.children[0]),p.observe(S.children[2])}}let X=S.children[0],k=S.children[1],ze=S.children[2],J=b.querySelector("header");X.firstChild?ve(X.firstChild,J):X.append(J),J.parentNode!==X&&J.remove();let Q=b.querySelector(".actions");Q&&Q.remove();let Se=[...b.querySelectorAll("button[data-action=refresh], button[data-action=resume]")];for(let c of Se)c.remove();if(s){let c=o("div",null,{class:"workspace-content"});c.append(b),ve(k,c);let p=[...k.querySelectorAll("[data-clear]")];for(let d of p)d.disabled=!e.editable,k.querySelector(`[data-field="${d.dataset.clear}"]`).disabled=d.checked||!e.editable}else k.replaceChildren(b),k.scrollTop=0;ze.replaceChildren(...Q?[...Q.childNodes]:[],...Se),S.setAttribute("aria-busy",String(!!e.busyStatus||!!e.refreshing)),ge(i,S),r.editable=!!e.editable,r.readDraft=oe,r.fields=f,r.phase=e.status,r.key=e.workspaceKey;let De=(c,p=!1)=>{if(c.focus({preventScroll:!0}),p){let d=c.getBoundingClientRect(),h=k.getBoundingClientRect();d.top<h.top?k.scrollTop+=d.top-h.top-8:d.bottom>h.bottom&&(k.scrollTop+=d.bottom-h.bottom+8)}};if(e.focusError){let c=t.querySelector("[aria-invalid=true]");De(c||k.querySelector("h2"),!!c)}else e.focusHeading&&(k.scrollTop=0,De(k.querySelector("h2")));return{readDraft:oe}}var re=document.querySelector("#root"),Y=[{fieldApi:"StageName",label:"Stage",dataType:"PICKLIST",value:"Discovery",required:!0,canClear:!1,choices:[{label:"Discovery",value:"Discovery"},{label:"Closed won",value:"Closed Won"}]},{fieldApi:"CloseDate",label:"Close date",dataType:"DATE",value:"2026-11-30",required:!0,canClear:!1,choices:[]},{fieldApi:"Amount",label:"Amount",dataType:"CURRENCY",value:"10000",currencyCode:"USD",required:!1,canClear:!0,choices:[]}],pt=[{fieldApi:"LastName",label:"Last name",dataType:"STRING",value:"Synthetic Contact",required:!0,canClear:!1,choices:[]},{fieldApi:"Description",label:"Description",dataType:"TEXTAREA",value:"Synthetic description",required:!1,canClear:!0,choices:[]},{fieldApi:"HasOptedOutOfEmail",label:"Email opt out",dataType:"BOOLEAN",value:"false",required:!1,canClear:!1,choices:[]}],ut=[{fieldApi:"Subject",label:"Subject",dataType:"STRING",value:"Synthetic example",required:!0},{fieldApi:"Notes",label:"Notes",dataType:"TEXTAREA",value:`First line
Second line`},{fieldApi:"Accepted",label:"Accepted",dataType:"BOOLEAN",value:"false"},{fieldApi:"Units",label:"Units",dataType:"INTEGER",value:"9007199254740993"},{fieldApi:"Ratio",label:"Ratio",dataType:"DECIMAL",value:"0.125"},{fieldApi:"Measure",label:"Measure",dataType:"DOUBLE",value:"42.5"},{fieldApi:"Budget",label:"Budget",dataType:"CURRENCY",value:"0",currencyCode:"EUR",canClear:!0},{fieldApi:"MeetingDate",label:"Meeting date",dataType:"DATE",value:"2028-02-29"},{fieldApi:"Category",label:"Category",dataType:"PICKLIST",value:"active",choices:[{label:"Active",value:"active"},{label:"Paused",value:"paused"}]},{fieldApi:"Future",label:"Future type",dataType:"UNSUPPORTED",value:"Read-only example"}].map(t=>({required:!1,canClear:!1,choices:[],...t})),M=V(Y),ne=null,Z={},$,Ie=0,We="Synthetic Studio preview \xB7 shared renderer only \xB7 Save disabled \xB7 no Salesforce or host bridge";function me(){Ee(re,{...$,workspaceKey:Ie,synthetic:We,layout:ne,drafts:Z,ready:!0,editable:!0,saveDisabled:!0},He)}function ie(){Ie++,Z={},$={status:"Editing",recordName:"Synthetic presentation",fields:M,errors:[]},me()}var He={review(t){Z=t;let e=Pe(M,Z);if(e.errors.length){$={...$,errors:e.errors},Ee(re,{...$,workspaceKey:Ie,synthetic:We,drafts:Z,layout:ne,editable:!0,saveDisabled:!0,focusError:!0},He);return}let a=e.changes.map(i=>{let r=M.find(s=>s.fieldApi===i.fieldApi);return{fieldApi:r.fieldApi,label:r.label,beforeValue:r.value,afterValue:i.operation==="clear"?null:i.value}});$={fields:M,status:"Review",recordName:"Synthetic presentation",diff:a,errors:[]},me()},back(){$={status:"Editing",recordName:"Synthetic presentation",fields:M,errors:[]},me()},cancel:ie},Ce=document.createElement("nav");Ce.className="preview-tools";for(let[t,e]of[["Opportunity fields",Y],["Contact fields",pt],["All supported controls",ut]]){let a=document.createElement("button");a.textContent=t,a.type="button",a.addEventListener("click",()=>{M=V(e),ne=null,ie()}),Ce.append(a)}document.body.prepend(Ce);addEventListener("message",t=>{if(!(window.parent===window||t.source!==window.parent||t.data?.type!=="cardstack-preview/v1"))try{let e=t.data;if(Object.keys(e).some(r=>!["type","scenario","objectApiName","nativeKeyPrefix","recordId","mode","fields","layout"].includes(r))||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(e.objectApiName||"")||e.scenario!==e.objectApiName||e.recordId!==ue.syntheticId(e.nativeKeyPrefix))throw Error("Invalid identity");let a;if(e.mode==="opportunity-stage"){if(e.objectApiName!=="Opportunity"||e.nativeKeyPrefix!=="006"||!Array.isArray(e.fields)||e.fields.length!==Y.length||e.fields.some((r,s)=>Object.keys(r).some(n=>!Object.keys(Y[s]).includes(n))||Object.keys(Y[s]).some(n=>JSON.stringify(r[n])!==JSON.stringify(Y[s][n]))))throw Error("Invalid Stage presentation");a=V(e.fields)}else{if(e.mode!=="record-edit")throw Error("Invalid mode");let r=ue.checkedPreviewFields(e.fields);a=Fe({contractVersion:"record-card/v1",objectApiName:e.objectApiName,recordId:e.recordId,recordName:"Synthetic presentation",fields:r,actions:[]}).fields}let i=t.data.layout??null;x(a,i),M=a,ne=i,ie()}catch{re.replaceChildren();let e=document.createElement("p");e.textContent="Synthetic preview unavailable: invalid fields or layout.",re.append(e)}});ie();})();
</script></body></html>
