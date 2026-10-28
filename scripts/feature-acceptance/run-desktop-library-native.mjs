import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {profileSha256} from './full-feature-profiles.mjs';
import {captureSourceState} from './source-state.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),platform=({win32:'windows',darwin:'macos',linux:'linux'})[process.platform];
if(!platform)throw Error('Actual desktop native host required');
const outputRoot=path.resolve(process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'desktop-library-native-'))),sourceSha=process.argv[3]||'uncommitted',run=path.join(outputRoot,crypto.randomUUID()),deps=path.join(sourceRoot,'node_modules'),req=createRequire(path.join(sourceRoot,'package.json'));
fs.mkdirSync(run,{recursive:true});const ledger=[];let exitStatus=1,failure=null,checks=[],nativeRuntime={type:'electron',version:'unknown'};
function command(argv,timeout=180000){const env={...process.env};for(const k of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_FILE'])delete env[k];for(const key of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP']){const dir=path.join(run,'environment',key);fs.mkdirSync(dir,{recursive:true});env[key]=dir;}const p=spawnSync(argv[0],argv.slice(1),{cwd:run,env,windowsHide:true,encoding:'utf8',timeout,maxBuffer:50*1024*1024});const row={command:argv,cwd:run,stdout:p.stdout??'',stderr:p.stderr??'',exitStatus:p.status,signal:p.signal,error:p.error?.message??null};ledger.push(row);fs.writeFileSync(path.join(run,'command-ledger.json'),JSON.stringify(ledger,null,2));process.stdout.write(row.stdout);process.stderr.write(row.stderr);return row;}
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'});
const before=captureSourceState({sourceRoot,sourceSha:head.stdout.trim(),evidenceDirectory:path.join(run,'source-before')});
let sourceQualified=/^[a-f0-9]{40}$/i.test(sourceSha)&&head.status===0&&head.stdout.trim()===sourceSha&&before.clean&&before.rawMatchesHead;
try{
 const config=JSON.parse(fs.readFileSync(path.join(sourceRoot,'tsconfig.electron.json'),'utf8'));config.compilerOptions.outDir=path.join(run,'compiled');config.compilerOptions.rootDir=sourceRoot;config.compilerOptions.typeRoots=[path.join(deps,'@types')];config.include=[...config.include,'src/style-library.ts'].map(p=>path.join(sourceRoot,p));config.exclude=config.exclude.map(p=>path.join(sourceRoot,p));
 const file=path.join(run,'compile.json');fs.writeFileSync(file,JSON.stringify(config,null,2));if(command([process.execPath,path.join(deps,'typescript/bin/tsc'),'-p',file]).exitStatus!==0)throw Error('Native production source compile failed');
 fs.symlinkSync(deps,path.join(run,'compiled/node_modules'),process.platform==='win32'?'junction':'dir');
 const expected=12;
 fs.writeFileSync(path.join(run,'SETUP.json'),JSON.stringify({source:sourceRoot,sourceSha,compiled:path.join(run,'compiled'),deps},null,2));const script=path.join(run,'desktop-library-journeys.cjs');fs.copyFileSync(path.join(sourceRoot,'scripts/feature-acceptance/desktop-library-journeys.cjs'),script);
 const args=process.platform==='linux'?[req('electron'),'--password-store=gnome-libsecret',script]:[req('electron'),script];const actual=command(args);if(actual.exitStatus!==0)throw Error('Actual native library client scenarios failed');
 const report=JSON.parse(fs.readFileSync(path.join(run,'LIBRARY_NATIVE_REPORT.json'),'utf8'));if(report.total!==expected||report.passed!==expected||report.mockedModules!==false||report.platform!==process.platform)throw Error('Native scenario count/runtime mismatch');
 const reopened=command([...args,'--reopen']);if(reopened.exitStatus!==0)throw Error('Native cold reopen failed');const cold=JSON.parse(fs.readFileSync(path.join(run,'LIBRARY_REOPEN.json'),'utf8'));if(!cold.pass||cold.sourceSha!==sourceSha)throw Error('Cold reopen identity differs');
 nativeRuntime={type:'electron',version:report.nativeElectron};checks=report.cases.map(c=>({sourceSha,feature:c.feature,scenario:c.scenario,platform,kind:'native-runtime',acceptanceLevel:'scenario',command:actual.command,stdout:actual.stdout,stderr:actual.stderr,exitStatus:actual.exitStatus,skipped:false,observed:{...c.observed,coldProcessReopenVerified:true}}));exitStatus=0;
}catch(error){failure=error.stack||String(error);process.stderr.write(failure+'\n');}
finally{
 const after=captureSourceState({sourceRoot,sourceSha:head.stdout.trim(),evidenceDirectory:path.join(run,'source-after')});sourceQualified=sourceQualified&&after.clean&&after.rawMatchesHead;
 const receipt={schema:'client-feature-scenarios/v1',sourceSha,platform,profileSha256,isolated:true,mockedModules:false,sourceQualified,nativeRuntime,checks,ledger,exitStatus,failure,run,paidCalls:0,full195Certified:false,clipboardPolicy:'Native clipboard never touched by library journeys'};
 const file=path.join(outputRoot,`desktop-library-${platform}-receipt.json`);fs.writeFileSync(file,JSON.stringify(receipt,null,2));const b=fs.readFileSync(file);console.log('RECEIPT '+file+' SHA256='+crypto.createHash('sha256').update(b).digest('hex')+' CHECKS='+checks.length+' EXIT='+exitStatus);process.exitCode=exitStatus;
}
