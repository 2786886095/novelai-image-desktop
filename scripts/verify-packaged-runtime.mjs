import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyIg5Package} from './verify-ig5-package.mjs';
import {readReleaseVersion} from './release-version.cjs';

const root=process.cwd();
const expectedVersion=readReleaseVersion(root);
const output=path.resolve('release/packaged-smoke');
fs.mkdirSync(output,{recursive:true});
let binary,resources;
if(process.platform==='darwin'){
 const contents=path.resolve('release/mac-universal/Langbai NovelAI Studio.app/Contents');
 binary=path.join(contents,'MacOS/Langbai NovelAI Studio');resources=path.join(contents,'Resources');
}else if(process.platform==='win32'){
 binary=path.resolve('release/win-unpacked/Langbai NovelAI Studio.exe');resources=path.resolve('release/win-unpacked/resources');
}else throw Error('Packaged runtime verification supports only Windows and macOS packages');
const checks=[];
function run(command,args,env,name){
 const childEnv={...process.env,...env};for(const key of Object.keys(childEnv))if(childEnv[key]===null)delete childEnv[key];
 const result=spawnSync(command,args,{env:childEnv,timeout:90000,encoding:'utf8'});
 fs.writeFileSync(path.join(output,name+'.log'),(result.stdout??'')+(result.stderr??''));
 checks.push({name,command,args,status:result.status,error:result.error?.message});
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(checks,null,2));
 if(result.error||result.status!==0)throw Error(name+' failed: '+(result.error?.message??result.stderr));
 console.log(name,(result.stdout??'').trim().slice(-600));
}
const probe=path.resolve('scripts/packaged-runtime-probe.cjs');
const appRoot=path.join(resources,'app.asar');
const ig5=verifyIg5Package(appRoot,root);
fs.writeFileSync(path.join(output,'ig5-package.json'),JSON.stringify(ig5,null,2)+'\n');
checks.push({name:'ig5-license-provenance',status:0,archive:appRoot,files:ig5.files});
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(checks,null,2));
console.log('IG5_PACKAGED_BYTES_VERIFIED',ig5.version,ig5.files.length);
if(process.platform==='darwin'){
 for(const arch of [process.arch === 'arm64' ? 'arm64' : 'x86_64'])run('/usr/bin/arch',['-'+arch,binary,probe,appRoot],{ELECTRON_RUN_AS_NODE:'1'},'runtime-'+arch);
}else run(binary,[probe,appRoot],{ELECTRON_RUN_AS_NODE:'1'},'runtime');
run(binary,[path.resolve('scripts/packaged-accounts-probe.cjs'),appRoot,expectedVersion],{ELECTRON_RUN_AS_NODE:'1'},'accounts-runtime');
for(const tab of ['01-generate','08-tools','09-reference-presets']){
 const image=path.join(output,tab+'.png');
 const userData=path.join(output,'profile');fs.mkdirSync(userData,{recursive:true});
 const env={ELECTRON_RUN_AS_NODE:null,NAI_UI_CAPTURE_PATH:image,NAI_UI_CAPTURE_USER_DATA:userData};
 const args=['--disable-gpu'];
 run(binary,args,env,tab);
 if(!fs.existsSync(image))throw Error('Missing packaged UI capture: '+tab);
 const auditPath=image+'.audit.json';
 if(!fs.existsSync(auditPath))throw Error('Missing packaged UI audit: '+tab);
 const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
 if(audit.viewportOverflow?.length||audit.contentOverflow?.length)throw Error('Packaged UI overflow: '+tab);
}
console.log('PACKAGED_STARTUP_AND_NATIVE_RUNTIME_OK',process.platform);
