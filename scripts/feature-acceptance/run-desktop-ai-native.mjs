import {prepareMacNativeKeychain} from './mac-native-keychain.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {profileSha256} from './full-feature-profiles.mjs';
import {captureSourceState} from './source-state.mjs';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';

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
async function command(argv,timeout=300000){
 const env={...process.env};for(const k of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_FILE','NODE_OPTIONS'])delete env[k];
 for(const key of Object.keys(env))if(/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key))delete env[key];
 for(const key of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP']){const dir=path.join(run,'environment',key);fs.mkdirSync(dir,{recursive:true});env[key]=dir;}
 const record=await runBoundedNativeCommand(argv,{cwd:source,env,timeout,maxBuffer:40*1024*1024,onStdout:b=>process.stdout.write(b),onStderr:b=>process.stderr.write(b)});ledger.push(record);
 fs.writeFileSync(path.join(run,'command-ledger.json'),JSON.stringify(ledger,null,2));return record;
}
const expected=[['reverse','mode-and-scope-system-import'],['reverse','valid-json-and-visible-result'],['reverse','refusal-truncated-invalid-preserve'],['convert','three-modes-and-import'],['convert','structured-variants-preserve-escapes'],['convert','errors-preserve-results'],['translation','languages-source-detect'],['translation','preserve-tags-weights'],['translation','failure-cancel-no-overwrite'],['ai-records','record-request-response-status'],['ai-records','refresh-expand-clear-memory-history-boundary'],['ai-records','sensitive-fields-redacted'],['reverse','versioned-skill-catalog-and-models'],['reverse','inline-controls-stale-no-apply'],['convert','versioned-skill-editing-overlays'],['settings','skill-selection-custom-cold-reopen'],['settings','persist-and-reopen'],['settings','independent-service-proxy'],['settings','invalid-change-no-destruction'],['external-mcp-server','tool-discovery-native-bridge'],['external-mcp-server','actual-local-tool-request'],['external-mcp-server','auth-errors-budget-safety']];

let status=1,checks=[],stopKeychain=async()=>{};
try{
 stopKeychain=await prepareMacNativeKeychain({run});
 const config=JSON.parse(fs.readFileSync(path.join(source,'tsconfig.electron.json'),'utf8'));
 config.compilerOptions.outDir=path.join(run,'compiled');config.compilerOptions.rootDir=source;config.compilerOptions.typeRoots=[path.join(deps,'@types')];
 config.include=[...config.include,'src/translation-session.ts'].map(p=>path.join(source,p));config.exclude=config.exclude.map(p=>path.join(source,p));
 const file=path.join(run,'compile.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
 if((await command([process.execPath,path.join(deps,'typescript/bin/tsc'),'-p',file])).exitStatus!==0)throw Error('Native AI production compilation failed');
 fs.symlinkSync(deps,path.join(run,'compiled/node_modules'),process.platform==='win32'?'junction':'dir');
 const git=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:source,encoding:'utf8'});
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'});
 const qualified=/^[a-f0-9]{40}$/.test(sourceSha)&&head.status===0&&head.stdout.trim()===sourceSha&&git.status===0&&!git.stdout.trim()&&before.clean&&before.rawMatchesHead;
 fs.writeFileSync(path.join(run,'SETUP.json'),JSON.stringify({source,compiled:path.join(run,'compiled'),deps,sourceSha,platform,profileSha256,sourceQualified:qualified},null,2));
 const target=path.join(run,'desktop-ai-journeys.cjs');fs.copyFileSync(path.join(source,'scripts/feature-acceptance/desktop-ai-journeys.cjs'),target);
 const argv=[req('electron'),...(process.platform==='linux'?['--password-store=gnome-libsecret']:[]),target];
 const actual=await command(argv,180000);if(actual.timedOut||actual.outputOverflow||actual.error)throw Error('Native AI command failed: '+JSON.stringify({exitStatus:actual.exitStatus,timedOut:actual.timedOut,error:actual.error}));const report=JSON.parse(fs.readFileSync(path.join(run,'AI_NATIVE_REPORT.json'),'utf8'));
 if(report.mockedModules!==false||report.platform!==platform||typeof report.electron!=='string')throw Error('Wrong native AI runtime identity');
 if(JSON.stringify(report.cases.map(item=>[item.feature,item.scenario]))!==JSON.stringify(expected))throw Error('Native AI scenario inventory differs from controller');
 const cold=await command([...argv,'--cold-reopen'],45000);
 if(cold.exitStatus!==0)throw Error('Independent cold-process settings/credential/history reopen failed');
 const reopened=JSON.parse(fs.readFileSync(path.join(run,'COLD_REOPEN.json'),'utf8'));
 const persisted=report.cases.find(item=>item.feature==='settings'&&item.scenario==='persist-and-reopen');
 const skillPersisted=report.cases.find(item=>item.feature==='settings'&&item.scenario==='skill-selection-custom-cold-reopen');
 if(skillPersisted)skillPersisted.observed={...skillPersisted.observed,coldProcessExitStatus:cold.exitStatus,coldProcessPid:reopened.pid,actualNativeSkillsReopened:true,coldCommand:cold.command,coldStdout:cold.stdout,coldStderr:cold.stderr};
 if(persisted)persisted.observed={...persisted.observed,coldProcessExitStatus:cold.exitStatus,coldProcessPid:reopened.pid,actualCredentialReopened:true,coldCommand:cold.command,coldStdout:cold.stdout,coldStderr:cold.stderr};
 checks=report.cases.map(item=>({feature:item.feature,scenario:item.scenario,acceptanceLevel:'scenario',sourceSha,platform,kind:'integration',exitStatus:item.pass?0:1,skipped:false,command:actual.command,stdout:actual.stdout,stderr:actual.stderr,observed:item.observed||{error:item.error}}));
 status=actual.exitStatus===0&&report.passed===report.total&&report.total===expected.length?0:1;
 await stopKeychain();
 const headAfter=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'});
 const after=captureSourceState({sourceRoot:source,sourceSha:headBefore.stdout.trim(),evidenceDirectory:path.join(run,'source-after')});
 const receipt={schema:'client-feature-scenarios/v1',sourceSha,platform,profileSha256,sourceQualified:qualified&&after.clean&&after.rawMatchesHead&&headAfter.stdout.trim()===headBefore.stdout.trim(),isolated:true,mockedModules:false,exitStatus:status,nativeRuntime:{type:'electron',version:report.electron},checks,run,ledger,boundaries:['Production client APIs/storage/real loopback and real renderer store, not upstream visual quality or live paid account acceptance.','AI call log is intentionally in-memory; text-tool history and settings persistence are tested separately.']};
 fs.writeFileSync(path.join(output,`desktop-ai-${platform}-scenarios.json`),JSON.stringify(receipt,null,2));
}catch(e){console.error(e.stack||e);}
finally{try{await stopKeychain();}catch(error){status=1;console.error(error.stack||error);}fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify({sourceSha,platform,run,exitStatus:status,checks:checks.length,passed:checks.filter(x=>x.exitStatus===0).length},null,2));process.exitCode=status;}
