import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAndroidRuntimeHealth} from './android-runtime-health.mjs';
import {inspectAndroidForeground,prepareAndroidNative} from './android-native-preflight.mjs';
// Original captured K failure prefix; subsequent healthy cases are explicitly synthetic host contracts.
const trace={
  "sourceReceipt": {
    "path": "F:\\AI\\agent\\codex\\.tmp\\r260k-968a74eb\\k-android-gallery-text-failure\\extracted\\text\\feature-native-android\\text15\\native-mobile-receipt.json",
    "bytes": 465873,
    "sha256": "cfe41ab142fed7601820f04b920eb36523749b602b11999c77fbacff8cfe79d5"
  },
  "sourceHead": "14484802da37cd4f2dfafc0595b9d071adc30802",
  "ledger": [
    {
      "index": 18,
      "command": [
        "flutter",
        "build",
        "apk",
        "--debug",
        "--no-pub",
        "-t",
        "integration_test/native_text_scenarios.dart",
        "--dart-define=FEATURE_ISOLATED_DEVICE=true",
        "--dart-define=FEATURE_SOURCE_SHA=14484802da37cd4f2dfafc0595b9d071adc30802",
        "--dart-define=FEATURE_PROFILE_SHA=7c8061884ca02547f679d3537c35cf288ffed790e24ed0ab95ff04f3aea8d188",
        "--dart-define=FEATURE_TEST_ENTRY=text15"
      ],
      "cwd": "/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile",
      "stdout": "\nRunning Gradle task 'assembleDebug'...                          \nLIBRARY BUILD PASS: native Harness UI module created.\nRESPONSIVE CLIENT BUILT\nBRAND BUILD PASS: original Studio icon embedded; sidebar and hero slots composed without renaming upstream packages.\nRunning Gradle task 'assembleDebug'...                            246.9s\n✓ Built build/app/outputs/flutter-apk/app-debug.apk\n",
      "stderr": "",
      "exitStatus": 0,
      "signal": null,
      "error": null
    },
    {
      "index": 19,
      "command": [
        "/usr/local/lib/android/sdk/platform-tools/adb",
        "-s",
        "emulator-5554",
        "install",
        "-r",
        "-t",
        "/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile/build/app/outputs/flutter-apk/app-debug.apk"
      ],
      "cwd": "/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile",
      "stdout": "Performing Streamed Install\nSuccess\n",
      "stderr": "",
      "exitStatus": 0,
      "signal": null,
      "error": null
    },
    {
      "index": 36,
      "command": [
        "flutter",
        "run",
        "-t",
        "integration_test/native_text_scenarios.dart",
        "-d",
        "emulator-5554",
        "--no-pub",
        "--no-resident",
        "--use-application-binary=/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile/build/app/outputs/flutter-apk/app-debug.apk",
        "--dart-define=FEATURE_ISOLATED_DEVICE=true",
        "--dart-define=FEATURE_SOURCE_SHA=14484802da37cd4f2dfafc0595b9d071adc30802",
        "--dart-define=FEATURE_PROFILE_SHA=7c8061884ca02547f679d3537c35cf288ffed790e24ed0ab95ff04f3aea8d188",
        "--dart-define=FEATURE_TEST_ENTRY=text15"
      ],
      "cwd": "/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile",
      "stdout": "Launching integration_test/native_text_scenarios.dart on sdk gphone64 x86 64 in debug mode...\nInstalling build/app/outputs/flutter-apk/app-debug.apk...        1,502ms\nI/flutter ( 6183): FEATURE_ACCEPTANCE_BEGIN:{\"sourceSha\":\"14484802da37cd4f2dfafc0595b9d071adc30802\",\"profileSha\":\"7c8061884ca02547f679d3537c35cf288ffed790e24ed0ab95ff04f3aea8d188\",\"platform\":\"android\",\"kind\":\"device\",\"nativeOnly\":true,\"mockOnly\":false,\"paidCalls\":0,\"testEntry\":\"text15\",\"expectedChecks\":15,\"nativePid\":6183}\nI/flutter ( 6183): FEATURE_NATIVE_FOREGROUND:resumed; actual first/resumed frames rendered\nI/flutter ( 6183): FEATURE_ACCEPTANCE_PENDING:{\"sourceSha\":\"14484802da37cd4f2dfafc0595b9d071adc30802\",\"profileSha\":\"7c8061884ca02547f679d3537c35cf288ffed790e24ed0ab95ff04f3aea8d188\",\"platform\":\"android\",\"feature\":\"agent-components\",\"status\":\"pending\",\"reason\":\"{\\\"nativeStatus\\\":{\\\"supported\\\":true,\\\"running\\\":false,\\\"phase\\\":\\\"not_installed\\\"},\\\"installActivateProcessNotExecuted\\\":true}\",\"kind\":\"device\",\"nativeOnly\":true,\"testEntry\":\"text15\",\"mockOnly\":false,\"paidCalls\":0}\nSyncing files to device sdk gphone64 x86 64...                  \nD/EGL_emulation( 6183): app_time_stats: avg=206.24ms min=85.30ms max=585.48ms count=5\nSyncing files to device sdk gphone64 x86 64...                     295ms\n",
      "stderr": "",
      "exitStatus": 0,
      "signal": null,
      "error": null
    },
    {
      "index": 37,
      "command": [
        "/usr/local/lib/android/sdk/platform-tools/adb",
        "-s",
        "emulator-5554",
        "shell",
        "pidof",
        "com.codex.novelai.novelai_mobile"
      ],
      "cwd": "/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile",
      "stdout": "6183\n",
      "stderr": "",
      "exitStatus": 0,
      "signal": null,
      "error": null
    },
    {
      "index": 38,
      "command": [
        "/usr/local/lib/android/sdk/platform-tools/adb",
        "-s",
        "emulator-5554",
        "shell",
        "uiautomator",
        "dump",
        "/data/local/tmp/acceptance-window.xml"
      ],
      "cwd": "/home/runner/work/_temp/feature-mobile-workspace-android-text15-d2DGtb/source/mobile",
      "stdout": "",
      "stderr": "ERROR: could not get idle state.\n",
      "exitStatus": 0,
      "signal": null,
      "error": null
    }
  ]
};
const actualLaunch=trace.ledger.find(x=>x.index===36),actualIdle=trace.ledger.find(x=>x.index===38);
const APP='com.codex.novelai.novelai_mobile',XML='/data/local/tmp/acceptance-window.xml';
const GOOD_XML='<hierarchy rotation="0"><node package="'+APP+'" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]"/></hierarchy>';
const GOOD_FOCUS='mCurrentFocus=Window{42 u0 '+APP+'/.MainActivity}\nmFocusedApp=ActivityRecord{42 u0 '+APP+'/.MainActivity t1}\n';
const GOOD_POLICY='WINDOW MANAGER POLICY STATE\nKeyguardServiceDelegate\n  showing=false\n  inputRestricted=false\n  KeyguardStateMonitor\n    mIsShowing=false\n    mInputRestricted=false\n  Looper state:\n';
const GOOD_DUMP={exitStatus:0,stdout:'UI hierchary dumped to: '+XML+'\n',stderr:'',error:null,signal:null};
const idle={...actualIdle};delete idle.index;
function fixture({steps=[{}],exhausted=false,options={},cost=0}={}) {
 let elapsed=0,dumps=0,current={},stored='STALE XML MUST NOT BE READ';const calls=[],phases=[];
 const command=(argv,cwd,timeout)=>{
  const args=argv.slice(3).join(' ');calls.push({argv,cwd,timeout,at:elapsed});
  elapsed+=Math.min(typeof cost==='function'?cost(args):cost,timeout);
  const ok={exitStatus:0,stdout:'',stderr:'',error:null,signal:null};
  if(args==='shell rm -f '+XML){stored=null;return options.clearResult??ok;}
  if(args==='shell uiautomator dump '+XML){
   if(exhausted&&dumps>=steps.length)throw Error('No further captured observation exists.');
   current=steps[Math.min(dumps++,steps.length-1)];const r=current.dump??GOOD_DUMP;
   if(typeof r.stdout==='string'&&r.stdout.includes('dumped to:'))stored=current.xml??GOOD_XML;return r;
  }
  if(args==='shell cat '+XML){assert.notEqual(stored,null,'Must never read stale XML after an unavailable dump');return {...ok,stdout:stored};}
  if(args==='shell dumpsys window windows'||args==='shell dumpsys window')return {...ok,stdout:current.focus??GOOD_FOCUS};
  if(args==='shell dumpsys window displays')return current.displayResult??{...ok,stdout:current.displayFocus??current.focus??GOOD_FOCUS};
  if(args==='shell dumpsys window policy')return {...ok,stdout:current.policy??GOOD_POLICY};
  if(args==='shell pidof '+APP)return {...ok,stdout:current.pid??'6183\n'};
  throw Error('Unexpected command; native device commands are never executed by host fixture: '+args);
 };
 const input={adb:actualIdle.command[0],device:'emulator-5554',appId:APP,command,phase:p=>phases.push(p),
  now:()=>elapsed,sleep:async ms=>{elapsed+=ms;},journeyDeadline:300000,
  nativeStdout:actualLaunch.stdout,sourceSha:trace.sourceHead,profileSha:'7c8061884ca02547f679d3537c35cf288ffed790e24ed0ab95ff04f3aea8d188',
  entry:'text15',expectedChecks:15,expectedNativePid:6183,...options};
 return {input,calls,phases,get dumps(){return dumps;},get elapsed(){return elapsed;},run:()=>observeAndroidRuntimeHealth(input)};
}
function noHealth(f){assert.equal(f.phases.some(p=>p.stage==='runtime-health-observed'),false);assert.equal(f.calls.some(c=>c.argv.includes('tap')||c.argv.includes('run')||c.argv.includes('build')),false);}
function attempts(f){return f.phases.filter(p=>p.stage==='runtime-health-unavailable').length;}

