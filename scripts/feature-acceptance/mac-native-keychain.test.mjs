// Controller authoring tests use a recording fake security CLI. They never
// certify native macOS accounts, safeStorage or a feature-matrix cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareMacNativeKeychain} from './mac-native-keychain.mjs';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';

const ciMissingDefault = {status: 1, stdout: '', stderr: 'security: SecKeychainCopyDomainDefault user: A default keychain could not be found.\n'};

function fixture(t, {missingDefault = false, missingResponse = ciMissingDefault} = {}) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mac-keychain-controller-test-')));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const run = path.join(temp, 'run'); fs.mkdirSync(run);
  const original = path.join(temp, 'existing.keychain-db'); fs.writeFileSync(original, 'ORIGINAL PRISTINE BYTES');
  const state = {currentDefault: missingDefault ? [] : [original], currentSearch: [original], calls: [], secrets: [], fail: null};
  const quote = value => value.map(item => '    "' + item + '"').join('\n') + (value.length ? '\n' : '');
  const execute = (binary, args, options) => {
    state.calls.push({binary, args: [...args], options});
    const p = args.indexOf('-p'); if (p >= 0) state.secrets.push(args[p + 1]);
    const failure = state.fail?.(args); if (failure) return failure;
    let stdout = '';
    if (args[0] === 'default-keychain') {
      if (args.includes('-s')) state.currentDefault = args.slice(args.indexOf('-s') + 1);
      else if (!state.currentDefault.length) return {...missingResponse};
      else stdout = quote(state.currentDefault);
    } else if (args[0] === 'list-keychains') {
      if (args.includes('-s')) state.currentSearch = args.slice(args.indexOf('-s') + 1);
      else stdout = quote(state.currentSearch);
    } else if (args[0] === 'create-keychain') fs.writeFileSync(args.at(-1), 'SYNTHETIC TEST KEYCHAIN');
    else if (args[0] === 'delete-keychain') fs.unlinkSync(args.at(-1));
    return {status: 0, stdout, stderr: ''};
  };
  const input = {run, platform: 'darwin', env: {GITHUB_ACTIONS: 'true', RUNNER_TEMP: temp, GH_TOKEN: 'must-not-reach-security'}, execute};
  const report = () => JSON.parse(fs.readFileSync(path.join(run, 'MAC_NATIVE_KEYCHAIN.json'), 'utf8'));
  const assertPrivate = (error = '') => {
    const recorded = JSON.stringify(report()) + String(error);
    assert.ok(state.secrets.every(secret => !recorded.includes(secret)), 'Keychain password must not appear in ledger/error');
  };
  return {temp, run, original, state, input, report, assertPrivate};
}

test('non-macOS path is a true no-op, including actual Windows execution', async () => {
  let called = false;
  await (await prepareMacNativeKeychain({platform: 'win32', execute: () => {called = true;}}))();
  assert.equal(called, false);
});
test('macOS cannot prepare outside explicitly disposable CI', async () => {
  await assert.rejects(prepareMacNativeKeychain({platform: 'darwin', env: {}}), /disposable macOS CI/);
});
test('run root must be strictly inside the real runner temp', async t => {
  const f = fixture(t);
  await assert.rejects(prepareMacNativeKeychain({...f.input, run: f.temp}), /real RUNNER_TEMP/);
  assert.equal(f.state.calls.length, 0);
});
test('an existing HOME ancestor escape is rejected before any foreign directory is created', async t => {
  const f = fixture(t), foreign = path.join(f.temp, 'foreign'); fs.mkdirSync(foreign);
  fs.symlinkSync(foreign, path.join(f.run, 'environment'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareMacNativeKeychain(f.input), /HOME ancestor escaped/);
  assert.equal(fs.existsSync(path.join(foreign, 'HOME')), false); assert.equal(f.state.calls.length, 0);
});
test('real native setup and restoration plan keeps originals and redacts every password', async t => {
  const f = fixture(t), cleanup = await prepareMacNativeKeychain(f.input), prepared = f.report();
  assert.equal(prepared.prepared, true); assert.equal(prepared.restored, false);
  assert.deepEqual(f.state.currentSearch, [prepared.keychain]);
  assert.ok(f.state.calls.every(call => call.binary === '/usr/bin/security' && call.options.shell === false && call.options.timeout === 10000));
  assert.ok(f.state.calls.every(call => !Object.hasOwn(call.options.env, 'GH_TOKEN')));
  await cleanup(); await cleanup();
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.deepEqual(f.state.currentDefault, [f.original]); assert.deepEqual(f.state.currentSearch, [f.original]);
  assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
});
test('exact observed CI DomainDefault user absence is restored as unset, not invented', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  const owned = f.report().keychain;
  assert.equal(f.report().prepared, true); assert.deepEqual(f.state.currentDefault, [owned]);
  await cleanup(); await cleanup();
  assert.deepEqual(f.state.currentDefault, []); assert.deepEqual(f.state.currentSearch, [f.original]);
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.deepEqual(f.report().originalDefault, []);
  // Apple security(1): -s with no keychain unsets, not an empty-string filename.
  assert.equal(f.state.calls.filter(call => JSON.stringify(call.args) === JSON.stringify(['default-keychain', '-d', 'user', '-s'])).length, 1);
  assert.equal(f.report().commands.filter(call => call.stderr === ciMissingDefault.stderr && call.exitStatus === 1).length, 2);
  assert.equal(fs.existsSync(owned), false); assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
});

