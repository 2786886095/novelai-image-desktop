// Controller authoring tests use a recording fake security CLI. They never
// certify native macOS accounts, safeStorage or a feature-matrix cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareMacNativeKeychain} from './mac-native-keychain.mjs';

const ciMissingDefault = {status: 1, stdout: '', stderr: 'security: SecKeychainCopyDomainDefault user: A default keychain could not be found.\n'};

const ciUnsetNoDefault = {status: 1, stdout: '', stderr: 'security: SecKeychainSetDomainDefault user: A default keychain could not be found.\n'};
const isEmptyUnset = args => JSON.stringify(args) === JSON.stringify(['default-keychain', '-d', 'user', '-s']);

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

function filesystemPreferencesFixture(t, {dropWrites = false, appleEmptySetters = false, retainPreferencesOnDelete = false} = {}) {
  const f = fixture(t, {missingDefault: true}); f.state.currentSearch = [];
  const prefs = path.join(f.run, 'environment', 'HOME', 'Library', 'Preferences', 'com.apple.security.plist');
  const read = () => fs.existsSync(prefs) ? JSON.parse(fs.readFileSync(prefs, 'utf8'))
    : {currentDefault: [], currentSearch: []};
  const memoryExecute = f.input.execute;
  f.input.execute = (binary, args, options) => {
    // Each fake process reloads disk. Match Apple's best-effort open behavior:
    // a missing parent leaves no preferences even when the setter exits zero.
    const before = read(); Object.assign(f.state, before);
    const answer = memoryExecute(binary, args, options);
    // Apple source: optional(NULL) returns the current default. An empty
    // search setter clears its "set" flag, so save leaves that plist key.
    // The recording fake is deliberately filesystem-backed across processes.
    const emptySetter = appleEmptySetters && args.includes('-s') && args.at(-1) === '-s' &&
      ['default-keychain', 'list-keychains'].includes(args[0]);
    if (emptySetter) Object.assign(f.state, before);
    const removed = appleEmptySetters && args[0] === 'delete-keychain' && answer.status === 0 && !fs.existsSync(args.at(-1));
    if (removed) {
      const owned = args.at(-1);
      f.state.currentDefault = before.currentDefault.filter(file => file !== owned);
      f.state.currentSearch = before.currentSearch.filter(file => file !== owned);
    }
    if (!dropWrites && answer.status === 0 && !emptySetter &&
        ((['default-keychain', 'list-keychains'].includes(args[0]) && args.includes('-s')) || removed && !retainPreferencesOnDelete)) {
      try {fs.writeFileSync(prefs, JSON.stringify({currentDefault: f.state.currentDefault, currentSearch: f.state.currentSearch}));}
      catch (error) {if (error.code !== 'ENOENT') throw error;}
    }
    Object.assign(f.state, read());
    return answer;
  };
  return {...f, prefs, read};
}

test('Apple empty-setter semantics restore a double-empty snapshot only by exact owned deletion and fresh dual reads', async t => {
  const f = filesystemPreferencesFixture(t, {appleEmptySetters: true});
  const cleanup = await prepareMacNativeKeychain(f.input), owned = f.report().keychain;
  await cleanup(); await cleanup();
  assert.deepEqual(f.read(), {currentDefault: [], currentSearch: []});
  assert.equal(f.report().prepared, true); assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.equal(fs.existsSync(owned), false); assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES');
  const calls = f.state.calls.map(call => call.args), deletion = calls.findIndex(args => args[0] === 'delete-keychain');
  assert.deepEqual(calls[deletion], ['delete-keychain', owned]);
  assert.equal(calls.filter(args => args[0] === 'delete-keychain').length, 1);
  assert.deepEqual(calls.slice(deletion - 2, deletion), [['default-keychain', '-d', 'user'], ['list-keychains', '-d', 'user']]);
  assert.deepEqual(calls.slice(deletion + 1), [['default-keychain', '-d', 'user'], ['list-keychains', '-d', 'user']]); f.assertPrivate();
});

