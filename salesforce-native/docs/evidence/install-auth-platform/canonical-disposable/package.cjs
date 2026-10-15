'use strict';
// Offline deterministic archive builder. No sf invocation, auth, networking or deployment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const components={ApexClass:['CardstackCanonicalProbe','CardstackCanonicalProbeTest'],StaticResource:['CardstackCanonicalProbeUi'],PermissionSet:['Cardstack_Canonical_Probe']};
const deployFiles=['classes/CardstackCanonicalProbe.cls','classes/CardstackCanonicalProbe.cls-meta.xml','classes/CardstackCanonicalProbeTest.cls','classes/CardstackCanonicalProbeTest.cls-meta.xml','staticresources/CardstackCanonicalProbeUi.resource','staticresources/CardstackCanonicalProbeUi.resource-meta.xml','permissionsets/Cardstack_Canonical_Probe.permissionset-meta.xml','package.xml'].sort();
const cleanupFiles=['cleanup/package.xml','cleanup/destructiveChanges.xml'];
function manifest(empty=false){return '<Package xmlns="http://soap.sforce.com/2006/04/metadata">'+(empty?'':Object.entries(components).map(([type,names])=>'<types>'+names.map(n=>'<members>'+n+'</members>').join('')+'<name>'+type+'</name></types>').join(''))+'<version>67.0</version></Package>\n';}
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function methods(root){return [...fs.readFileSync(path.join(root,'classes/CardstackCanonicalProbeTest.cls'),'utf8').matchAll(/@IsTest\s+static void ([A-Za-z][A-Za-z0-9_]*)\(/g)].map(m=>m[1]).sort();}
function sourceList(root){return [...deployFiles,...cleanupFiles,'contract.cjs','package.cjs','offline.test.cjs','receipt.schema.json','live-receipt.schema.json','ui-provenance.json','README.md','live-approval-scope.md'].sort();}
function freeze(root){
 fs.writeFileSync(path.join(root,'package.xml'),manifest());
 fs.writeFileSync(path.join(root,'cleanup/package.xml'),manifest(true));
 fs.writeFileSync(path.join(root,'cleanup/destructiveChanges.xml'),manifest());
 const inventory={schemaVersion:1,apiVersion:'67.0',components,deployFiles,cleanupFiles,testMethods:methods(root),sourceHashes:Object.fromEntries(sourceList(root).map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))};
 fs.writeFileSync(path.join(root,'sha256-inventory.json'),JSON.stringify(inventory,null,2)+'\n');return inventory;
}
function archive(root,entries,target){
 const code="import sys,json,zipfile,pathlib\nr=pathlib.Path(sys.argv[1]); entries=json.loads(sys.argv[2]); output=r/sys.argv[3]\nwith zipfile.ZipFile(output,'w',compression=zipfile.ZIP_STORED) as z:\n for source,name in sorted(entries):\n  info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_STORED;z.writestr(info,(r/source).read_bytes())\n";
 execFileSync('python3',['-c',code,root,JSON.stringify(entries),target],{stdio:['ignore','pipe','pipe']});
 return hash(fs.readFileSync(path.join(root,target)));
}
function build(root=__dirname){
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'sha256-inventory.json'),'utf8'));
 if(JSON.stringify(inventory.components)!==JSON.stringify(components) || JSON.stringify(inventory.deployFiles)!==JSON.stringify(deployFiles) || JSON.stringify(inventory.cleanupFiles)!==JSON.stringify(cleanupFiles) || inventory.apiVersion!=='67.0') throw Error('Manifest allowlist drift');
 if(fs.readFileSync(path.join(root,'package.xml'),'utf8')!==manifest() || fs.readFileSync(path.join(root,'cleanup/package.xml'),'utf8')!==manifest(true) || fs.readFileSync(path.join(root,'cleanup/destructiveChanges.xml'),'utf8')!==manifest()) throw Error('Exact manifest drift');
 if(JSON.stringify(methods(root))!==JSON.stringify(inventory.testMethods)) throw Error('Apex test-method drift');
 if(JSON.stringify(Object.keys(inventory.sourceHashes))!==JSON.stringify(sourceList(root))) throw Error('Source hash inventory allowlist drift');
 for(const [f,expected] of Object.entries(inventory.sourceHashes)) if(hash(fs.readFileSync(path.join(root,f)))!==expected) throw Error('Source hash drift: '+f);
 const result={apiVersion:'67.0',components,deploy:{files:deployFiles,sha256:archive(root,deployFiles.map(f=>[f,f]),'deploy.zip')},cleanup:{files:['destructiveChanges.xml','package.xml'],sha256:archive(root,cleanupFiles.map(f=>[f,path.basename(f)]),'cleanup.zip')}};
 fs.writeFileSync(path.join(root,'archives.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){if(process.argv[2]==='--freeze')freeze(__dirname);else if(process.argv.length>2)throw Error('Only offline --freeze supported');process.stdout.write(JSON.stringify(build(),null,2)+'\n');}
module.exports={build,freeze};
