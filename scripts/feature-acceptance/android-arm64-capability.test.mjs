import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectAndroidArm64Capability, kvmReadOnlyPython} from './android-arm64-capability.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const identity = {head: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), verifiedFiles: 3,
  indexEqualsHead: true, rawEqualsIndex: true, clean: true};
const kvmAbsent = {device: '/dev/kvm', characterDevice: false, readOnlyOpened: false,
  apiVersion: null, extensions: {}, queryError: {code: 'ENOENT'}, guestCreated: false};
const kvmAvailable = {device: '/dev/kvm', characterDevice: true, readOnlyOpened: true,
  apiVersion: 12, extensions: {userMemory: 1, nrVcpus: 4, armVmIpaSize: 40}, queryError: null, guestCreated: false};

async function fixture(overrides = {}, inspect = () => {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arm64-capability-test-'));
  const calls = [];
  const context = {platform: 'linux', arch: 'arm64', githubActions: 'true', sourceSha: identity.head,
    runId: '123', runAttempt: '1', runnerName: 'synthetic-host', runnerArch: 'ARM64'};
  const command = async (argv, options) => {
    calls.push({argv, options});
    const stdout = argv[0] === '/usr/bin/uname' ? 'Linux fixture aarch64\n' :
      argv[0] === '/usr/bin/getconf' ? '64\n' : argv[0] === '/usr/bin/python3' ? JSON.stringify(kvmAbsent) : '{}\n';
    return {command: argv, cwd: options.cwd, stdout, stderr: '', exitStatus: 0, error: null,
      timedOut: false, outputOverflow: false, cleanupComplete: true, pid: 42, timeoutMs: options.timeout};
  };
  try {
    const options = {projectRoot: root, runnerTemp: temp, context, sourceReader: async () => identity,
      installedProbe: () => ({sdk: [], qemu: []}), command, ...overrides};
    const result = await collectAndroidArm64Capability(options);
    await inspect({result, calls, temp, options});
    return result;
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
}

test('absent KVM is an explicit negative diagnostic, never Android execution or full acceptance', async () => {
  await fixture({}, ({result, calls}) => {
    assert.equal(result.exitStatus, 0); assert.equal(result.report.diagnosticComplete, true);
    assert.equal(result.report.capabilities.hostArm64, true);
    assert.equal(result.report.capabilities.arm64KvmApiAvailable, false);
    assert.equal(result.report.capabilities.androidGuestReady, false);
    assert.equal(result.report.capabilities.androidGuestBootVerified, false);
    assert.equal(result.report.nativeAndroidExecuted, false); assert.equal(result.report.full195Certified, false);
    assert.equal(result.report.measurementMode, 'injected-host-fixture'); assert.equal(calls.length, 4);
    const recorded = JSON.parse(fs.readFileSync(path.join(result.outputRoot, 'CAPABILITY.json')));
    assert.deepEqual(recorded, result.report);
  });
});

test('API12 on an ARM64 host is system-fd capability only, not a booted or qualified Android guest', async () => {
  await fixture({command: async (argv, options) => ({command: argv, cwd: options.cwd,
    stdout: argv[0].endsWith('uname') ? 'Linux fixture aarch64\n' : argv[0].endsWith('getconf') ? '64\n' :
      argv[0].endsWith('python3') ? JSON.stringify(kvmAvailable) : '{}\n', stderr: 'literal diagnostic stderr\n',
    exitStatus: 0, error: null, timedOut: false, outputOverflow: false, cleanupComplete: true, pid: 91})}, ({result}) => {
    assert.equal(result.report.capabilities.arm64KvmApiAvailable, true);
    assert.equal(result.report.nativeAndroidExecuted, false); assert.equal(result.report.full195Certified, false);
    assert.equal(result.report.guestCreated, false); assert.equal(result.report.capabilities.androidGuestReady, false);
    const ledger = JSON.parse(fs.readFileSync(path.join(result.outputRoot, 'COMMANDS.json')));
    assert.equal(ledger[3].stderr, 'literal diagnostic stderr\n'); assert.equal(ledger[3].pid, 91);
    assert.deepEqual(ledger[3].command, ['/usr/bin/python3', '-I', '-c', kvmReadOnlyPython]);
    assert.equal(ledger[3].exitStatus, 0);
  });
});

test('disposable Actions and Linux guards precede every path inspection or command', async () => {
  for (const context of [{githubActions: 'false', platform: 'linux'}, {githubActions: 'true', platform: 'win32'}]) {
    let called = false;
    await assert.rejects(collectAndroidArm64Capability({projectRoot: 'not-a-path', runnerTemp: 'not-a-path', context,
      command: async () => {called = true;}, sourceReader: async () => {called = true;}}));
    assert.equal(called, false);
  }
});

test('x64 KVM and wrong API version cannot become ARM64 capability', async () => {
  for (const [arch, api] of [['x64', 12], ['arm64', 11]]) {
    const result = await fixture({context: {platform: 'linux', arch, githubActions: 'true', sourceSha: identity.head,
      runId: '123', runAttempt: '1'}, command: async argv => ({stdout: argv[0].endsWith('uname') ? 'Linux fixture aarch64\n' :
        argv[0].endsWith('getconf') ? '64\n' : argv[0].endsWith('python3') ? JSON.stringify({...kvmAvailable, apiVersion: api}) : '{}',
      stderr: '', exitStatus: 0, error: null, cleanupComplete: true})});
    assert.equal(result.report.capabilities.arm64KvmApiAvailable, false);
  }
});

test('missing Python or denied read-only KVM remains negative with literal nonzero/error evidence', async () => {
  const result = await fixture({command: async argv => ({stdout: argv[0].endsWith('uname') ? 'Linux fixture aarch64\n' :
    argv[0].endsWith('getconf') ? '64\n' : '', stderr: 'python unavailable\n', exitStatus: argv[0].endsWith('python3') ? 127 : 0,
    error: null, cleanupComplete: true})});
  assert.equal(result.exitStatus, 0); assert.equal(result.report.capabilities.arm64KvmApiAvailable, false);
  assert.equal(result.report.kvm, null);
});

test('malformed KVM output cannot be accepted as a complete diagnostic', async () => {
  const result = await fixture({command: async () => ({stdout: 'not-json', stderr: '', exitStatus: 0, error: null, cleanupComplete: true})});
  assert.equal(result.exitStatus, 1); assert.equal(result.report.diagnosticComplete, false);
  assert.equal(result.report.capabilities.arm64KvmApiAvailable, false);
  assert.deepEqual(result.report.boundedCommandFailures, ['malformed-kvm-query']);
});

test('timeout, output overflow and unconfirmed process cleanup remain diagnostic failures', async () => {
  for (const fault of [{timedOut: true, exitStatus: 124}, {outputOverflow: true, exitStatus: 125}, {cleanupComplete: false, exitStatus: 0}]) {
    const result = await fixture({command: async () => ({stdout: '{}', stderr: 'original-error', error: null,
      exitStatus: 0, cleanupComplete: true, ...fault})});
    assert.equal(result.exitStatus, 1); assert.equal(result.report.diagnosticComplete, false);
    assert.equal(result.report.nativeAndroidExecuted, false); assert(result.report.boundedCommandFailures.length > 0);
  }
});

test('source drift fails closed and writes an error rather than capability success', async () => {
  let calls = 0;
  await assert.rejects(fixture({sourceReader: async () => (++calls === 1 ? identity : {...identity, manifestSha256: 'c'.repeat(64)})}),
    /Source changed during diagnostic/);
  assert.equal(calls, 2);
});

test('unapproved executable path from an inventory cannot reach the command transport', async () => {
  let unsafeCalled = false;
  await assert.rejects(fixture({installedProbe: () => ({sdk: [], qemu: ['/tmp/untrusted-qemu']}), command: async argv => {
    if (argv[0] === '/tmp/untrusted-qemu') unsafeCalled = true;
    return {stdout: '{}', stderr: '', exitStatus: 0, error: null, cleanupComplete: true};
  }}));
  assert.equal(unsafeCalled, false);
});

test('installed emulator and QEMU invoke only fixed non-VM version/capability arguments', async () => {
  await fixture({installedProbe: () => ({sdk: [{root: '/opt/android-sdk', emulator: '/opt/android-sdk/emulator/emulator',
    present: true}], qemu: ['/usr/bin/qemu-system-aarch64']})}, ({calls, result}) => {
    assert.deepEqual(calls.slice(4).map(x => x.argv), [
      ['/opt/android-sdk/emulator/emulator', '-version'], ['/opt/android-sdk/emulator/emulator', '-accel-check'],
      ['/usr/bin/qemu-system-aarch64', '--version'], ['/usr/bin/qemu-system-aarch64', '-accel', 'help']]);
    assert.equal(result.report.guestCreated, false);
    for (const {options} of calls) {
      assert(options.timeout > 0 && options.timeout <= 5000); assert.equal(options.maxBuffer, 256 * 1024);
      assert.deepEqual(Object.keys(options.env).sort(), ['HOME', 'LANG', 'LC_ALL', 'PATH', 'PYTHONDONTWRITEBYTECODE', 'PYTHONNOUSERSITE', 'TMPDIR'].sort());
      assert.equal(options.env.PATH, '/usr/bin:/bin'); assert.equal(options.env.HOME, result.outputRoot);
    }
  });
});

test('fresh RUNNER_TEMP output cannot overwrite existing evidence, traverse elsewhere or use a symlink', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arm64-capability-path-'));
  const context = {platform: 'linux', arch: 'arm64', githubActions: 'true', sourceSha: identity.head, runId: '123', runAttempt: '1'};
  try {
    const options = {projectRoot: root, runnerTemp: temp, context};
    await assert.rejects(collectAndroidArm64Capability({...options, outputRoot: path.join(temp, '../elsewhere')}));
    const expected = path.join(temp, 'android-arm64-capability-123-1'); fs.mkdirSync(expected);
    fs.writeFileSync(path.join(expected, 'KEEP'), 'prior');
    await assert.rejects(collectAndroidArm64Capability(options), /EEXIST/);
    assert.equal(fs.readFileSync(path.join(expected, 'KEEP'), 'utf8'), 'prior');
    fs.rmSync(expected, {recursive: true});
    const other = path.join(temp, 'other'); fs.mkdirSync(other);
    fs.symlinkSync(other, expected, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(collectAndroidArm64Capability(options), /EEXIST/);
    assert.deepEqual(fs.readdirSync(other), []);
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
});

test('embedded Python uses only read-only system KVM queries and always closes the descriptor', () => {
  assert.match(kvmReadOnlyPython, /os\.O_RDONLY\|os\.O_CLOEXEC\|os\.O_NOFOLLOW/);
  assert.match(kvmReadOnlyPython, /fcntl\.ioctl\(fd,0xAE00,0\)/);
  assert.match(kvmReadOnlyPython, /fcntl\.ioctl\(fd,0xAE03,number\)/);
  assert.match(kvmReadOnlyPython, /if fd is not None: os\.close\(fd\)/);
  assert.doesNotMatch(kvmReadOnlyPython, /0xAE01|0xAE41|0xAE80|O_RDWR|O_WRONLY|O_CREAT/);
});

test('manual-only dedicated workflow pins existing action versions and never installs or starts a guest', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-arm64-capability.yml'), 'utf8');
  assert.match(workflow, /on:\n  workflow_dispatch:\n\npermissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:|setup-node|npm (ci|install)|apt|sdkmanager|sudo|git config/);
  assert.match(workflow, /runs-on: ubuntu-24\.04-arm/); assert.match(workflow, /timeout-minutes: 6/);
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/); assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /if: always\(\)/); assert.match(workflow, /if-no-files-found: error/);
  assert.equal((workflow.match(/\brun:/g) || []).length, 1);
  assert.match(workflow, /run: node scripts\/feature-acceptance\/android-arm64-capability\.mjs --output/);
});