test('unchanged original inspector still hard-fails exact captured K text idle trace',async()=>{
 const f=fixture({steps:[{dump:idle}]});await assert.rejects(inspectAndroidForeground(f.input),/fresh hierarchy/);assert.equal(f.dumps,1);noHealth(f);
});
test('only captured K prefix never becomes a recovered native success without a future observation',async()=>{
 const f=fixture({steps:[{dump:idle}],exhausted:true});await assert.rejects(f.run(),/No further captured observation/);assert.equal(attempts(f),1);noHealth(f);
});
test('captured idle plus explicitly synthetic fresh target XML/focus/unlocked/samePID proves host retry contract only',async()=>{
 const f=fixture({steps:[{dump:idle},{}]});const r=await f.run();assert.equal(r.attempt,2);assert.equal(r.observedNativePid,6183);assert.match(r.freshHierarchySha256,/^[a-f0-9]{64}$/);assert.equal(attempts(f),1);assert.equal(f.phases.filter(p=>p.stage==='runtime-health-observed').length,1);
 assert.equal(f.calls.filter(c=>c.argv.slice(-4).join(' ')==='shell rm -f '+XML).length,2);
 assert.equal(f.calls.filter(c=>c.argv.slice(-3).join(' ')==='shell cat '+XML).length,1);
});
test('persistent exact idle is a three-attempt failure, never a health/ready/check record',async()=>{
 const f=fixture({steps:[{dump:idle},{dump:idle},{dump:idle},{}]});await assert.rejects(f.run(),/retry budget exhausted/);assert.equal(f.dumps,3);assert.equal(attempts(f),3);noHealth(f);
});
for(const [name,dump] of [
 ['nonzero exit',{...idle,exitStatus:1}],['signal',{...idle,signal:'SIGTERM'}],['error',{...idle,error:'ETIMEDOUT'}],
 ['timed out',{...idle,timedOut:true}],['overflow',{...idle,outputOverflow:true}],
 ['unexpected stderr',{...idle,stderr:'ERROR: access denied\n'}],['null root',{...idle,stderr:'ERROR: null root node returned by UiTestAutomationBridge.\n'}],
 ['partial stdout',{...idle,stdout:'partial'}],['extra stderr',{...idle,stderr:idle.stderr+'Permission denied\n'}],
 ['whitespace stdout',{...idle,stdout:' '}],['missing stdout',{...idle,stdout:undefined}],
])test('hard failure without retry: '+name,async()=>{
 const f=fixture({steps:[{dump},{}]});await assert.rejects(f.run());assert.equal(f.dumps,1);assert.equal(attempts(f),0);noHealth(f);
});
test('stale hierarchy removal error remains hard failure before any dump',async()=>{
 const f=fixture({options:{clearResult:{exitStatus:1,stdout:'',stderr:'permission denied',error:null,signal:null}}});await assert.rejects(f.run(),/command failed/);assert.equal(f.dumps,0);noHealth(f);
});
for(const [name,step] of [
 ['missing root target package',{xml:'<hierarchy><node package="other.app"/></hierarchy>'}],
 ['empty hierarchy',{xml:'<hierarchy/>'}],['null focus',{focus:'mCurrentFocus=null\nmFocusedApp=null'}],
 ['missing focus',{focus:'WINDOW MANAGER WINDOWS (no focus available)'}],
 ['foreign focus',{focus:'mCurrentFocus=Window{99 u0 other.app/.Activity}\nmFocusedApp=ActivityRecord{99 u0 other.app/.Activity}'}],
 ['immersive confirmation',{focus:'mCurrentFocus=Window{99 u0 ImmersiveModeConfirmation}\nmFocusedApp=ActivityRecord{42 u0 '+APP+'/.MainActivity}'}],
 ['keyguard showing',{policy:GOOD_POLICY.replace('showing=false','showing=true')}],
 ['keyguard unknown',{policy:'No keyguard observation'}],
 ['keyguard input restricted',{policy:GOOD_POLICY.replace('inputRestricted=false','inputRestricted=true')}],
 ['PID disappeared',{pid:''}],['PID changed',{pid:'6184\n'}],['multiple PID',{pid:'6183 6184\n'}],
])test('fresh dump is insufficient without actual target health: '+name,async()=>{
 const f=fixture({steps:[{dump:idle},step]});await assert.rejects(f.run());assert.equal(attempts(f),1);noHealth(f);
});
test('runtime Launcher ANR is rejected without tap or recovery even after exact idle',async()=>{
 const xml='<hierarchy><node package="android" text="Pixel Launcher is not responding"/><node package="android" resource-id="android:id/aerr_close" text="Close app" bounds="[0,0][20,20]"/></hierarchy>';
 const f=fixture({steps:[{dump:idle},{xml}]});await assert.rejects(f.run(),/Runtime modal/);assert.equal(f.dumps,2);noHealth(f);
});
test('runtime product ANR is rejected without tap',async()=>{
 const f=fixture({steps:[{xml:'<hierarchy><node package="android" text="Langbai NovelAI Studio is not responding"/></hierarchy>'}]});await assert.rejects(f.run(),/Runtime modal/);noHealth(f);
});
for(const [name,overrides] of [
 ['missing BEGIN',{nativeStdout:'FEATURE_NATIVE_FOREGROUND:resumed; actual first/resumed frames rendered'}],
 ['duplicate BEGIN',{nativeStdout:actualLaunch.stdout+actualLaunch.stdout}],
 ['wrong source',{sourceSha:'a'.repeat(40)}],['wrong profile',{profileSha:'b'.repeat(64)}],
 ['wrong entry',{entry:'gallery3'}],['wrong count',{expectedChecks:14}],['wrong PID',{expectedNativePid:6184}],
 ['no rendered barrier',{nativeStdout:actualLaunch.stdout.replace('FEATURE_NATIVE_FOREGROUND:','OTHER:')}],
 ['native async failure',{nativeStdout:actualLaunch.stdout+'\nFEATURE_NATIVE_ASYNC_ERROR:failed'}],
])test('witness/initial mismatch is hard failure before observations: '+name,async()=>{
 const f=fixture({options:overrides});await assert.rejects(f.run());assert.equal(f.calls.length,0);noHealth(f);
});
test('original journey deadline caps every observation command and is never reset by retry',async()=>{
 const f=fixture({steps:[{dump:idle},{}],options:{journeyDeadline:1100},cost:500});await assert.rejects(f.run(),/deadline/);
 assert.ok(f.calls.every(c=>c.timeout<=1100-c.at));assert.ok(f.elapsed<=1100);noHealth(f);
});
test('hard30second budget caps a much larger original journey deadline',async()=>{
 const f=fixture({steps:[{dump:idle}],cost:a=>a.includes('uiautomator')?15000:0});await assert.rejects(f.run(),/deadline/);
 assert.equal(f.elapsed,30000);assert.equal(f.dumps,2);noHealth(f);
});
test('already expired deadline executes no command',async()=>{
 const f=fixture({options:{journeyDeadline:0}});await assert.rejects(f.run(),/expired/);assert.equal(f.calls.length,0);noHealth(f);
});
test('fresh healthy initial observation succeeds without retry, but not a product CHECK',async()=>{
 const f=fixture();const r=await f.run();assert.equal(r.attempt,1);assert.equal(attempts(f),0);assert.equal(f.dumps,1);
 assert.equal(f.phases.some(p=>p.stage==='ready'||p.stage==='CHECK'||p.stage==='DONE'),false);
});
test('initial preflight still hard-fails exact idle and does not inherit runtime policy',async()=>{
 const calls=[];await assert.rejects(prepareAndroidNative({adb:'stub',device:'emulator-5554',appId:APP,
  command:argv=>{const args=argv.slice(3).join(' ');calls.push(args);return args.includes('uiautomator')?idle:{exitStatus:0,stdout:args.includes('getprop')?'1':'',stderr:'',error:null,signal:null};},now:()=>0,sleep:async()=>{throw Error('must not retry idle in preflight');}}),/fresh hierarchy/);
 assert.equal(calls.filter(c=>c.includes('uiautomator')).length,1);
});

