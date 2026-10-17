import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const limit = 256 * 1024;
const sdkRoots = Object.freeze(['/usr/local/lib/android/sdk', '/opt/android-sdk', '/opt/android-sdk-linux', '/usr/lib/android-sdk']);
const qemuPaths = Object.freeze(['/usr/bin/qemu-system-aarch64', '/usr/local/bin/qemu-system-aarch64', '/usr/bin/qemu-system-x86_64']);

// System-fd queries only: never KVM_CREATE_VM, KVM_CREATE_VCPU or KVM_RUN.
// Constants: Linux include/uapi/linux/kvm.h; API documentation: docs.kernel.org/virt/kvm/api.html.
export const kvmReadOnlyPython = `import os,stat,json,errno
out={'device':'/dev/kvm','characterDevice':False,'readOnlyOpened':False,'apiVersion':None,'extensions':{},'queryError':None,'guestCreated':False}
fd=None
try:
 import fcntl
 info=os.lstat('/dev/kvm')
 out['characterDevice']=stat.S_ISCHR(info.st_mode)
 if not out['characterDevice']: raise OSError(errno.ENODEV,'Not a character device')
 fd=os.open('/dev/kvm',os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
 opened=os.fstat(fd)
 if (opened.st_dev,opened.st_ino)!=(info.st_dev,info.st_ino): raise OSError(errno.ESTALE,'Device identity changed')
 out['readOnlyOpened']=True
 out['apiVersion']=fcntl.ioctl(fd,0xAE00,0)
 for name,number in [('userMemory',3),('nrVcpus',9),('armVmIpaSize',165)]:
  out['extensions'][name]=fcntl.ioctl(fd,0xAE03,number)
except OSError as error:
 out['queryError']={'errno':error.errno,'code':errno.errorcode.get(error.errno,'UNKNOWN'),'message':str(error)}
except Exception as error:
 out['queryError']={'code':type(error).__name__,'message':str(error)}
finally:
 if fd is not None: os.close(fd)
print(json.dumps(out,sort_keys=True))
`;

function installedInventory() {
  const executable = p => {
    try {
      if (!fs.lstatSync(p).isFile() || fs.realpathSync(p) !== p) return false;
      fs.accessSync(p, fs.constants.X_OK); return true;
    } catch {return false;}
  };
  const sdk = sdkRoots.map(root => {
    try {
      const actual = fs.realpathSync(root);
      if (actual !== root || !fs.statSync(root).isDirectory()) return {root, present: false, aliasRejected: true};
      const emulator = path.posix.join(root, 'emulator/emulator');
      // Only existence of fixed installed paths is inspected; no directory walk,
      // sdkmanager, license acceptance, package installation or network access.
      return {root, present: true, emulator: executable(emulator) ? emulator : null,
        arm64Api34ImageDirectoryPresent: fs.existsSync(path.posix.join(root, 'system-images/android-34/google_apis/arm64-v8a'))};
    } catch {return {root, present: false};}
  });
  return {sdk, qemu: qemuPaths.filter(executable)};
}

async function committedSourceIdentity(root, run) {
  const head = await run('source-head', ['/usr/bin/git', 'rev-parse', 'HEAD'], true);
  const indexHead = await run('source-index-head', ['/usr/bin/git', 'diff', '--cached', '--exit-code'], true);
  const status = await run('source-clean', ['/usr/bin/git', 'status', '--porcelain', '--untracked-files=normal'], true);
  const index = await run('source-index', ['/usr/bin/git', 'ls-files', '--stage', '-z'], true);
  assert.equal(indexHead.stdout, ''); assert.equal(status.stdout, '', 'Capability source must be clean');
  const sourceSha = head.stdout.trim(); assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const entries = index.stdout.split('\0').filter(Boolean); assert(entries.length > 0);
  const manifest = [];
  for (const entry of entries) {
    const match = /^([0-7]{6}) ([a-f0-9]{40}) 0\t([\s\S]+)$/.exec(entry);
    assert(match, 'Unmerged or malformed source index');
    const [, mode, oid, relative] = match;
    assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'));
    const file = path.resolve(root, relative); assert(file.startsWith(root + path.sep));
    const data = mode === '120000' ? fs.readlinkSync(file, {encoding: 'buffer'}) :
      ['100644', '100755'].includes(mode) ? fs.readFileSync(file) : assert.fail('Unsupported source mode');
    const rawOid = crypto.createHash('sha1').update(Buffer.from(`blob ${data.length}\0`)).update(data).digest('hex');
    assert.equal(rawOid, oid, `Raw source differs from index: ${relative}`);
    manifest.push({path: relative, mode, gitOid: oid, sha256: hash(data), bytes: data.length});
  }
  return {head: sourceSha, manifestSha256: hash(JSON.stringify(manifest)), verifiedFiles: manifest.length,
    indexEqualsHead: true, rawEqualsIndex: true, clean: true};
}