test('ineffective empty setters never authorize fallback for any nonempty original snapshot', async t => {
  for (const original of [{currentDefault: [], currentSearch: ['ORIGINAL']}, {currentDefault: ['ORIGINAL'], currentSearch: []}]) await t.test(JSON.stringify(original), async sub => {
    const f = filesystemPreferencesFixture(sub, {appleEmptySetters: true});
    fs.mkdirSync(path.dirname(f.prefs), {recursive: true});
    fs.writeFileSync(f.prefs, JSON.stringify(Object.fromEntries(Object.entries(original).map(([key, value]) => [key, value.map(() => f.original)]))));
    const cleanup = await prepareMacNativeKeychain(f.input);
    await assert.rejects(cleanup(), /did not restore byte-exact/);
    assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
    assert.equal(fs.existsSync(f.report().keychain), true); assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain'));
    assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
  });
});

test('double-empty fallback rejects foreign, duplicate or partly restored current lists', async t => {
  for (const variant of ['foreign-default', 'foreign-search', 'duplicate-search', 'default-already-empty']) await t.test(variant, async sub => {
    const f = filesystemPreferencesFixture(sub, {appleEmptySetters: true}), cleanup = await prepareMacNativeKeychain(f.input), owned = f.report().keychain;
    const currentDefault = variant === 'foreign-default' ? [f.original] : variant === 'default-already-empty' ? [] : [owned];
    const currentSearch = variant === 'foreign-search' ? [owned, f.original] : variant === 'duplicate-search' ? [owned, owned] : [owned];
    fs.writeFileSync(f.prefs, JSON.stringify({currentDefault, currentSearch}));
    await assert.rejects(cleanup(), /did not restore byte-exact/);
    assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.existsSync(owned), true);
    assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
  });
});

test('double-empty fallback cannot conceal setter or fresh-read failures', async t => {
  for (const phase of ['unset', 'search-set', 'default-read', 'search-read']) await t.test(phase, async sub => {
    const f = filesystemPreferencesFixture(sub, {appleEmptySetters: true}), cleanup = await prepareMacNativeKeychain(f.input);
    f.state.fail = args => {
      const selected = phase === 'unset' ? isEmptyUnset(args) : phase === 'search-set' ? args[0] === 'list-keychains' && args.includes('-s')
        : phase === 'default-read' ? args[0] === 'default-keychain' && !args.includes('-s') : args[0] === 'list-keychains' && !args.includes('-s');
      return selected ? {status: 1, stdout: '', stderr: 'STRICT_' + phase + '_FAILURE'} : null;
    };
    await assert.rejects(cleanup(), new RegExp('STRICT_' + phase + '_FAILURE'));
    assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.existsSync(f.report().keychain), true);
    assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
  });
});

test('double-empty fallback rechecks owned path and rejects symlink replacement', async t => {
  const f = filesystemPreferencesFixture(t, {appleEmptySetters: true}), cleanup = await prepareMacNativeKeychain(f.input), owned = f.report().keychain;
  const foreign = path.join(f.temp, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'KEEP'), 'PRISTINE');
  fs.unlinkSync(owned); fs.symlinkSync(foreign, owned, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanup(), /changed Keychain cleanup target/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.readFileSync(path.join(foreign, 'KEEP'), 'utf8'), 'PRISTINE');
  assert.ok(!f.state.calls.some(call => call.args[0] === 'delete-keychain')); f.assertPrivate();
});

test('double-empty fallback requires successful deletion, actual absence and empty reread preferences', async t => {
  for (const phase of ['delete-failure', 'delete-zero-no-unlink', 'stale-preferences', 'post-delete-read-error']) await t.test(phase, async sub => {
    const f = filesystemPreferencesFixture(sub, {appleEmptySetters: true, retainPreferencesOnDelete: phase === 'stale-preferences'});
    const cleanup = await prepareMacNativeKeychain(f.input), owned = f.report().keychain;
    f.state.fail = args => args[0] === 'delete-keychain' && phase === 'delete-failure' ? {status: 1, stdout: '', stderr: 'DELETE_DENIED'}
      : args[0] === 'delete-keychain' && phase === 'delete-zero-no-unlink' ? {status: 0, stdout: '', stderr: ''}
      : phase === 'post-delete-read-error' && !fs.existsSync(owned) && args[0] === 'default-keychain' && !args.includes('-s') ? {status: 1, stdout: '', stderr: 'POST_DELETE_DENIED'} : null;
    await assert.rejects(cleanup(), /DELETE_DENIED|not deleted|did not restore byte-exact|POST_DELETE_DENIED/);
    assert.equal(f.report().restored, false); assert.equal(f.report().deleted, ['stale-preferences', 'post-delete-read-error'].includes(phase));
    assert.equal(fs.existsSync(owned), !['stale-preferences', 'post-delete-read-error'].includes(phase));
    assert.equal(f.state.calls.filter(call => call.args[0] === 'delete-keychain').length, 1);
    assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
  });
});

