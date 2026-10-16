import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const androidAgentTarget='com.codex.novelai.novelai_mobile.agenttest';
export const androidAgentTestPackage=androidAgentTarget+'.test';
export const androidAgentRunner='com.codex.novelai.novelai_mobile.agent.AgentInstrumentation';
export const androidAgentScenarioIds=Object.freeze(['install-verify-activate','stop-restore-recovery','missing-config-actual-process']);
export const androidAgentRuntimeType='android-instrumentation';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const hex=(x,n)=>typeof x==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(x);
const positive=x=>Number.isSafeInteger(x)&&x>1;
const pinnedNodeVersion=JSON.parse(fs.readFileSync(new URL('../../harness/android/runtime-lock.json',import.meta.url),'utf8')).node.version;

export function assertAndroidAgentApks(app,test){
 assert.equal(app.packageName,androidAgentTarget);assert.equal(test.packageName,androidAgentTestPackage);
 assert.equal(app.debuggable,true,'Only the separate debuggable QA APK may be installed');
 assert.equal(test.runner,androidAgentRunner);assert.equal(test.targetPackage,androidAgentTarget);
 assert.deepEqual(app.nativeAbis,['arm64-v8a'],'APK must contain actual ARM64 native executables only');
 for(const a of [app,test]){assert(hex(a.sha256,64));assert(positive(a.bytes));assert.equal(a.manifestVerified,true);}
 return {app,test};
}
export function assertAndroidAgentDevice(device){
 assert(/^emulator-\d+$/.test(device.serial),'Physical/personal devices are forbidden');
 assert.equal(device.qemu,'1');assert.equal(device.boot,'1');assert.equal(device.abi,'arm64-v8a');
 assert.equal(device.kernelArch,'aarch64');assert(Number.isSafeInteger(device.sdk)&&device.sdk>=26);
 assert.equal(device.isolated,true);assert.equal(device.ci,true);
 return device;
}
export function parseAndroidAgentStream(stdout){
 const events=[];
 for(const line of stdout.split(/\r?\n/)){
  const record=line.replace(/^INSTRUMENTATION_STATUS: stream=/,'');
  if(!record.startsWith('ANDROID_AGENT_'))continue;
  const match=/^ANDROID_AGENT_(BEGIN|CHECK|SDK_BEGIN|DONE|FAILED) (\{.*\})$/.exec(record);
  assert(match,'Malformed or unknown reserved Android Agent event');
  events.push({type:match[1],value:JSON.parse(match[2])});
 }
 assert.equal(events.filter(x=>x.type==='BEGIN').length,1,'Exactly one real Instrumentation BEGIN required');
 assert.equal(events.filter(x=>x.type==='DONE').length,1,'Exactly one real Instrumentation DONE required');
 assert.equal(events.filter(x=>x.type==='FAILED').length,0);
 assert.equal(events[0].type,'BEGIN');assert.equal(events.at(-1).type,'DONE');
 assert.equal(events.filter(x=>x.type==='SDK_BEGIN').length,1);
 assert.deepEqual(events.map(x=>x.type),['BEGIN','CHECK','CHECK','SDK_BEGIN','CHECK','DONE']);
 assert.deepEqual(events.filter(x=>x.type==='CHECK').map(x=>x.value.scenario),androidAgentScenarioIds);
 const codes=[...stdout.matchAll(/^INSTRUMENTATION_CODE:\s*(-?\d+)\s*$/gm)].map(x=>Number(x[1]));
 assert.deepEqual(codes,[-1],'Android RESULT_OK (-1), not adb exit zero, is required');
 assert(!/^INSTRUMENTATION_(?:FAILED|ABORTED):/m.test(stdout));
 assert(stdout.includes('ANDROID AGENT ACCEPTANCE PASS 3'));
 return events;
}
export function assertAndroidAgentProof(bundle,{sourceSha,profileSha256}={}){
 assert.equal(bundle.schema,'android-agent-controller/v1');assert.equal(bundle.platform,'android');
 assert(hex(sourceSha,40)&&hex(profileSha256,64),'Independent source/profile bindings required');
 assert.equal(bundle.sourceSha,sourceSha);assert.equal(bundle.profileSha256,profileSha256);
 assert.equal(bundle.sourceQualified,true);assert.equal(bundle.isolated,true);assert.equal(bundle.mockedModules,false);
 assert.equal(bundle.exitStatus,0);assert.equal(bundle.build.exitStatus,0);assert.equal(bundle.build.sourceSha,sourceSha);
 assert.equal(bundle.build.cleanBefore,true);assert.equal(bundle.build.cleanAfter,true);
 assert(bundle.build.command.includes('-PstudioAgentQa')&&bundle.build.command.includes(':app:assembleDebug')&&bundle.build.command.includes(':app:assembleDebugAndroidTest'));
 assert(bundle.build.command.includes('-Ptarget-platform=android-arm64'),'Actual QA build must select the ARM64 Flutter target');
 assertAndroidAgentDevice(bundle.device);assertAndroidAgentApks(bundle.apks.app,bundle.apks.test);
 assert(hex(bundle.nonce,64));assert.equal(bundle.instrumentation.exitStatus,0);
 const command=bundle.instrumentation.command;
 assert.deepEqual(command.slice(0,8),[bundle.adb,'-s',bundle.device.serial,'shell','am','instrument','-w','-r']);
 assert.equal(command.at(-1),androidAgentTestPackage+'/'+androidAgentRunner);
 const expectedArgs={acceptance3:'true',isolated:'true',sourceSha,profileSha256,nonce:bundle.nonce,apkSha256:bundle.apks.app.sha256,testApkSha256:bundle.apks.test.sha256};
 const actualArgs={};for(let i=8;i<command.length-1;i+=3){assert.equal(command[i],'-e');assert(!Object.hasOwn(actualArgs,command[i+1]));actualArgs[command[i+1]]=command[i+2];}
 assert.deepEqual(actualArgs,expectedArgs);
 const events=parseAndroidAgentStream(bundle.instrumentation.stdout);
 const report=JSON.parse(bundle.nativeReportText);
 assert.deepEqual(report,events.at(-1).value,'Pulled native file must equal the actual terminal log record');
 assert.equal(digest(bundle.nativeReportText),bundle.nativeReportSha256);
 assert.equal(report.schema,'android-agent-device/v1');
 for(const key of ['sourceSha','profileSha256','nonce'])assert.equal(report[key],bundle[key]);
 for(const key of ['sourceSha','profileSha256','nonce','nativePid','uid','sdk','abi','apkSha256','testApkSha256','packageName','testPackage'])assert.equal(events[0].value[key],report[key]);
 assert.equal(report.packageName,androidAgentTarget);assert.equal(report.testPackage,androidAgentTestPackage);
 assert.equal(report.apkSha256,bundle.apks.app.sha256);assert.equal(report.testApkSha256,bundle.apks.test.sha256);
 assert.equal(report.abi,'arm64-v8a');assert.equal(report.sdk,bundle.device.sdk);assert(positive(report.nativePid)&&positive(report.uid));
 assert.equal(report.nativePid,bundle.liveApp.pid);assert.equal(report.uid,bundle.liveApp.uid);
 assert.equal(bundle.liveApp.packageName,androidAgentTarget);assert.equal(bundle.liveApp.observedWhileRunning,true);
 assert.equal(report.isolated,true);assert.equal(report.mockedModules,false);assert.equal(report.status,'passed');assert.equal(report.paidCalls,0);
 assert.equal(typeof report.artVersion,'string');assert(report.artVersion.length>0);
 assert.deepEqual(report.checks,events.filter(x=>x.type==='CHECK').map(x=>x.value));
 assert.deepEqual(report.checks.map(x=>x.feature),['agent-components','agent-components','agent-components']);
 assert.deepEqual(report.checks.map(x=>x.scenario),androidAgentScenarioIds);
 const install=report.checks[0].observed, restore=report.checks[1].observed, missing=report.checks[2].observed;
 for(const k of ['preparedBeforeConfirmation','activatedAfterConfirmation','actualProductionProcessRunning'])assert.equal(install[k],true);
 for(const k of ['productionDownloadSha256','slotManifestSha256','nativeNodeSha256'])assert(hex(install[k],64));
 assert(positive(install.productionDownloadBytes));assert([200,401].includes(install.loopbackHttpStatus));
 for(const k of ['actualProductionChildStopped','userPluginRestoredByteExact','sessionRestoredByteExact','currentDataPreserved','restartedThenExplicitlyStopped'])assert.equal(restore[k],true);
 for(const k of ['pluginSha256','sessionSha256'])assert(hex(restore[k],64));
 assert.equal(missing.explicitMissingInstallError,true);assert.equal(missing.noProcessStarted,true);
 const sdk=missing.sdk;assert.equal(sdk.exitStatus,0);assert.equal(sdk.actualReadTool,true);assert.equal(sdk.loopbackModelRequests,2);
 assert.equal(sdk.paidCalls,0);assert.equal(sdk.controllerAttestedLivePid,true);assert.equal(sdk.modelTransport,'actual-localhost-http-sse');
 assert.equal(sdk.identity.arch,'arm64');assert.equal(sdk.identity.platform,'linux');assert.equal(sdk.identity.nodeVersion,'v'+pinnedNodeVersion);
 assert(positive(sdk.identity.pid));assert.notEqual(sdk.identity.pid,report.nativePid);
 assert.equal(sdk.identity.pid,sdk.proc.pid);assert.equal(sdk.proc.uid,report.uid);
 assert.equal(sdk.proc.pid,bundle.liveSdk.pid);assert.equal(sdk.proc.uid,bundle.liveSdk.uid);
 assert.equal(sdk.proc.startTimeTicks,bundle.liveSdk.startTimeTicks);assert.equal(sdk.proc.cmdline,bundle.liveSdk.cmdline);
 assert.equal(bundle.liveSdk.observedWhileRunning,true);assert.equal(bundle.liveSdk.ackNonce,bundle.nonce);
 const sdkEvent=events.find(x=>x.type==='SDK_BEGIN').value;
 for(const k of ['pid','uid','startTimeTicks','cmdline'])assert.equal(sdkEvent[k],sdk.proc[k]);
 assert.equal(sdkEvent.nonce,bundle.nonce);assert(/^\d+$/.test(sdk.proc.startTimeTicks));assert(sdk.proc.cmdline.includes('studio-sdk-driver.mjs'));
 for(const k of ['actualReadFileSha256','driverSha256','cliSha256','nativeNodeSha256'])assert(hex(sdk[k],64));
 assert.equal(sdk.nativeNodeSha256,install.nativeNodeSha256);
 return report;
}
/** Dedicated admission; never use the new runtime type for another platform or feature. */
export function androidAgentScenarioReceipt(bundle,bindings){
 const report=assertAndroidAgentProof(bundle,bindings);
 return {schema:'client-feature-scenarios/v1',sourceSha:bundle.sourceSha,platform:'android',profileSha256:bundle.profileSha256,
  sourceQualified:true,isolated:true,mockedModules:false,exitStatus:0,
  nativeRuntime:{type:androidAgentRuntimeType,version:`Android ${report.sdk}; ART ${report.artVersion}`},
  androidAgentProofSha256:digest(JSON.stringify(bundle)),
  checks:report.checks.map(check=>({...check,sourceSha:bundle.sourceSha,platform:'android',acceptanceLevel:'scenario',kind:'device',exitStatus:0,skipped:false,
   command:bundle.instrumentation.command,stdout:bundle.instrumentation.stdout,stderr:bundle.instrumentation.stderr}))};
}
