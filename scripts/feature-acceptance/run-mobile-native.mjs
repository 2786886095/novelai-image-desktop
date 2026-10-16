import {mobileNativeEntries,isMobileScenarioEntry} from './mobile-entry-specs.mjs';
import {driveAndroidFolderPicker,folderPacket} from './android-folder-picker-driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { collectResidentFlutter, createNativeProof } from './native-proof-stream.mjs';
import {fullFeatureProfiles,profileSha256} from './full-feature-profiles.mjs';
import {prepareAndroidNative,inspectAndroidForeground} from './android-native-preflight.mjs';
import {verifyMobilePredecessor,verifyColdNativeRestart} from './mobile-native-predecessor.mjs';

// A recording runner, not a publisher or a replacement for the release gate.
// Its one JSON input is also used for executable-harness B/M/R/P verification.
const inputPath = path.resolve(process.argv[2] || 'native-input.json');
const inputBytes = fs.readFileSync(inputPath);
const input = JSON.parse(inputBytes.toString('utf8'));
// Legacy release_parity7 emits CHECK/DONE directly. All NativeScenarios entries
// must additionally bind their real native process before the first CHECK.
const requireNativeBegin=isMobileScenarioEntry(input.entry)&&input.entry!=='release_parity7';
const ledger = [];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const outputRoot = path.resolve(process.env.FEATURE_ACCEPTANCE_OUTPUT || input.outputRoot);
fs.mkdirSync(outputRoot, { recursive: true });
function command(argv, cwd = input.projectRoot, timeout = 120000) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd, encoding: 'utf8', timeout, maxBuffer: 80 * 1024 * 1024,
    shell: process.platform === 'win32' && /\.(bat|cmd)$/i.test(argv[0]),
    env: { ...process.env, JAVA_HOME: input.javaHome || process.env.JAVA_HOME,
      ANDROID_HOME: input.androidSdk || process.env.ANDROID_HOME,
      ANDROID_SDK_ROOT: input.androidSdk || process.env.ANDROID_SDK_ROOT },
  });
  const record = { command: argv, cwd, stdout: result.stdout ?? '', stderr: result.stderr ?? '',
    exitStatus: result.status, signal: result.signal, error: result.error?.message ?? null };
  ledger.push(record);
  process.stdout.write(record.stdout);
  process.stderr.write(record.stderr);
  if (record.error) process.stderr.write(`${record.error}\n`);
  return record;
}
let exitStatus = 1;
let checks = [];
let failure;
let nativeCompletion=null, nativeRuntime=null, nativePending=[], nativeBegin=null;
let predecessorProof=null,coldRestart=null,coldStop=null,observedAndroidPid=null;
const preflight=[];
function androidPhase(event){const record={...event,device:input.device,at:new Date().toISOString()};preflight.push(record);fs.writeFileSync(path.join(outputRoot,'android-native-preflight.json'),JSON.stringify(preflight,null,2)+'\n');console.log('ANDROID_NATIVE_PREFLIGHT '+JSON.stringify(record));}
try {
  if (!input.isolated || !['android', 'ios'].includes(input.platform)) {
    throw new Error('Only an explicitly disposable Android emulator/iOS simulator is allowed.');
  }
  if(mobileNativeEntries[input.entry]?.platforms&&!mobileNativeEntries[input.entry].platforms.includes(input.platform))throw Error('Native entry is not supported by this platform; no acceptance exemption is granted.');
  if (input.platform === 'android') {
    if (!/^emulator-\d+$/.test(input.device)) throw new Error('Refusing a physical Android device.');
    const device = command([input.adb, '-s', input.device, 'shell', 'getprop', 'ro.kernel.qemu']);
    if (device.exitStatus !== 0 || device.stdout.trim() !== '1') throw new Error('Target is not a running Android emulator.');
    const boot = command([input.adb, '-s', input.device, 'shell', 'getprop', 'sys.boot_completed']);
    if (boot.exitStatus !== 0 || boot.stdout.trim() !== '1') throw new Error('Android emulator is not booted.');
  } else {
    if (process.platform !== 'darwin') throw new Error('iOS simulator acceptance requires a macOS host.');
    const devices = command(['xcrun', 'simctl', 'list', 'devices', '--json']);
    if (devices.exitStatus !== 0) throw new Error('Cannot inspect native simulators.');
    const all = Object.values(JSON.parse(devices.stdout).devices).flat();
    if (!all.some(d => d.udid === input.device && d.state === 'Booted' && d.isAvailable)) {
      throw new Error('Refusing a target outside the available booted Simulator inventory.');
    }
  }
  const sourceSha = input.sourceSha || 'uncommitted';
  createNativeProof({ sourceSha, platform: input.platform, expectedChecks: input.expectedChecks,
    testEntry: input.entry, profileSha: isMobileScenarioEntry(input.entry) ? profileSha256 : undefined, requireNativeBegin });
  // A local uncommitted source snapshot is never silently labelled as a Git SHA.
  if (sourceSha !== 'uncommitted' && !/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error('Invalid source SHA.');
  predecessorProof=verifyMobilePredecessor({...input,outputRoot},profileSha256);
  if (input.platform === 'android') {
    const existing = command([input.adb, '-s', input.device, 'shell', 'pm', 'list', 'packages', input.appId]);
    if (existing.exitStatus !== 0) throw new Error('Cannot inspect the isolated test package.');
    if(predecessorProof){
      const stopped=command([input.adb,'-s',input.device,'shell','am','force-stop',input.appId]);
      if(stopped.exitStatus!==0||stopped.error)throw Error('Cold predecessor native app could not be stopped.');
      const absent=command([input.adb,'-s',input.device,'shell','pidof',input.appId]);
      if(absent.error||![0,1].includes(absent.exitStatus)||absent.stdout.trim())throw Error('Cold predecessor native process is still running.');
      coldStop={platform:'android',previousNativePid:predecessorProof.nativePid,forceStopExit:stopped.exitStatus,pidofAfterStop:absent.stdout.trim(),pidofExit:absent.exitStatus,sandboxCleared:false};
    } else if (existing.stdout.split(/\r?\n/).includes(`package:${input.appId}`)) {
      // Clear only this test application on the explicitly disposable emulator.
      // This also prevents stale foreground-service callback handles across APKs.
      const cleared = command([input.adb, '-s', input.device, 'shell', 'pm', 'clear', input.appId]);
      if (cleared.exitStatus !== 0 || cleared.stdout.trim() !== 'Success') throw new Error('Isolated test sandbox could not be reset.');
    }
  }
  if(input.platform==='ios'&&predecessorProof){
    const stopped=command(['xcrun','simctl','terminate',input.device,input.appId]);
    if(stopped.error||(stopped.exitStatus!==0&&!/found nothing to terminate|not running|No such process/i.test(stopped.stderr+'\n'+stopped.stdout)))throw Error('Cold predecessor Simulator app could not be stopped.');
    coldStop={platform:'ios',previousNativePid:predecessorProof.nativePid,terminateExit:stopped.exitStatus,terminateStdout:stopped.stdout,terminateStderr:stopped.stderr,sandboxCleared:false};
  }
  if (input.prepareDependencies === true) {
    const prepared = command([input.flutter, 'pub', 'get'], input.projectRoot, input.dependencyTimeoutMs || 300000);
    if (prepared.exitStatus !== 0 || prepared.error) throw new Error('Native entry dependency preparation failed.');
  }
  const extraDartDefines=predecessorProof?['--dart-define=FEATURE_PREDECESSOR_VERIFIED=true']:[];
  if(isMobileScenarioEntry(input.entry)){
    if(input.expectedChecks!==mobileNativeEntries[input.entry].expectedChecks||input.profileSha256!==profileSha256)throw Error('Independent parity count/profile mismatch.');
    extraDartDefines.push(`--dart-define=FEATURE_PROFILE_SHA=${profileSha256}`, `--dart-define=FEATURE_TEST_ENTRY=${input.entry}`);
    const version=command([input.flutter,'--version','--machine'],input.projectRoot,120000);
    if(version.exitStatus!==0||version.error)throw Error('Cannot identify actual Flutter SDK.');
    const info=JSON.parse(version.stdout);
    if(typeof info.frameworkVersion!=='string'||!info.frameworkVersion)throw Error('Missing actual Flutter version.');
    nativeRuntime={type:'flutter',version:info.frameworkVersion,frameworkRevision:info.frameworkRevision??null};
  }
  let nativeStdout = '', nativeStderr = '';
  let nativeCommand;
  let completion;
  let resident;
  if (input.platform === 'android') {
    // Build the exact entry once. Installing it before launch permits real OS
    // permission/modal preparation before the first native clipboard/scenario.
    // The original Flutter launch then uses these bytes (no second compilation).
    await prepareAndroidNative({...input,command,phase:androidPhase});
    const dartDefines=['--dart-define=FEATURE_ISOLATED_DEVICE=true', `--dart-define=FEATURE_SOURCE_SHA=${sourceSha}`, ...extraDartDefines];
    const built=command([input.flutter,'build','apk','--debug','--no-pub','-t',input.testFile || 'integration_test/native_feature_journeys.dart',...dartDefines],input.projectRoot,input.timeoutMs || 1200000);
    if(built.exitStatus!==0||built.error)throw Error(`Native entry APK build failed (exit ${built.exitStatus}).`);
    const apk=path.join(input.projectRoot,'build/app/outputs/flutter-apk/app-debug.apk');
    if(!fs.existsSync(apk)||!fs.statSync(apk).isFile())throw Error('Built native entry APK is missing.');
    androidPhase({stage:'entry-apk-built',apk,sha256:hash(fs.readFileSync(apk)),bytes:fs.statSync(apk).size});
    const installed=command([input.adb,'-s',input.device,'install','-r','-t',apk],input.projectRoot,120000);
    if(installed.exitStatus!==0||installed.error||!/(?:^|\r?\n)Success(?:\r?\n|$)/.test(installed.stdout))throw Error('Isolated native entry APK install failed.');
    await prepareAndroidNative({...input,command,phase:androidPhase,grantNotifications:true});
    const result = command([input.flutter, 'run', '-t', input.testFile || 'integration_test/native_feature_journeys.dart',
      '-d', input.device, '--no-pub', '--no-resident', `--use-application-binary=${apk}`, ...dartDefines],
      input.projectRoot, input.timeoutMs || 1200000);
    if (result.exitStatus !== 0) throw new Error(`Native build/install/launch failed (exit ${result.exitStatus}).`);
    const pidResult = command([input.adb, '-s', input.device, 'shell', 'pidof', input.appId]);
    const pid = pidResult.stdout.trim();
    if (pidResult.exitStatus !== 0 || !/^\d+$/.test(pid)) throw new Error('Isolated native app did not stay running.');
    observedAndroidPid=Number(pid);
    nativeCommand = [input.adb, '-s', input.device, 'logcat', '-d', '-v', 'raw', `--pid=${pid}`];
    const end = Date.now() + (input.journeyTimeoutMs || 240000);
    let poll = 0, folderDriven = false;
    while (Date.now() < end) {
      const logs = spawnSync(nativeCommand[0], nativeCommand.slice(1), { encoding: 'utf8', timeout: 15000, maxBuffer: 20 * 1024 * 1024 });
      nativeStdout = logs.stdout ?? ''; nativeStderr = logs.stderr ?? '';
      if(input.entry==='android_folder1'&&!folderDriven){
        const request=folderPacket(nativeStdout);
        if(request){
          const begins=[...nativeStdout.matchAll(/FEATURE_ACCEPTANCE_BEGIN:(\{[^\r\n]*\})/g)];
          if(begins.length!==1)throw Error('Folder picker needs exactly one real native BEGIN');
          await driveAndroidFolderPicker({...input,sourceSha,profileSha:profileSha256,nativePid:observedAndroidPid,begin:JSON.parse(begins[0][1]),request,command,phase:androidPhase});
          folderDriven=true;
        }
      }
      const match = nativeStdout.match(/FEATURE_ACCEPTANCE_DONE:(\{[^\r\n]*\})/);
      if (match) { completion = JSON.parse(match[1]); break; }
      if (poll++ % 5 === 0) {
        await inspectAndroidForeground({...input,command,phase:androidPhase});
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    ledger.push({ command: nativeCommand, cwd: input.projectRoot, stdout: nativeStdout, stderr: nativeStderr,
      exitStatus: completion ? 0 : 1, exitStatusMeaning: 'log collection/completion observation, not an invented native process exit' });
    const screenshot = command([input.adb, '-s', input.device, 'shell', 'screencap', '-p', '/data/local/tmp/acceptance-native.png']);
    if (screenshot.exitStatus === 0) command([input.adb, '-s', input.device, 'pull', '/data/local/tmp/acceptance-native.png', path.join(outputRoot, 'native-screen.png')]);
  } else {
    nativeCommand = [input.flutter, 'run', '--machine', '-t', input.testFile || 'integration_test/native_feature_journeys.dart',
      '-d', input.device, '--no-pub', '--dart-define=FEATURE_ISOLATED_DEVICE=true', `--dart-define=FEATURE_SOURCE_SHA=${sourceSha}`, ...extraDartDefines];
    resident = await collectResidentFlutter({ command: nativeCommand, cwd: input.projectRoot, env: process.env,
      sourceSha, platform: input.platform, device: input.device, expectedChecks: input.expectedChecks,
      testEntry: input.entry, profileSha: isMobileScenarioEntry(input.entry) ? profileSha256 : undefined,
      requireNativeBegin,
      timeoutMs: input.timeoutMs || 1500000, journeyTimeoutMs: input.journeyTimeoutMs || 300000,
      completionTailMs: input.completionTailMs || 750, stopGraceMs: input.stopGraceMs || 15000 });
    nativeStdout = resident.nativeStdout; nativeStderr = resident.nativeStderr; completion = resident.completion;
    ledger.push(resident);
    if (resident.timedOut) {
      // Diagnostics are restricted to this disposable Simulator and output root.
      command(['xcrun', 'simctl', 'diagnose', '-u', '-b', '--output=' + path.join(outputRoot, 'simulator-diagnostics'), input.device], input.projectRoot, 120000);
    }
    if (!resident.passed) command(['xcrun', 'simctl', 'terminate', input.device, input.appId]);
    command(['xcrun', 'simctl', 'io', input.device, 'screenshot', path.join(outputRoot, 'native-screen.png')]);
  }
  fs.writeFileSync(path.join(outputRoot, 'native-app.stdout.txt'), nativeStdout);
  fs.writeFileSync(path.join(outputRoot, 'native-app.stderr.txt'), nativeStderr);
  process.stdout.write(nativeStdout); process.stderr.write(nativeStderr);
  const proof = createNativeProof({ sourceSha, platform: input.platform, expectedChecks: input.expectedChecks,
    testEntry: input.entry, profileSha: isMobileScenarioEntry(input.entry) ? profileSha256 : undefined, requireNativeBegin });
  for (const line of (nativeStdout + '\n' + nativeStderr).split(/\r?\n/)) proof.line(line);
  const parsed = proof.finish();
  nativeCompletion=parsed.completion; nativePending=parsed.pending; nativeBegin=parsed.begin;
  coldRestart=verifyColdNativeRestart(predecessorProof,nativeBegin,{platform:input.platform,observedAndroidPid});
  if(isMobileScenarioEntry(input.entry)){
    if(parsed.completion?.profileSha!==profileSha256)throw Error('Native DONE profile mismatch.');
    for(const check of parsed.checks){
      if(check.profileSha!==profileSha256)throw Error('Native CHECK profile mismatch.');
      if(check.acceptanceLevel==='scenario'&&!fullFeatureProfiles[check.feature]?.scenarios.includes(check.scenario))throw Error('Unknown native scenario.');
    }
  }
  checks = parsed.checks.map(check => ({ ...check, command: nativeCommand, stdout: nativeStdout, stderr: nativeStderr,
    exitStatus: input.platform === 'ios' ? resident.actualCloseCode : completion?.exitStatus ?? 1, skipped: false,
    acceptanceLevel: isMobileScenarioEntry(input.entry)&&check.acceptanceLevel==='scenario'?'scenario':'component-only', sourceSnapshotSha256: input.sourceSnapshotSha256 || null }));
  if (!parsed.passed || (resident && !resident.passed)) throw new Error('Native journey failed: ' + [...parsed.errors, ...(resident?.errors || [])].join('; '));
  if (input.platform === 'android') command([input.adb, '-s', input.device, 'shell', 'am', 'force-stop', input.appId]);
  exitStatus = 0;
} catch (error) {
  failure = error.stack || String(error);
  process.stderr.write(`${failure}\n`);
} finally {
  const receipt = { schemaVersion: 1, inputPath, inputSha256: hash(inputBytes),
    sourceSha: input.sourceSha || 'uncommitted', sourceRoot: input.sourceRoot,
    sourceSnapshotSha256: input.sourceSnapshotSha256 || null,
    platform: input.platform, device: input.device, appId: input.appId, isolated: input.isolated,
    completeFeatureRowsCertified: 0, full195Certified: false,
    entry:input.entry??null, nativeRuntime,nativeCompletion,nativePending,nativeBegin,preflight,predecessorProof,coldStop,coldRestart,
    expectedChecks: input.expectedChecks ?? null, checks, ledger, exitStatus, failure: failure || null,
    boundary: 'Real target native component journeys. No paid/public generation call, human profile, publishing, or whole-feature certification.' };
  const target = path.join(outputRoot, 'native-mobile-receipt.json');
  fs.writeFileSync(target, JSON.stringify(receipt, null, 2) + '\n');
  const reopened = fs.readFileSync(target);
  process.stdout.write(`RECEIPT ${target} SHA256=${hash(reopened)} BYTES=${reopened.length}\n`);
  process.stdout.write(`NATIVE_COMPONENT_CHECKS=${checks.length} COMPLETE_FEATURE_ROWS=0 FULL_195=false EXIT=${exitStatus}\n`);
  process.exitCode = exitStatus;
}
