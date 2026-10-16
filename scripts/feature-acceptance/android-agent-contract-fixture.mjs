// UNIT TEST DATA ONLY. Never import from a runner or write as native evidence.
import crypto from 'node:crypto';
import {androidAgentTarget as target,androidAgentTestPackage as testPackage,androidAgentRunner as runner,androidAgentScenarioIds as ids} from './android-agent-contract.mjs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export function androidAgentUnitFixture({sourceSha='a'.repeat(40),profileSha256='b'.repeat(64)}={}){
 const sha=sourceSha,profile=profileSha256,nonce='c'.repeat(64),appHash='d'.repeat(64),testHash='e'.repeat(64);
 const proc={pid:2345,uid:10123,startTimeTicks:'1234567',cmdline:'/usr/local/bin/node /workspace/studio-sdk-driver.mjs '};
 const install={preparedBeforeConfirmation:true,activatedAfterConfirmation:true,actualProductionProcessRunning:true,productionDownloadSha256:'f'.repeat(64),productionDownloadBytes:100000,slotManifestSha256:nonce,nativeNodeSha256:appHash,loopbackHttpStatus:200};
 const restore={actualProductionChildStopped:true,userPluginRestoredByteExact:true,sessionRestoredByteExact:true,currentDataPreserved:true,restartedThenExplicitlyStopped:true,pluginSha256:nonce,sessionSha256:nonce};
 const sdk={identity:{pid:2345,arch:'arm64',platform:'linux',nodeVersion:'v24.14.0'},proc,exitStatus:0,actualReadTool:true,loopbackModelRequests:2,actualReadFileSha256:nonce,driverSha256:nonce,cliSha256:nonce,nativeNodeSha256:appHash,controllerAttestedLivePid:true,modelTransport:'actual-localhost-http-sse',paidCalls:0};
 const report={schema:'android-agent-device/v1',sourceSha:sha,profileSha256:profile,nonce,packageName:target,testPackage,apkSha256:appHash,testApkSha256:testHash,nativePid:1234,uid:10123,sdk:34,abi:'arm64-v8a',artVersion:'2.1.0',isolated:true,mockedModules:false,status:'passed',paidCalls:0,
  checks:ids.map((scenario,i)=>({feature:'agent-components',scenario,observed:[install,restore,{explicitMissingInstallError:true,noProcessStarted:true,sdk}][i]}))};
 const begin={...report};delete begin.checks;delete begin.status;delete begin.paidCalls;
 const event=(kind,value)=>'INSTRUMENTATION_STATUS: stream=ANDROID_AGENT_'+kind+' '+JSON.stringify(value)+'\n';
 const stdout=event('BEGIN',begin)+event('CHECK',report.checks[0])+event('CHECK',report.checks[1])+event('SDK_BEGIN',{...proc,nonce})+event('CHECK',report.checks[2])+event('DONE',report)+'INSTRUMENTATION_RESULT: stream=ANDROID AGENT ACCEPTANCE PASS 3\nINSTRUMENTATION_CODE: -1\n';
 const nativeReportText=JSON.stringify(report);
 return {schema:'android-agent-controller/v1',platform:'android',sourceSha:sha,profileSha256:profile,sourceQualified:true,isolated:true,mockedModules:false,exitStatus:0,nonce,adb:'test-adb',device:{serial:'emulator-5554',qemu:'1',boot:'1',abi:'arm64-v8a',kernelArch:'aarch64',sdk:34,isolated:true,ci:true},
  build:{command:['gradle','-PstudioAgentQa','-Ptarget-platform=android-arm64',':app:assembleDebug',':app:assembleDebugAndroidTest'],exitStatus:0,sourceSha:sha,cleanBefore:true,cleanAfter:true},
  apks:{app:{packageName:target,nativeAbis:['arm64-v8a'],debuggable:true,manifestVerified:true,sha256:appHash,bytes:1024},test:{packageName:testPackage,targetPackage:target,runner,manifestVerified:true,sha256:testHash,bytes:1024}},
  instrumentation:{command:['test-adb','-s','emulator-5554','shell','am','instrument','-w','-r','-e','acceptance3','true','-e','isolated','true','-e','sourceSha',sha,'-e','profileSha256',profile,'-e','nonce',nonce,'-e','apkSha256',appHash,'-e','testApkSha256',testHash,testPackage+'/'+runner],exitStatus:0,stdout,stderr:''},
  liveApp:{pid:1234,uid:10123,packageName:target,observedWhileRunning:true},liveSdk:{...proc,observedWhileRunning:true,ackNonce:nonce},nativeReportText,nativeReportSha256:hash(nativeReportText)};
}

export const androidAgentUnitBindings=b=>({sourceSha:b.sourceSha,profileSha256:b.profileSha256});