test('successful double-empty cleanup still rethrows an independent setup failure', async t => {
  const f = filesystemPreferencesFixture(t, {appleEmptySetters: true}); let selectionRead = false;
  f.state.fail = args => {
    if (!selectionRead && args[0] === 'default-keychain' && !args.includes('-s') && f.state.currentDefault.length) {
      selectionRead = true; return {status: 0, stdout: '    "' + f.original + '"\n', stderr: ''};
    }
  };
  await assert.rejects(prepareMacNativeKeychain(f.input), /Dedicated native Keychain was not selected/);
  assert.equal(f.report().prepared, false); assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.equal(f.report().setupFailure, 'Dedicated native Keychain was not selected'); assert.equal(f.report().failure, 'Dedicated native Keychain was not selected');
  assert.equal(f.report().restorationFailure, null); f.assertPrivate();
});

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
test('owned HOME preference parent exists before security without adding Keychains or CF overrides', async t => {
  const f = filesystemPreferencesFixture(t), cleanup = await prepareMacNativeKeychain(f.input);
  const home = path.join(f.run, 'environment', 'HOME');
  for (const directory of [path.join(f.run, 'environment'), home, path.join(home, 'Library'), path.dirname(f.prefs)]) {
    assert.equal(fs.lstatSync(directory).isDirectory(), true); assert.equal(fs.lstatSync(directory).isSymbolicLink(), false);
    assert.equal(fs.realpathSync(directory), directory);
  }
  assert.equal(fs.existsSync(path.join(home, 'Library', 'Keychains')), false);
  assert.ok(f.state.calls.every(c => c.options.env.HOME === home && !Object.hasOwn(c.options.env, 'CFFIXED_USER_HOME')));
  assert.deepEqual(f.read().currentDefault, [f.report().keychain]); assert.deepEqual(f.read().currentSearch, [f.report().keychain]);
  await cleanup(); assert.deepEqual(f.read(), {currentDefault: [], currentSearch: []});
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true); f.assertPrivate();
});
test('filesystem-backed preferences preserve the exact preexisting default and ordered search', async t => {
  const f = filesystemPreferencesFixture(t), second = path.join(f.temp, 'second.keychain-db'); fs.writeFileSync(second, 'SECOND PRISTINE');
  fs.mkdirSync(path.dirname(f.prefs), {recursive: true});
  const original = {currentDefault: [f.original], currentSearch: [second, f.original]};
  fs.writeFileSync(f.prefs, JSON.stringify(original));
  const cleanup = await prepareMacNativeKeychain(f.input); await cleanup();
  assert.deepEqual(f.read(), original); assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.equal(fs.readFileSync(second, 'utf8'), 'SECOND PRISTINE'); assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
});
test('setter exit zero without persisted preferences still fails actual selection readback', async t => {
  const f = filesystemPreferencesFixture(t, {dropWrites: true});
  await assert.rejects(prepareMacNativeKeychain(f.input), /SecKeychainCopyDomainDefault user/);
  assert.equal(f.report().prepared, false); assert.match(f.report().setupFailure, /SecKeychainCopyDomainDefault user/);
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true); f.assertPrivate();
});
test('every HOME directory level rejects both foreign and internal symlink aliases before security', async t => {
  for (const segments of [['environment'], ['environment', 'HOME'], ['environment', 'HOME', 'Library'], ['environment', 'HOME', 'Library', 'Preferences']]) {
    for (const placement of ['foreign', 'internal']) await t.test(segments.join('/') + ':' + placement, async sub => {
      const f = fixture(sub), link = path.join(f.run, ...segments), target = path.join(placement === 'foreign' ? f.temp : f.run, 'alias-target');
      fs.mkdirSync(path.dirname(link), {recursive: true}); fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'KEEP'), 'PRISTINE');
      fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      await assert.rejects(prepareMacNativeKeychain(f.input), /HOME.*escaped/);
      assert.equal(f.state.calls.length, 0); assert.deepEqual(fs.readdirSync(target), ['KEEP']); assert.equal(fs.readFileSync(path.join(target, 'KEEP'), 'utf8'), 'PRISTINE');
    });
  }
});
test('Library and Preferences regular files are never replaced or traversed', async t => {
  for (const segments of [['environment', 'HOME', 'Library'], ['environment', 'HOME', 'Library', 'Preferences']]) await t.test(segments.at(-1), async sub => {
    const f = fixture(sub), target = path.join(f.run, ...segments); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, 'PRISTINE FILE');
    await assert.rejects(prepareMacNativeKeychain(f.input), /HOME.*escaped/);
    assert.equal(f.state.calls.length, 0); assert.equal(fs.readFileSync(target, 'utf8'), 'PRISTINE FILE');
  });
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
  // The documented argless setter is attempted, never an empty-string filename.
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
test('exact CI unset-no-default error is allowed only with verified absent default and original search', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => {if (isEmptyUnset(args)) {f.state.currentDefault = []; return {...ciUnsetNoDefault};}};
  await cleanup(); await cleanup();
  assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.deepEqual(f.state.currentDefault, []); assert.deepEqual(f.state.currentSearch, [f.original]);
  const unset = f.report().commands.filter(row => row.command.length === 5 && row.command.at(-1) === '-s');
  assert.equal(unset.length, 1); assert.equal(unset[0].stderr, ciUnsetNoDefault.stderr); assert.equal(unset[0].exitStatus, 1);
  assert.equal(f.report().commands.filter(row => row.stderr === ciMissingDefault.stderr).length, 2);
  assert.equal(fs.readFileSync(f.original, 'utf8'), 'ORIGINAL PRISTINE BYTES'); f.assertPrivate();
});