test('legacy non-domain CopyDefault absence still requires its actual error exit', async t => {
  const f = fixture(t, {missingDefault: true, missingResponse: {status: 1, stdout: '', stderr: 'security: SecKeychainCopyDefault: A default keychain could not be found.\n'}});
  const cleanup = await prepareMacNativeKeychain(f.input); await cleanup();
  assert.deepEqual(f.state.currentDefault, []); assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true); f.assertPrivate();
});

test('only the exact user-domain no-default error may pass the initial read', async t => {
  const cases = [
    ['permission denied', {status: 1, stdout: '', stderr: 'security: SecKeychainCopyDomainDefault user: User interaction is not allowed.\n'}],
    ['other domain', {...ciMissingDefault, stderr: ciMissingDefault.stderr.replace(' user:', ' system:')}],
    ['prefixed diagnostic', {...ciMissingDefault, stderr: 'permission denied\n' + ciMissingDefault.stderr}],
    ['trailing diagnostic', {...ciMissingDefault, stderr: ciMissingDefault.stderr + 'permission denied\n'}],
    ['nonempty stdout', {...ciMissingDefault, stdout: 'unexpected stdout'}],
    ['unrecognized status', {...ciMissingDefault, status: 44}],
    ['usage status', {...ciMissingDefault, status: 2}],
    ['terminated child', {...ciMissingDefault, status: null, signal: 'SIGTERM'}],
    ['spawn error', {...ciMissingDefault, error: new Error('ETIMEDOUT')}],
    ['legacy wrong status', {status: 44, stdout: '', stderr: 'security: SecKeychainCopyDefault: A default keychain could not be found.\n'}],
    ['missing security prefix', {...ciMissingDefault, stderr: ciMissingDefault.stderr.slice('security: '.length)}],
  ];
  for (const [name, response] of cases) await t.test(name, async sub => {
    const f = fixture(sub, {missingDefault: true}); f.state.fail = () => response;
    await assert.rejects(prepareMacNativeKeychain(f.input), /Native Keychain command failed/);
    assert.equal(f.report().prepared, false); assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
    assert.equal(f.state.calls.length, 1); assert.deepEqual(f.state.currentDefault, []); assert.deepEqual(f.state.currentSearch, [f.original]);
    assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
  });
});

test('absent default and empty original search list both restore without invented entries', async t => {
  const f = fixture(t, {missingDefault: true}); f.state.currentSearch = [];
  const cleanup = await prepareMacNativeKeychain(f.input); await cleanup();
  assert.deepEqual(f.state.currentDefault, []); assert.deepEqual(f.state.currentSearch, []);
  assert.ok(f.state.calls.some(call => JSON.stringify(call.args) === JSON.stringify(['list-keychains', '-d', 'user', '-s'])));
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true); f.assertPrivate();
});

test('failed unset never permits deleting a still-selected owned keychain', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => JSON.stringify(args) === JSON.stringify(['default-keychain', '-d', 'user', '-s']) ? {status: 1, stdout: '', stderr: 'unset denied'} : null;
  await assert.rejects(cleanup(), /unset denied/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
  assert.equal(fs.existsSync(f.report().keychain), true); assert.deepEqual(f.state.currentSearch, [f.original]);
  assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
});

