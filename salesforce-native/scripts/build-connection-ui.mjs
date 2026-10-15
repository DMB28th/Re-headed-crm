#!/usr/bin/env node
// Offline builder. --dependencies names an existing node_modules directory.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const native=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=='--dependencies'))throw Error('Use --dependencies EXISTING_NODE_MODULES');
const dependencyRoot=args[1]?path.resolve(args[1]):path.resolve(native,'node_modules');
const require=createRequire(path.join(dependencyRoot,'../package.json'));
const entry=require.resolve('@modelcontextprotocol/ext-apps');
const sdkRoot=path.resolve(path.dirname(entry),'../..');
const sdk=JSON.parse(await readFile(path.join(sdkRoot,'package.json'),'utf8'));
if(sdk.version!=='1.7.4')throw Error('SDK_1_7_4_REQUIRED');
const viteRequire=createRequire(require.resolve('vite'));
const {build}=viteRequire('esbuild');
const result=await build({entryPoints:[path.join(native,'ui/connection-diagnostic/app.js')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,drop:['console','debugger'],legalComments:'none',nodePaths:[dependencyRoot],metafile:true});
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const scriptHash=createHash('sha256').update(script).digest('base64');
const source=await readFile(path.join(native,'ui/connection-diagnostic/index.html'),'utf8');
const csp=`default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const html=source.replace('<!--CSP-->',`<meta http-equiv="Content-Security-Policy" content="${csp}">`).replace('<!--APP-->',()=>`<script>${script}</script>`);
const resource=path.join(native,'force-app/main/default/staticresources/CardstackConnectionDiagnosticUi.resource');
await writeFile(resource,html);
console.log(JSON.stringify({sdk:sdk.version,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),bundledInputs:Object.keys(result.metafile.inputs).length}));