test('exact unset diagnostic cannot hide a still-selected owned default', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => isEmptyUnset(args) ? {...ciUnsetNoDefault} : null;
  await assert.rejects(cleanup(), /did not restore byte-exact/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.existsSync(f.report().keychain), true);
  assert.ok(!f.state.calls.some(c => c.args[0] === 'delete-keychain')); f.assertPrivate();
});

test('exact unset diagnostic cannot hide a search-list mismatch', async t => {
  const f = fixture(t, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => {
    if (isEmptyUnset(args)) {f.state.currentDefault = []; return {...ciUnsetNoDefault};}
    if (args[0] === 'list-keychains' && args.includes('-s')) return {status: 0, stdout: '', stderr: ''};
  };
  await assert.rejects(cleanup(), /did not restore byte-exact/);
  assert.deepEqual(f.state.currentDefault, []); assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
  assert.ok(!f.state.calls.some(c => c.args[0] === 'delete-keychain')); f.assertPrivate();
});

test('restoring a nonempty original default never accepts an unset-only diagnostic', async t => {
  const f = fixture(t), cleanup = await prepareMacNativeKeychain(f.input);
  f.state.fail = args => args[0] === 'default-keychain' && args.includes('-s') && args.at(-1) === f.original ? {...ciUnsetNoDefault} : null;
  await assert.rejects(cleanup(), /SecKeychainSetDomainDefault/);
  assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false); assert.equal(fs.existsSync(f.report().keychain), true);
  assert.ok(!f.state.calls.some(c => c.args[0] === 'delete-keychain')); f.assertPrivate();
});