// Synthetic current-display continuations validate separation from the actual
// K artifact's historical LAST ANR focus; they are not native recovery evidence.
test('historical old ANR focus is not mistaken for a current foreign foreground',async()=>{
 const f=fixture({steps:[{focus:'WINDOW MANAGER LAST ANR\nmCurrentFocus=Window{1 u0 Application Not Responding: com.google.android.apps.nexuslauncher}\n'+GOOD_FOCUS,displayFocus:GOOD_FOCUS}]});
 const r=await f.run();assert.equal(r.attempt,1);assert.ok(r.focus.every(l=>l.includes(APP)));
});
test('old target focus cannot mask a currently foreign display',async()=>{
 const f=fixture({steps:[{focus:GOOD_FOCUS,displayFocus:'mCurrentFocus=Window{2 u0 other.app/.Other}\nmFocusedApp=ActivityRecord{2 u0 other.app/.Other}'}]});
 await assert.rejects(f.run(),/foreground/);noHealth(f);
});
test('unknown current-display fields cannot be replaced by old target focus',async()=>{
 const f=fixture({steps:[{focus:GOOD_FOCUS,displayFocus:'No current display focus available'}]});
 await assert.rejects(f.run(),/foreground/);noHealth(f);
});
test('current-display stderr is a hard failure, not a retry or old-focus fallback',async()=>{
 const f=fixture({steps:[{displayResult:{...GOOD_DUMP,stdout:GOOD_FOCUS,stderr:'Permission denied\n'}}]});
 await assert.rejects(f.run(),/current-display/);assert.equal(attempts(f),0);noHealth(f);
});
