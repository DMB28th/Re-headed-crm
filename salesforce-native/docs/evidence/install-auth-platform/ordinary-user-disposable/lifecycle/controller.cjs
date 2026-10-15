'use strict';
// No imports cause network access; direct execution requires explicit human approval flags.
const pathModule=require('node:path'),crypto=require('node:crypto');
const fs=require('node:fs'),http=require('node:http'),{spawn}=require('node:child_process');
const {Lifecycle,validateConfig}=require('./core.cjs');
function privateJson(path){const s=fs.lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('PRIVATE_FILE_REQUIRED');return JSON.parse(fs.readFileSync(path,'utf8'));}
function fileVault(path,io=fs){
 const directory=io.realpathSync(pathModule.dirname(path)),name=pathModule.join(directory,pathModule.basename(path));
 function verifyDirectory(){const stat=io.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))throw Error('PRIVATE_DIRECTORY_REQUIRED');}
 verifyDirectory();
 return {read(){try{return privateJson(name);}catch(e){if(e.code==='ENOENT')return null;throw Error('PRIVATE_VAULT_FAILED');}},write(value){
 verifyDirectory();let temp=null,fd=null,dirfd=null;
 try{
 // Validate any existing target without truncating it. Single controller owns this directory.
 try{const st=io.lstatSync(name);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw Error('PRIVATE_VAULT_FAILED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const candidate=pathModule.join(directory,'.ordinary-vault-'+crypto.randomBytes(16).toString('hex')+'.tmp');
 fd=io.openSync(candidate,io.constants.O_WRONLY|io.constants.O_CREAT|io.constants.O_EXCL|io.constants.O_NOFOLLOW,0o600);temp=candidate;
 io.writeFileSync(fd,JSON.stringify(value));io.fsyncSync(fd);io.closeSync(fd);fd=null;
 io.renameSync(temp,name);temp=null;
 dirfd=io.openSync(directory,io.constants.O_RDONLY);io.fsyncSync(dirfd);
 }catch{throw Error('PRIVATE_VAULT_WRITE_FAILED');}finally{if(fd!==null)try{io.closeSync(fd);}catch{}if(dirfd!==null)try{io.closeSync(dirfd);}catch{}if(temp!==null)try{io.unlinkSync(temp);}catch{}}
 },purge(){verifyDirectory();io.unlinkSync(name);const fd=io.openSync(directory,io.constants.O_RDONLY);try{io.fsyncSync(fd);}finally{io.closeSync(fd);}}};
}
function transportFor(config,fetcher=fetch){const c=validateConfig(config);return async(url,form)=>{if(![c.loginOrigin+'/services/oauth2/token',c.loginOrigin+'/services/oauth2/revoke'].includes(url))throw Error('EXACT_ENDPOINT_REQUIRED');if(url.endsWith('/token')&&(form.client_id!==c.clientId||form.redirect_uri!==c.callback||form.grant_type!=='authorization_code'))throw Error('EXACT_CLIENT_CALLBACK_REQUIRED');try{const r=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)});const text=await r.text();if(text.length>65536)throw Error();let body=null;try{body=JSON.parse(text);}catch{}return {status:r.status,body};}catch{throw Error('TRANSPORT_FAILED');}};}
async function main(args){if(args.length!==5||args[0]!=='--live'||args[1]!=='--human-approved'||!['open','revoke','purge-after-measurement'].includes(args[2]))throw Error('EXPLICIT_HUMAN_APPROVAL_REQUIRED');const config=privateJson(args[3]),vault=fileVault(args[4]),lifecycle=new Lifecycle(config,vault,transportFor(config));if(args[2]==='revoke')return lifecycle.revoke();if(args[2]==='purge-after-measurement')return lifecycle.purgeAfterMeasurement(true);
 return new Promise((resolve,reject)=>{let timer;const finish=(err,out)=>{clearTimeout(timer);server.close();err?reject(Error('ACQUISITION_FAILED')):resolve(out);};const server=http.createServer(async(req,res)=>{if(req.method!=='GET'||req.headers.host!=='localhost:1717'){res.writeHead(400);res.end('Rejected');return;}try{const out=await lifecycle.capture('http://localhost:1717'+req.url);res.writeHead(200,{'Content-Type':'text/plain'});res.end('Authorization captured. Return to the controller.');finish(null,out);}catch{res.writeHead(400);res.end('Rejected');if(vault.read())finish(Error());}});server.on('error',()=>finish(Error()));server.listen(1717,'127.0.0.1',()=>{try{const url=lifecycle.begin();timer=setTimeout(()=>finish(Error()),300000);const child=spawn('/usr/bin/open',[url],{stdio:'ignore'});child.on('error',()=>finish(Error()));}catch{finish(Error());}});});}
if(require.main===module)main(process.argv.slice(2)).then(out=>process.stdout.write(JSON.stringify(out)+'\n')).catch(()=>{process.stderr.write('LIFECYCLE_OPERATION_FAILED\n');process.exitCode=1;});
module.exports={transportFor,fileVault,main};
