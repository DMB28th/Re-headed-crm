const crypto=require('node:crypto');
const challenge=v=>crypto.createHash('sha256').update(v).digest('base64url');
function acceptCallback(u,state){return u.origin==='http://localhost:1717'&&u.pathname==='/OauthRedirect'&&!u.searchParams.has('error')&&u.searchParams.getAll('code').length===1&&!!u.searchParams.get('code')&&u.searchParams.getAll('state').length===1&&u.searchParams.get('state')===state;}
function acceptScopes(value,requested){if(typeof value!=='string')return false;const scopes=new Set(value.split(/\s+/).filter(Boolean));const identities=['id','profile','email','address','phone'];return scopes.size>0&&[...scopes].every(s=>identities.includes(s)||(s==='api'&&requested.includes('api')))&&identities.some(s=>scopes.has(s))&&(!requested.includes('api')||scopes.has('api'));}
module.exports={challenge,acceptCallback,acceptScopes};
