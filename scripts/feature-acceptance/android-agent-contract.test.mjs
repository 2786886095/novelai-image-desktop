import {androidAgentUnitFixture as fixture} from './android-agent-contract-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {androidAgentTarget as target,androidAgentTestPackage as testPackage,androidAgentRunner as runner,androidAgentScenarioIds as ids,assertAndroidAgentProof,androidAgentScenarioReceipt} from './android-agent-contract.mjs';
import {parseAgentApkManifests,parseAgentProc,runAndroidAgent} from './android-agent-runner.mjs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
// Pure host negative/positive schema fixtures. These are never written as a
// native receipt and cannot constitute Android execution evidence.
const bindings=b=>({sourceSha:b.sourceSha,profileSha256:b.profileSha256});
const alterBegin=(b,key,value)=>{b.instrumentation.stdout=b.instrumentation.stdout.replace(/(ANDROID_AGENT_BEGIN )(\{[^\r\n]*\})/,(_,prefix,json)=>prefix+JSON.stringify({...JSON.parse(json),[key]:value}));};
test('strict three-scenario schema accepts a fully linked in-memory HOST fixture (not a device pass)',()=>{
 const b=fixture();assert.equal(assertAndroidAgentProof(b,bindings(b)).checks.length,3);
 const r=androidAgentScenarioReceipt(b,bindings(b));assert.equal(r.nativeRuntime.type,'android-instrumentation');assert.equal(r.platform,'android');assert.equal(r.checks.length,3);assert(r.checks.every(c=>c.kind==='device'&&c.feature==='agent-components'));
});
const rejects={
 ios:b=>b.platform='ios',
 dirty:b=>b.sourceQualified=false,
 unisolated:b=>b.isolated=false,
 mocked:b=>b.mockedModules=true,
 nativeExit:b=>b.instrumentation.exitStatus=1,
 buildFailed:b=>b.build.exitStatus=1,
 changedSource:b=>b.build.sourceSha='f'.repeat(40),
 dirtyAfterBuild:b=>b.build.cleanAfter=false,
 ordinaryApk:b=>b.apks.app.packageName=target.replace('.agenttest',''),
 wrongTestTarget:b=>b.apks.test.targetPackage='com.other.app',
 wrongRunner:b=>b.apks.test.runner='android.test.InstrumentationTestRunner',
 releaseApk:b=>b.apks.app.debuggable=false,
 x86Apk:b=>b.apks.app.nativeAbis=['x86_64'],
 wrongApkHash:b=>b.apks.app.sha256='0'.repeat(64),
 wrongTestApkHash:b=>b.apks.test.sha256='0'.repeat(64),
 physical:b=>b.device.serial='human-phone',
 realPhone:b=>b.device.qemu='0',
 x86Device:b=>b.device.abi='x86_64',
 wrongKernel:b=>b.device.kernelArch='x86_64',
 unbooted:b=>b.device.boot='0',
 lowApi:b=>b.device.sdk=25,
 appPid:b=>b.liveApp.pid++,
 appUid:b=>b.liveApp.uid++,
 notLiveApp:b=>b.liveApp.observedWhileRunning=false,
 sdkPid:b=>b.liveSdk.pid++,
 sdkUid:b=>b.liveSdk.uid++,
 sdkReusedPid:b=>b.liveSdk.startTimeTicks='99',
 noSdkAck:b=>b.liveSdk.ackNonce='0'.repeat(64),
 notLiveSdk:b=>b.liveSdk.observedWhileRunning=false,
 missingDone:b=>b.instrumentation.stdout=b.instrumentation.stdout.replace(/^.*ANDROID_AGENT_DONE .*\n/m,''),
 badFinish:b=>b.instrumentation.stdout=b.instrumentation.stdout.replace('INSTRUMENTATION_CODE: -1','INSTRUMENTATION_CODE: 0'),
 duplicateFinish:b=>b.instrumentation.stdout+='INSTRUMENTATION_CODE: -1\n',
 failedTerminal:b=>b.instrumentation.stdout+='INSTRUMENTATION_FAILED: test failed\n',
 missingCheck:b=>b.instrumentation.stdout=b.instrumentation.stdout.replace(/^.*ANDROID_AGENT_CHECK .*\n/m,''),
 duplicateCheck:b=>b.instrumentation.stdout+=b.instrumentation.stdout.split('\n').find(x=>x.includes('ANDROID_AGENT_CHECK'))+'\n',
 logFileMismatch:b=>{const r=JSON.parse(b.nativeReportText);r.checks[0].observed.loopbackHttpStatus=401;b.nativeReportText=JSON.stringify(r);b.nativeReportSha256=hash(b.nativeReportText)},
 fileHash:b=>b.nativeReportSha256='0'.repeat(64),
 nonce:b=>b.nonce='0'.repeat(64),
 unsupportedFeature:b=>b.instrumentation.stdout=b.instrumentation.stdout.replaceAll('"agent-components"','"updates"'),
 wrongScenario:b=>b.instrumentation.stdout=b.instrumentation.stdout.replaceAll('"install-verify-activate"','"unknown"'),
 wrongCommand:b=>b.instrumentation.command[b.instrumentation.command.length-1]='com.other/Runner',
 alteredCommandNonce:b=>{b.instrumentation.command[b.instrumentation.command.indexOf('nonce')+1]='0'.repeat(64)},
 duplicateCommandField:b=>b.instrumentation.command.splice(-1,0,'-e','nonce',b.nonce),
 wrongSerialInCommand:b=>b.instrumentation.command[2]='emulator-9999',
 missingBuildMain:b=>b.build.command=b.build.command.filter(x=>x!==':app:assembleDebug'),
 missingArm64Target:b=>b.build.command=b.build.command.filter(x=>x!=='-Ptarget-platform=android-arm64'),
 beginSource:b=>alterBegin(b,'sourceSha','0'.repeat(40)),
 beginProfile:b=>alterBegin(b,'profileSha256','0'.repeat(64)),
 beginNonce:b=>alterBegin(b,'nonce','0'.repeat(64)),
 malformedFailed:b=>b.instrumentation.stdout=b.instrumentation.stdout.replace('INSTRUMENTATION_RESULT:','INSTRUMENTATION_STATUS: stream=ANDROID_AGENT_FAILED {bad\nINSTRUMENTATION_RESULT:'),
 malformedCheck:b=>b.instrumentation.stdout=b.instrumentation.stdout.replace('INSTRUMENTATION_RESULT:','INSTRUMENTATION_STATUS: stream=ANDROID_AGENT_CHECK {bad\nINSTRUMENTATION_RESULT:'),
};
for(const [name,mutate] of Object.entries(rejects))test('rejects '+name,()=>{const b=fixture(),bound=bindings(b);mutate(b);assert.throws(()=>assertAndroidAgentProof(b,bound));});
test('independent source and profile cannot be replaced by body parameters',()=>{const b=fixture();assert.throws(()=>assertAndroidAgentProof(b,{...bindings(b),sourceSha:'0'.repeat(40)}));assert.throws(()=>assertAndroidAgentProof(b,{...bindings(b),profileSha256:'0'.repeat(64)}));});
test('manifest parser binds actual test APK runner and target; production package is not accepted',()=>{
 const a="package: name='"+target+"'\napplication-debuggable\nnative-code: 'arm64-v8a'\n";
 const t="package: name='"+testPackage+"'\n";
 const x=`E: manifest\n  E: instrumentation\n    A: android:name(0x01010003)="${runner}" (Raw: "${runner}")\n    A: android:targetPackage(0x01010021)="${target}"\n  E: application\n`;
 const r=parseAgentApkManifests(a,t,x);assert.equal(r.test.runner,runner);assert.equal(r.test.targetPackage,target);assert.deepEqual(r.app.nativeAbis,['arm64-v8a']);assert.equal(r.app.debuggable,true);
});
test('proc parser handles spaces in comm and preserves exact child cmdline',()=>{
 const fields=Array(25).fill('0');fields[19]='9876';const p=parseAgentProc('Name: node\nUid:\t10123\t10123\n','2345 (node app) '+fields.join(' '),'node\0/workspace/studio-sdk-driver.mjs\0');
 assert.equal(p.startTimeTicks,'9876');assert.equal(p.uid,10123);assert.equal(p.cmdline,'node /workspace/studio-sdk-driver.mjs ');
 assert.throws(()=>parseAgentProc('Uid: 0','x (node) '+fields.join(' '),'node'));
});
test('real runner rejects ordinary device before any adb or source build; no emulator is started by host tests',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const output=fs.mkdtempSync(path.join(os.tmpdir(),'agent-admission-host-'));
 const old=process.env.GITHUB_ACTIONS;process.env.GITHUB_ACTIONS='true';
 try{await assert.rejects(runAndroidAgent({projectRoot:process.cwd(),outputRoot:output,sourceSha:'a'.repeat(40),isolated:true,device:'human-phone',adb:'DO_NOT_EXECUTE',gradle:'DO_NOT_EXECUTE'}),/Physical devices/);const cmds=JSON.parse(fs.readFileSync(path.join(output,'COMMANDS.json'),'utf8')||'[]');assert.deepEqual(cmds,[]);}
 finally{if(old===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=old;fs.rmSync(output,{recursive:true,force:true});}
});
