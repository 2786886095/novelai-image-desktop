import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';

// A recording runner, not a publisher or a replacement for the release gate.
// Its one JSON input is also used for executable-harness B/M/R/P verification.
const inputPath = path.resolve(process.argv[2] || 'native-input.json');
const inputBytes = fs.readFileSync(inputPath);
const input = JSON.parse(inputBytes.toString('utf8'));
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
try {
  if (!input.isolated || !['android', 'ios'].includes(input.platform)) {
    throw new Error('Only an explicitly disposable Android emulator/iOS simulator is allowed.');
  }
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
  // A local uncommitted source snapshot is never silently labelled as a Git SHA.
  if (sourceSha !== 'uncommitted' && !/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error('Invalid source SHA.');
  if (input.platform === 'android') {
    const existing = command([input.adb, '-s', input.device, 'shell', 'pm', 'list', 'packages', input.appId]);
    if (existing.exitStatus !== 0) throw new Error('Cannot inspect the isolated test package.');
    if (existing.stdout.split(/\r?\n/).includes(`package:${input.appId}`)) {
      // Clear only this test application on the explicitly disposable emulator.
      // This also prevents stale foreground-service callback handles across APKs.
      const cleared = command([input.adb, '-s', input.device, 'shell', 'pm', 'clear', input.appId]);
      if (cleared.exitStatus !== 0 || cleared.stdout.trim() !== 'Success') throw new Error('Isolated test sandbox could not be reset.');
    }
  }
  const result = command([input.flutter, 'run', '-t', input.testFile || 'integration_test/native_feature_journeys.dart',
    '-d', input.device, '--no-pub', '--no-resident',
    '--dart-define=FEATURE_ISOLATED_DEVICE=true', `--dart-define=FEATURE_SOURCE_SHA=${sourceSha}`],
    input.projectRoot, input.timeoutMs || 1200000);
  if (result.exitStatus !== 0) throw new Error(`Native build/install/launch failed (exit ${result.exitStatus}).`);
  let nativeStdout = '', nativeStderr = '';
  let nativeCommand;
  let completion;
  if (input.platform === 'android') {
    const pidResult = command([input.adb, '-s', input.device, 'shell', 'pidof', input.appId]);
    const pid = pidResult.stdout.trim();
    if (pidResult.exitStatus !== 0 || !/^\d+$/.test(pid)) throw new Error('Isolated native app did not stay running.');
    nativeCommand = [input.adb, '-s', input.device, 'logcat', '-d', '-v', 'raw', `--pid=${pid}`];
    const end = Date.now() + (input.journeyTimeoutMs || 240000);
    let poll = 0;
    while (Date.now() < end) {
      const logs = spawnSync(nativeCommand[0], nativeCommand.slice(1), { encoding: 'utf8', timeout: 15000, maxBuffer: 20 * 1024 * 1024 });
      nativeStdout = logs.stdout ?? ''; nativeStderr = logs.stderr ?? '';
      const match = nativeStdout.match(/FEATURE_ACCEPTANCE_DONE:(\{[^\r\n]*\})/);
      if (match) { completion = JSON.parse(match[1]); break; }
      if (poll++ % 5 === 0) {
        command([input.adb, '-s', input.device, 'shell', 'uiautomator', 'dump', '/data/local/tmp/acceptance-window.xml']);
        const state = command([input.adb, '-s', input.device, 'shell', 'cat', '/data/local/tmp/acceptance-window.xml']);
        // A real first-run OS notification prompt must not hang the safe
        // loopback queue. Act only on its observed, exact Allow button.
        if (state.exitStatus === 0 && state.stdout.includes('Allow Langbai NovelAI Studio to send you notifications?')) {
          const button = state.stdout.match(/resource-id="com\.android\.permissioncontroller:id\/permission_allow_button"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
          if (button) command([input.adb, '-s', input.device, 'shell', 'input', 'tap',
            String(Math.floor((+button[1] + +button[3]) / 2)), String(Math.floor((+button[2] + +button[4]) / 2))]);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    ledger.push({ command: nativeCommand, cwd: input.projectRoot, stdout: nativeStdout, stderr: nativeStderr,
      exitStatus: completion ? 0 : 1, exitStatusMeaning: 'log collection/completion observation, not an invented native process exit' });
    const screenshot = command([input.adb, '-s', input.device, 'shell', 'screencap', '-p', '/data/local/tmp/acceptance-native.png']);
    if (screenshot.exitStatus === 0) command([input.adb, '-s', input.device, 'pull', '/data/local/tmp/acceptance-native.png', path.join(outputRoot, 'native-screen.png')]);
  } else {
    nativeCommand = ['xcrun', 'simctl', 'launch', '--terminate-running-process', '--console-pty', input.device, input.appId];
    await new Promise(resolve => {
      const child = spawn(nativeCommand[0], nativeCommand.slice(1), { cwd: input.projectRoot, env: process.env });
      // Readable's UTF-8 decoder preserves split multibyte characters. Raw
      // Buffer += string would corrupt literal Chinese stdout/stderr chunks.
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      let stopping = false;
      const timer = setTimeout(() => { stopping = true; child.kill(); }, input.journeyTimeoutMs || 240000);
      const observeCompletion = () => {
        const match = (nativeStdout + '\n' + nativeStderr).match(/FEATURE_ACCEPTANCE_DONE:(\{[^\r\n]*\})/);
        if (match && !stopping) {
          completion = JSON.parse(match[1]); stopping = true; clearTimeout(timer);
          command(['xcrun', 'simctl', 'terminate', input.device, input.appId]); child.kill();
        }
      };
      child.stdout.on('data', data => { nativeStdout += data; observeCompletion(); });
      child.stderr.on('data', data => { nativeStderr += data; observeCompletion(); });
      child.on('error', error => { nativeStderr += error.stack; clearTimeout(timer); });
      // 'close' follows stdout/stderr drain; 'exit' can precede trailing bytes.
      child.on('close', () => { clearTimeout(timer); resolve(); });
    });
    ledger.push({ command: nativeCommand, cwd: input.projectRoot, stdout: nativeStdout, stderr: nativeStderr, exitStatus: completion ? 0 : 1,
      exitStatusMeaning: 'console collection/completion observation; app terminated after receipt' });
    command(['xcrun', 'simctl', 'io', input.device, 'screenshot', path.join(outputRoot, 'native-screen.png')]);
  }
  fs.writeFileSync(path.join(outputRoot, 'native-app.stdout.txt'), nativeStdout);
  fs.writeFileSync(path.join(outputRoot, 'native-app.stderr.txt'), nativeStderr);
  process.stdout.write(nativeStdout); process.stderr.write(nativeStderr);
  const regex = /FEATURE_ACCEPTANCE_CHECK:(\{[^\r\n]*\})/g;
  for (const match of (nativeStdout + '\n' + nativeStderr).matchAll(regex)) {
    const check = JSON.parse(match[1]);
    if (check.platform !== input.platform || check.sourceSha !== sourceSha || check.mockOnly !== false || check.paidCalls !== 0) {
      throw new Error('Native check identity or safety contract mismatch.');
    }
    checks.push({ ...check, command: nativeCommand, stdout: nativeStdout, stderr: nativeStderr,
      exitStatus: completion?.exitStatus ?? 1, skipped: false,
      acceptanceLevel: 'component-only', sourceSnapshotSha256: input.sourceSnapshotSha256 || null });
  }
  if (completion?.exitStatus !== 0 || checks.length === 0 || completion.checks !== checks.length || /Unhandled Exception:|FEATURE_NATIVE_ASYNC_ERROR:/.test(nativeStdout + '\n' + nativeStderr)) throw new Error(`Native journey failed (logical exit ${completion?.exitStatus}, emitted checks ${checks.length}; native asynchronous errors are not ignored).`);
  if (input.platform === 'android') command([input.adb, '-s', input.device, 'shell', 'am', 'force-stop', input.appId]);
  exitStatus = 0;
} catch (error) {
  failure = error.stack || String(error);
  process.stderr.write(`${failure}\n`);
} finally {
  const receipt = { schemaVersion: 1, inputPath, inputSha256: hash(inputBytes),
    sourceSha: input.sourceSha || 'uncommitted', sourceRoot: input.sourceRoot,
    sourceSnapshotSha256: input.sourceSnapshotSha256 || null,
    platform: input.platform, device: input.device, isolated: input.isolated,
    completeFeatureRowsCertified: 0, full195Certified: false,
    checks, ledger, exitStatus, failure: failure || null,
    boundary: 'Real target native component journeys. No paid/public generation call, human profile, publishing, or whole-feature certification.' };
  const target = path.join(outputRoot, 'native-mobile-receipt.json');
  fs.writeFileSync(target, JSON.stringify(receipt, null, 2) + '\n');
  const reopened = fs.readFileSync(target);
  process.stdout.write(`RECEIPT ${target} SHA256=${hash(reopened)} BYTES=${reopened.length}\n`);
  process.stdout.write(`NATIVE_COMPONENT_CHECKS=${checks.length} COMPLETE_FEATURE_ROWS=0 FULL_195=false EXIT=${exitStatus}\n`);
  process.exitCode = exitStatus;
}
