import crypto from 'node:crypto';
import {inspectAndroidForeground,observedAndroidModal,validateAndroidPreflightTarget} from './android-native-preflight.mjs';
import {createNativeProof} from './native-proof-stream.mjs';

// Runtime observation retries never rerun
// a product action, assertion, Flutter launch, CHECK, or DONE.
const XML='/data/local/tmp/acceptance-window.xml';
const IDLE_STDERR='ERROR: could not get idle state.\n';
const MAX_ATTEMPTS=3, MAX_BUDGET_MS=30000;
function witness({nativeStdout,sourceSha,profileSha,entry,expectedChecks,expectedNativePid}) {
  if(typeof nativeStdout!=='string'||!/^[a-f0-9]{40}$/.test(sourceSha||'')||!/^[a-f0-9]{64}$/.test(profileSha||'')||
    !Number.isSafeInteger(expectedNativePid)||expectedNativePid<1)throw Error('Runtime health requires explicit same-source native identity.');
  const lines=nativeStdout.split(/\r?\n/),begins=lines.filter(l=>l.includes('FEATURE_ACCEPTANCE_BEGIN:'));
  if(begins.length!==1)throw Error('Runtime health requires one current native BEGIN.');
  const proof=createNativeProof({sourceSha,profileSha,platform:'android',testEntry:entry,expectedChecks,requireNativeBegin:true});
  proof.line(begins[0]);
  const begin=proof.finish().begin; // identity only: no journey completion is asserted
  if(proof.errorsCount||!begin||begin.nativePid!==expectedNativePid)throw Error('Runtime BEGIN/PID identity mismatch.');
  const beginAt=lines.indexOf(begins[0]),foregroundAt=lines.findIndex(l=>l.includes('FEATURE_NATIVE_FOREGROUND:resumed; actual first/resumed frames rendered'));
  if(foregroundAt<=beginAt)throw Error('Runtime health requires actual resumed/rendered native barrier.');
  if(/Unhandled Exception:|FEATURE_NATIVE_ASYNC_ERROR:|FEATURE_ACCEPTANCE_FAILURE:/.test(nativeStdout))throw Error('Runtime native log already contains a journey/framework failure.');
  return begin;
}
function healthyProcessResult(r) {
  return r&&r.exitStatus===0&&!r.error&&!r.signal&&!r.timedOut&&!r.outputOverflow&&
    typeof r.stdout==='string'&&typeof r.stderr==='string';
}
export async function observeAndroidRuntimeHealth({adb,device,appId,command,phase=()=>{},journeyDeadline,
  nativeStdout,sourceSha,profileSha,entry,expectedChecks,expectedNativePid,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}) {
  validateAndroidPreflightTarget({device,appId});
  witness({nativeStdout,sourceSha,profileSha,entry,expectedChecks,expectedNativePid});
  if(typeof command!=='function'||!Number.isFinite(journeyDeadline)||journeyDeadline<=now())throw Error('Runtime health original journey deadline is expired/invalid.');
  const deadline=Math.min(journeyDeadline,now()+MAX_BUDGET_MS);
  const expired=()=>Error('Runtime health fresh-observation deadline exceeded.');
  let hierarchy='';
  const boundedCommand=(argv,cwd,requested=20000)=>{
    const remaining=deadline-now();if(remaining<=0)throw expired();
    const r=command(argv,cwd,Math.min(20000,requested,remaining));
    if(now()>=deadline)throw expired();
    // Timeout/overflow/signal/error/nonzero is never a retry candidate.
    if(!healthyProcessResult(r))throw Error('Runtime health observation command failed.');
    const tail=argv.slice(3);
    if(tail.join(' ')==='shell uiautomator dump '+XML && r.stdout==='' && r.stderr===IDLE_STDERR) {
      const e=Error('Runtime hierarchy temporarily unavailable: exact idle-state observation.');
      e.code='ANDROID_RUNTIME_IDLE_UNAVAILABLE';throw e;
    }
    if(tail.join(' ')==='shell cat '+XML) {
      if(r.stderr)throw Error('Runtime hierarchy read returned stderr.');
      hierarchy=r.stdout;
      // Never auto-dismiss a runtime modal. The old inspector may handle known
      // dialogs in preflight, but this adapter rejects them before its tap site.
      if(observedAndroidModal(hierarchy))throw Error('Runtime modal/ANR is visible; not healthy.');
      const escaped=appId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(!new RegExp('<node\\b[^>]*\\bpackage="'+escaped+'"').test(hierarchy))throw Error('Fresh runtime hierarchy does not expose the target app.');
    }
    return r;
  };
  const adbRead=args=>boundedCommand([adb,'-s',device,...args],undefined,20000);
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++) {
    hierarchy='';
    let observation;
    try {
      observation=await inspectAndroidForeground({adb,device,appId,command:boundedCommand,phase});
    } catch(e) {
      if(e.code!=='ANDROID_RUNTIME_IDLE_UNAVAILABLE')throw e;
      phase({stage:'runtime-health-unavailable',reason:'exact-idle-state',attempt,maxAttempts:MAX_ATTEMPTS});
      if(attempt===MAX_ATTEMPTS)throw Error('Runtime health exact-idle observation retry budget exhausted.');
      const remaining=deadline-now();if(remaining<=0)throw expired();
      await sleep(Math.min(250,remaining));continue;
    }
    if(observation.modal)throw Error('Runtime modal cannot establish health.');
    const escaped=appId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // The complete window dump includes historical LAST ANR snapshots. Query
    // only current DisplayContent summaries instead of treating old focus as now.
    const display=adbRead(['shell','dumpsys','window','displays']);
    if(display.stderr||/WINDOW MANAGER LAST ANR/.test(display.stdout))throw Error('Runtime current-display observation is invalid.');
    const focus=display.stdout.split(/\r?\n/).filter(l=>/mCurrentFocus=|mFocusedApp=/.test(l));
    const current=focus.filter(l=>/mCurrentFocus=/.test(l));
    const focused=focus.filter(l=>/mFocusedApp=/.test(l));
    const target=new RegExp('\\b'+escaped+'\\/');
    if(current.length===0||focused.length===0||[...current,...focused].some(l=>!target.test(l)||/mCurrentFocus=null|ImmersiveModeConfirmation|Application Not Responding/.test(l)))throw Error('Runtime target foreground focus is not positively confirmed.');
    const policy=adbRead(['shell','dumpsys','window','policy']);
    if(policy.stderr)throw Error('Runtime keyguard policy returned stderr.');
    const delegate=/KeyguardServiceDelegate\s*\n([\s\S]*?)(?=\n\s*Looper state:|$)/.exec(policy.stdout)?.[1];
    const flags=[...(delegate||'').matchAll(/(?:^|\n)\s*(showing|mIsShowing|inputRestricted|mInputRestricted)=([^\s]+)/g)];
    if(!flags.some(f=>['showing','mIsShowing'].includes(f[1]))||flags.some(f=>f[2]!=='false'))throw Error('Runtime unlocked keyguard state is not positively confirmed.');
    const pid=adbRead(['shell','pidof',appId]);
    if(pid.stderr||pid.stdout.trim()!==String(expectedNativePid))throw Error('Runtime native PID changed or disappeared.');
    if(now()>=deadline)throw expired();
    const value={attempt,observedNativePid:expectedNativePid,freshHierarchySha256:crypto.createHash('sha256').update(hierarchy).digest('hex'),focus,keyguardShowing:false};
    phase({stage:'runtime-health-observed',...value});
    return value;
  }
  throw Error('Runtime health observation did not succeed.');
}