test('successful unset exit without a restored empty default is detected before deletion', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => JSON.stringify(args) === JSON.stringify(['default-keychain', '-d', 'user', '-s']) ? {status: 0, stdout: '', stderr: ''} : null;
  await assert.rejects(cleanup(), /did not restore byte-exact/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.existsSync(f.report().keychain), true);
  assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
});

test('a different security error while verifying restoration is never treated as absence', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => args[0] === 'default-keychain' && !args.includes('-s') ? {status: 1, stdout: '', stderr: 'security: SecKeychainCopyDomainDefault user: authorization denied.\n'} : null;
  await assert.rejects(cleanup(), /authorization denied/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.existsSync(f.report().keychain), true);
  assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
});
test('partial setup failure restores the captured lists and deletes only its owned file', async t => {
  const f = fixture(t); let failed = false;
  f.state.fail = args => {if (!failed && args[0] === 'unlock-keychain') {failed = true; return {status: 1, stderr: 'unlock rejected', stdout: ''};}};
  await assert.rejects(prepareMacNativeKeychain(f.input), /unlock rejected/);
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.deepEqual(f.state.currentSearch, [f.original]); assert.equal(fs.existsSync(f.original), true); f.assertPrivate();
});
test('restoration failure retains the exact owned keychain instead of deleting a selected default', async t => {
  const f = fixture(t), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => args[0] === 'default-keychain' && args.includes('-s') && args.at(-1) === f.original ? {status: 1, stderr: 'restore denied', stdout: ''} : null;
  await assert.rejects(cleanup(), /restore denied/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
  assert.equal(fs.existsSync(f.report().keychain), true);
  assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
});
test('replacement cleanup targets are rejected without deleting the foreign bytes', async t => {
  const f = fixture(t), cleanup = await prepareMacNativeKeychain(f.input), target = f.report().keychain;
  // A directory is also an invalid replacement; avoids platform-specific symlink privileges.
  fs.unlinkSync(target); fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'foreign'), 'KEEP');
  await assert.rejects(cleanup(), /changed Keychain cleanup target/);
  assert.equal(fs.readFileSync(path.join(target, 'foreign'), 'utf8'), 'KEEP');
  assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
});
test('even a CLI error echoing the actual password is redacted before persistence or throw', async t => {
  const f = fixture(t);
  f.state.fail = args => args[0] === 'create-keychain' ? {status: 1, stdout: args[args.indexOf('-p') + 1], stderr: 'bad password ' + args[args.indexOf('-p') + 1]} : null;
  let error = ''; try {await prepareMacNativeKeychain(f.input);} catch (caught) {error = String(caught);}
  assert.ok(error.includes('<redacted-keychain-password>')); f.assertPrivate(error);
});
test('successful CLI exit with an undeleted owned keychain still fails cleanup', async t => {
  const f = fixture(t), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => args[0] === 'delete-keychain' ? {status: 0, stdout: '', stderr: ''} : null;
  await assert.rejects(cleanup(), /not deleted/); assert.equal(f.report().deleted, false); f.assertPrivate();
});
test('the actual advanced controller adapter bounds a real stalled child and retains literal streams', async t => {
  const f = fixture(t), ledger = [], source = fs.readFileSync(new URL('./run-desktop-advanced-native.mjs', import.meta.url), 'utf8');
  const declaration = source.slice(source.indexOf('async function command('), source.indexOf('\nconst expected'));
  const command = new Function('fs', 'path', 'run', 'ledger', 'runBoundedNativeCommand', declaration + ';return command;')
    (fs, path, f.run, ledger, runBoundedNativeCommand);
  const success = await command([process.execPath, '-e', 'process.stdout.write("ADVANCED_OUT\\n");process.stderr.write("ADVANCED_ERR\\n")']);
  assert.equal(success.stdout, 'ADVANCED_OUT\n'); assert.equal(success.stderr, 'ADVANCED_ERR\n'); assert.equal(success.exitStatus, 0);
  const stalled = await command([process.execPath, '-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], 300);
  assert.equal(stalled.exitStatus, 124); assert.equal(stalled.timedOut, true); assert.equal(stalled.cleanupComplete, true);
  assert.ok(stalled.elapsedMs < 6500); assert.equal(ledger.length, 2);
  assert.match(source, /All artist-iteration scenarios remain pending/);
  assert.match(source, /actual=await command\(argv,180000\)/);
});