function defaultContext() {
  return {platform: process.platform, arch: process.arch, githubActions: process.env.GITHUB_ACTIONS,
    sourceSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    runnerName: process.env.RUNNER_NAME, runnerArch: process.env.RUNNER_ARCH};
}

export async function collectAndroidArm64Capability({projectRoot = ownRoot, runnerTemp = process.env.RUNNER_TEMP,
  outputRoot, context = defaultContext(), command = runBoundedNativeCommand,
  sourceReader = committedSourceIdentity, installedProbe = installedInventory} = {}) {
  // This gate precedes every command, path inspection, and output creation.
  assert.equal(context.githubActions, 'true', 'Read-only probe is restricted to disposable GitHub Actions');
  assert.equal(context.platform, 'linux', 'Only the dedicated Linux runner may be probed');
  assert.match(context.sourceSha || '', /^[a-f0-9]{40}$/);
  assert.match(context.runId || '', /^\d+$/); assert.match(context.runAttempt || '', /^\d+$/);
  const project = fs.realpathSync(projectRoot), temp = fs.realpathSync(runnerTemp);
  const output = outputRoot ? path.resolve(outputRoot) : path.join(temp, `android-arm64-capability-${context.runId}-${context.runAttempt}`);
  assert.equal(path.dirname(output), temp, 'Evidence must be a direct fresh child of RUNNER_TEMP');
  assert.equal(path.basename(output), `android-arm64-capability-${context.runId}-${context.runAttempt}`);
  assert(output !== project && !output.startsWith(project + path.sep), 'Evidence cannot be inside source');
  fs.mkdirSync(output); // Existing outputs/aliases fail; never overwrite earlier evidence.
  const ledger = [], failures = [], started = Date.now(), deadline = started + 120000;
  const childEnv = {PATH: '/usr/bin:/bin', HOME: output, TMPDIR: output, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
    PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1'};
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
  const run = async (label, argv, required = false) => {
    const remaining = deadline - Date.now(); assert(remaining > 0, 'Shared diagnostic deadline exhausted');
    const result = await command(argv, {cwd: project, env: childEnv, timeout: Math.min(required ? 15000 : 5000, remaining),
      killGrace: 250, drainGrace: 500, maxBuffer: required ? 4 * 1024 * 1024 : limit});
    const entry = {label, ...result, command: argv, cwd: project}; ledger.push(entry); write('COMMANDS.json', ledger);
    if (result.timedOut || result.outputOverflow || result.cleanupComplete === false) failures.push(label);
    if (required) assert(result.exitStatus === 0 && !result.error && !result.timedOut && !result.outputOverflow && result.cleanupComplete !== false,
      `Required source command failed: ${label}`);
    return entry;
  };
  let report;
  try {
    const before = await sourceReader(project, run); assert.equal(before.head, context.sourceSha);
    const uname = await run('host-uname', ['/usr/bin/uname', '-srm']);
    const abi = await run('host-word-size', ['/usr/bin/getconf', 'LONG_BIT']);
    await run('host-virtualization', ['/usr/bin/lscpu', '--json']);
    const kvmCommand = await run('kvm-system-fd-query-only', ['/usr/bin/python3', '-I', '-c', kvmReadOnlyPython]);
    let kvm = null;
    if (kvmCommand.exitStatus === 0 && !kvmCommand.error) {
      try {kvm = JSON.parse(kvmCommand.stdout);} catch {failures.push('malformed-kvm-query');}
    }
    const inventory = installedProbe();
    assert(Array.isArray(inventory.sdk) && Array.isArray(inventory.qemu));
    for (const sdk of inventory.sdk) {
      assert(sdkRoots.includes(sdk.root));
      if (sdk.emulator) {
        assert.equal(sdk.emulator, path.posix.join(sdk.root, 'emulator/emulator'));
        await run('installed-emulator-version', [sdk.emulator, '-version']);
        await run('installed-emulator-accel-query-only', [sdk.emulator, '-accel-check']);
      }
    }
    for (const qemu of inventory.qemu) {
      assert(qemuPaths.includes(qemu));
      await run('installed-qemu-version', [qemu, '--version']);
      await run('installed-qemu-accelerator-list-only', [qemu, '-accel', 'help']);
    }
    const after = await sourceReader(project, run); assert.deepEqual(after, before, 'Source changed during diagnostic');
    const hostArm64 = context.arch === 'arm64' && uname.exitStatus === 0 && /\baarch64\b/.test(uname.stdout) && abi.exitStatus === 0 && abi.stdout.trim() === '64';
    const apiAvailable = hostArm64 && kvmCommand.exitStatus === 0 && !kvmCommand.error && kvm?.characterDevice === true &&
      kvm?.readOnlyOpened === true && kvm?.apiVersion === 12 && !kvm?.queryError && kvm?.guestCreated === false &&
      Number.isInteger(kvm.extensions?.userMemory) && kvm.extensions.userMemory > 0;
    report = {schema: 'android-arm64-host-capability/v1', diagnosticOnly: true, measurementMode:
      command === runBoundedNativeCommand && sourceReader === committedSourceIdentity && installedProbe === installedInventory ? 'actual-host-process' : 'injected-host-fixture',
      diagnosticComplete: failures.length === 0, source: before, runner: {name: context.runnerName ?? null, arch: context.runnerArch ?? null,
        runId: context.runId, runAttempt: context.runAttempt}, host: {platform: context.platform, nodeArch: context.arch,
        nodeVersion: process.version, probePid: process.pid}, capabilities: {hostArm64, arm64KvmApiAvailable: Boolean(apiAvailable),
        androidGuestReady: false, androidGuestBootVerified: false}, kvm, installed: inventory, boundedCommandFailures: failures,
      nativeAndroidExecuted: false, full195Certified: false, guestCreated: false, published: false,
      interpretation: 'Host inventory/system-fd API queries only. Missing capability is an observed negative, not a native pass. API12 is not guest boot or emulator compatibility.',
      next: apiAvailable ? 'Separately authorize a pinned real ARM64 Android guest boot; retain strict APK/ABI/PID/UID/source/nonce admission.' :
        'No usable ARM64 KVM API demonstrated. Consider a separately bounded genuine Cuttlefish/TCG guest feasibility experiment; do not substitute x86 Android or host mocks.',
      elapsedMs: Date.now() - started};
    write('CAPABILITY.json', report);
    return {exitStatus: failures.length ? 1 : 0, outputRoot: output, report};
  } catch (error) {
    write('PROBE_ERROR.json', {diagnosticComplete: false, error: error.stack || String(error), sourceSha: context.sourceSha,
      nativeAndroidExecuted: false, full195Certified: false, guestCreated: false});
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 0 || (args.length === 2 && args[0] === '--output'), 'Only --output is accepted');
    const result = await collectAndroidArm64Capability({outputRoot: args[1]});
    console.log(JSON.stringify({outputRoot: result.outputRoot, diagnosticComplete: result.report.diagnosticComplete,
      capabilities: result.report.capabilities, nativeAndroidExecuted: false, full195Certified: false}));
    process.exitCode = result.exitStatus;
  } catch (error) {console.error(error.stack || String(error)); process.exitCode = 1;}
}
