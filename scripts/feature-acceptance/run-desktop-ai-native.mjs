import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {profileSha256} from './full-feature-profiles.mjs';
import {captureSourceState} from './mobile-entry-workspace.mjs';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});
const deps=path.join(source,'node_modules'),req=createRequire(path.join(source,'package.json'));
const platform={win32:'windows',darwin:'macos',linux:'linux'}[process.platform];
if(!platform)throw Error('Native desktop host required');
const sourceSha=process.argv[3]||'uncommitted';
const run=path.join(output,crypto.randomUUID());fs.mkdirSync(run);
const ledger=[];
const headBefore=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'});
const before=captureSourceState({sourceRoot:source,sourceSha:headBefore.stdout.trim(),evidenceDirectory:path.join(run,'source-before')});
function command(argv,timeout=300000){
 const env={...process.env};for(const k of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_FILE'])delete env[k];
 const r=spawnSync(argv[0],argv.slice(1),{cwd:source,env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:40*1024*1024});
 const record={command:argv,cwd:source,stdout:r.stdout||'',stderr:r.stderr||'',exitStatus:r.status,error:r.error?.message||null};ledger.push(record);
 fs.writeFileSync(path.join(run,'command-ledger.json'),JSON.stringify(ledger,null,2));
 process.stdout.write(record.stdout);process.stderr.write(record.stderr);return record;
}
let status=1,checks=[];
try{
 const config=JSON.parse(fs.readFileSync(path.join(source,'tsconfig.electron.json'),'utf8'));
 config.compilerOptions.outDir=path.join(run,'compiled');config.compilerOptions.rootDir=source;config.compilerOptions.typeRoots=[path.join(deps,'@types')];
 config.include=[...config.include,'src/translation-session.ts'].map(p=>path.join(source,p));config.exclude=config.exclude.map(p=>path.join(source,p));
 const file=path.join(run,'compile.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
 if(command([process.execPath,path.join(deps,'typescript/bin/tsc'),'-p',file]).exitStatus!==0)throw Error('Native AI production compilation failed');
 fs.symlinkSync(deps,path.join(run,'compiled/node_modules'),process.platform==='win32'?'junction':'dir');
 const git=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:source,encoding:'utf8'});
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'});
 const qualified=/^[a-f0-9]{40}$/.test(sourceSha)&&head.status===0&&head.stdout.trim()===sourceSha&&git.status===0&&!git.stdout.trim()&&before.clean&&before.rawMatchesHead;
 fs.writeFileSync(path.join(run,'SETUP.json'),JSON.stringify({source,compiled:path.join(run,'compiled'),deps,sourceSha,platform,profileSha256,sourceQualified:qualified},null,2));
 const target=path.join(run,'desktop-ai-journeys.cjs');fs.copyFileSync(path.join(source,'scripts/feature-acceptance/desktop-ai-journeys.cjs'),target);
 const argv=[req('electron'),...(process.platform==='linux'?['--password-store=gnome-libsecret']:[]),target];
 const actual=command(argv,180000);const report=JSON.parse(fs.readFileSync(path.join(run,'AI_NATIVE_REPORT.json'),'utf8'));
 const cold=command([...argv,'--cold-reopen'],45000);
 if(cold.exitStatus!==0)throw Error('Independent cold-process settings/credential/history reopen failed');
 const reopened=JSON.parse(fs.readFileSync(path.join(run,'COLD_REOPEN.json'),'utf8'));
 const persisted=report.cases.find(item=>item.feature==='settings'&&item.scenario==='persist-and-reopen');
 if(persisted)persisted.observed={...persisted.observed,coldProcessExitStatus:cold.exitStatus,coldProcessPid:reopened.pid,actualCredentialReopened:true,coldCommand:cold.command,coldStdout:cold.stdout,coldStderr:cold.stderr};
 checks=report.cases.map(item=>({feature:item.feature,scenario:item.scenario,acceptanceLevel:'scenario',sourceSha,platform,kind:'integration',exitStatus:item.pass?0:1,skipped:false,command:actual.command,stdout:actual.stdout,stderr:actual.stderr,observed:item.observed||{error:item.error}}));
 status=actual.exitStatus===0&&report.passed===report.total&&report.total>0?0:1;
 const headAfter=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'});
 const after=captureSourceState({sourceRoot:source,sourceSha:headBefore.stdout.trim(),evidenceDirectory:path.join(run,'source-after')});
 const receipt={schema:'client-feature-scenarios/v1',sourceSha,platform,profileSha256,sourceQualified:qualified&&after.clean&&after.rawMatchesHead&&headAfter.stdout.trim()===headBefore.stdout.trim(),isolated:true,mockedModules:false,exitStatus:status,nativeRuntime:{type:'electron',version:report.electron},checks,run,ledger,boundaries:['Production client APIs/storage/real loopback and real renderer store, not upstream visual quality or live paid account acceptance.','AI call log is intentionally in-memory; text-tool history and settings persistence are tested separately.']};
 fs.writeFileSync(path.join(output,`desktop-ai-${platform}-scenarios.json`),JSON.stringify(receipt,null,2));
}catch(e){console.error(e.stack||e);}
finally{fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify({sourceSha,platform,run,exitStatus:status,checks:checks.length,passed:checks.filter(x=>x.exitStatus===0).length},null,2));process.exitCode=status;}