test('only the precise unset user/status1/empty-stdout error can be reconciled', async t => {
  const cases = [
    ['permission', {...ciUnsetNoDefault, stderr: 'security: SecKeychainSetDomainDefault user: authorization denied.\n'}],
    ['other domain', {...ciUnsetNoDefault, stderr: ciUnsetNoDefault.stderr.replace(' user:', ' system:')}],
    ['extra diagnostic', {...ciUnsetNoDefault, stderr: ciUnsetNoDefault.stderr + 'additional error\n'}],
    ['nonempty stdout', {...ciUnsetNoDefault, stdout: 'unexpected stdout'}],
    ['wrong status', {...ciUnsetNoDefault, status: 44}],
    ['usage status', {...ciUnsetNoDefault, status: 2}],
    ['signal', {...ciUnsetNoDefault, status: null, signal: 'SIGTERM'}],
    ['spawn error', {...ciUnsetNoDefault, error: new Error('ETIMEDOUT')}],
    ['wrong function', {...ciMissingDefault}],
  ];
  for (const [name, response] of cases) await t.test(name, async sub => {
    const f = fixture(sub, {missingDefault: true}), cleanup = await prepareMacNativeKeychain(f.input);
    f.state.fail = args => {if (isEmptyUnset(args)) {f.state.currentDefault = []; return response;}};
    await assert.rejects(cleanup(), /Native Keychain command failed/);
    assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
    assert.ok(!f.state.calls.some(c => c.args[0] === 'delete-keychain')); f.assertPrivate();
  });
});

test('a setup SetDomainDefault error with an explicit path is never an accepted unset', async t => {
  const f = fixture(t, {missingDefault: true});
  f.state.fail = args => {
    if (args[0] === 'default-keychain' && args.includes('-s') && args.length === 5) return {...ciUnsetNoDefault};
    if (isEmptyUnset(args)) {f.state.currentDefault = []; return {...ciUnsetNoDefault};}
  };
  await assert.rejects(prepareMacNativeKeychain(f.input), /SecKeychainSetDomainDefault/);
  assert.match(f.report().setupFailure, /acceptance\.keychain-db/);
  assert.equal(f.report().prepared, false); assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true);
  assert.equal(f.report().restorationFailure, null); f.assertPrivate();
});

test('setup and restoration failures retain independent redacted diagnostics', async t => {
  const f = fixture(t, {missingDefault: true});
  f.state.fail = args => args[0] === 'unlock-keychain' ? {status: 1, stdout: '', stderr: 'ORIGINAL_SETUP_FAILURE'}
    : isEmptyUnset(args) ? {status: 1, stdout: '', stderr: 'RESTORE_DENIED'} : null;
  let error;
  try {await prepareMacNativeKeychain(f.input);} catch (caught) {error = caught;}
  assert.match(error.message, /ORIGINAL_SETUP_FAILURE/); assert.match(error.message, /RESTORE_DENIED/);
  assert.match(f.report().setupFailure, /ORIGINAL_SETUP_FAILURE/);
  assert.match(f.report().restorationFailure, /RESTORE_DENIED/);
  assert.match(f.report().failure, /ORIGINAL_SETUP_FAILURE/); assert.match(f.report().failure, /RESTORE_DENIED/);
  assert.equal(f.report().prepared, false); assert.equal(f.report().restored, false); assert.equal(f.report().deleted, false);
  f.assertPrivate(error.message);
});

test('reconciled unset still cannot turn an earlier failed setup into success', async t => {
  const f = fixture(t, {missingDefault: true}); let selectionRead = false;
  f.state.fail = args => {
    if (args[0] === 'default-keychain' && !args.includes('-s') && f.state.currentDefault.length && !selectionRead) {
      selectionRead = true; return {status: 0, stdout: '    "' + f.original + '"\n', stderr: ''};
    }
    if (isEmptyUnset(args)) {f.state.currentDefault = []; return {...ciUnsetNoDefault};}
  };
  await assert.rejects(prepareMacNativeKeychain(f.input), /Dedicated native Keychain was not selected/);
  assert.equal(f.report().setupFailure, 'Dedicated native Keychain was not selected');
  assert.equal(f.report().restorationFailure, null);
  assert.equal(f.report().failure, 'Dedicated native Keychain was not selected');
  assert.equal(f.report().prepared, false); assert.equal(f.report().restored, true); assert.equal(f.report().deleted, true); f.assertPrivate();
});
