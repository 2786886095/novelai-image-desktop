// Disposable CI preparation only. Keep real Electron safeStorage/Keychain calls;
// never substitute basic/fake storage or admit a receipt from this setup alone.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

function inside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function paths(stdout) {
  const lines = stdout.trim() ? stdout.trim().split(/\r?\n/) : [];
  return lines.map(line => {
    const match = /^\s*"([^"\r\n]+)"\s*$/.exec(line);
    if (!match || !path.isAbsolute(match[1])) throw Error('Malformed native keychain path response');
    return match[1];
  });
}

export async function prepareMacNativeKeychain({run, env = process.env,
  platform = process.platform, execute = spawnSync} = {}) {
  // In particular, Windows acceptance must not query or modify any keychain.
  if (platform !== 'darwin') return async () => {};
  if (env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP))
    throw Error('Native Keychain preparation requires disposable macOS CI');
  const temp = fs.realpathSync(env.RUNNER_TEMP), output = fs.realpathSync(run);
  if (!inside(temp, output)) throw Error('Native Keychain evidence must stay inside real RUNNER_TEMP');
  const home = path.join(output, 'environment', 'HOME');
  // Apple's legacy Keychain preferences writer does not create the parent of
  // HOME/Library/Preferences/com.apple.security.plist or propagate every I/O error.
  // Create only the required owned preference directory, checking every level.
  let directory = output;
  for (const part of ['environment', 'HOME', 'Library', 'Preferences']) {
    const parent = fs.lstatSync(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || fs.realpathSync(directory) !== directory ||
        directory !== output && !inside(output, directory))
      throw Error('Native Keychain HOME ancestor escaped its run');
    const next = path.join(directory, part);
    const existing = fs.lstatSync(next, {throwIfNoEntry: false});
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink() || fs.realpathSync(next) !== next))
      throw Error('Native Keychain HOME ancestor escaped its run');
    if (!existing) fs.mkdirSync(next, {mode: 0o700});
    const created = fs.lstatSync(next);
    if (!created.isDirectory() || created.isSymbolicLink() || fs.realpathSync(next) !== next || !inside(output, next))
      throw Error('Native Keychain HOME directory escaped its run');
    directory = next;
  }
  const securityEnv = {...env, HOME: home};
  for (const key of Object.keys(securityEnv))
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) delete securityEnv[key];
  const root = fs.realpathSync(fs.mkdtempSync(path.join(temp, 'native-acceptance-keychain-')));
  const keychain = path.join(root, 'acceptance.keychain-db');
  const password = crypto.randomBytes(32).toString('hex');
  const ledger = [], file = path.join(output, 'MAC_NATIVE_KEYCHAIN.json');
  const state = {schema: 'disposable-mac-native-keychain/v1', run: output, keychain,
    prepared: false, restored: false, deleted: false, failure: null,
    setupFailure: null, restorationFailure: null, commands: ledger};
  const clean = value => String(value ?? '').split(password).join('<redacted-keychain-password>');
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  function call(args, {allowNoDefault = false, allowAbsentUnset = false} = {}) {
    // Passwords are necessarily local CLI arguments, never persisted in argv,
    // stdout/stderr, thrown errors or uploaded diagnostics. No shell is used.
    let raw;
    try { raw = execute('/usr/bin/security', args, {env: securityEnv, encoding: 'utf8',
      shell: false, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024}); }
    catch (error) { raw = {status: null, stdout: '', stderr: '', error}; }
    const command = ['/usr/bin/security', ...args.map((value, i) => args[i - 1] === '-p' ? '<redacted-keychain-password>' : clean(value))];
    const row = {command, stdout: clean(raw.stdout), stderr: clean(raw.stderr),
      exitStatus: raw.status, error: raw.error ? clean(raw.error.message || raw.error) : null};
    ledger.push(row); save();
    // Apple's security CLI returns 1 for this exact missing-default error.
    // DomainDefault is emitted by -d user; do not swallow other domains,
    // authorization failures, mixed diagnostics, signals or spawn errors.
    const absent = allowNoDefault && args.length === 3 &&
      args[0] === 'default-keychain' && args[1] === '-d' && args[2] === 'user' &&
      row.exitStatus === 1 && !row.error && !row.stdout.trim() &&
      /^security: SecKeychainCopy(?:DomainDefault user|Default): A default keychain could not be found\.$/.test(row.stderr.trim());
    // A no-default result can also occur on a user-default unset request. This exact restore-only case is provisional: restoration
    // below must still independently read back no default and the original list.
    const absentUnset = allowAbsentUnset && args.length === 4 &&
      args[0] === 'default-keychain' && args[1] === '-d' && args[2] === 'user' && args[3] === '-s' &&
      row.exitStatus === 1 && !row.error && !row.stdout.trim() &&
      /^security: SecKeychainSetDomainDefault user: A default keychain could not be found\.$/.test(row.stderr.trim());
    if (row.error || row.exitStatus !== 0 && !absent && !absentUnset)
      throw Error('Native Keychain command failed: ' + JSON.stringify(row));
    return absent ? '' : row.stdout;
  }
  let originalDefault, originalSearch, snapshotComplete = false, creationAttempted = false, cleanup;
  function ownedFile() {
    if (!inside(temp, fs.realpathSync(root)) || path.dirname(keychain) !== root ||
        path.basename(root).indexOf('native-acceptance-keychain-') !== 0)
      throw Error('Refusing unsafe Keychain cleanup path');
    if (!fs.existsSync(keychain)) return false;
    if (!fs.lstatSync(keychain).isFile() || fs.lstatSync(keychain).isSymbolicLink() || fs.realpathSync(keychain) !== keychain)
      throw Error('Refusing changed Keychain cleanup target');
    return true;
  }
  const restore = () => cleanup ??= (async () => {
    if (!snapshotComplete) return;
    const errors = [];
    // security(1): -s without a keychain unsets it (SetDomainDefault NULL).
    // An originally absent default must stay absent; never invent login.keychain.
    try { call(['default-keychain', '-d', 'user', '-s', ...originalDefault], {allowAbsentUnset: originalDefault.length === 0}); } catch (error) { errors.push(clean(error.message)); }
    try { call(['list-keychains', '-d', 'user', '-s', ...originalSearch]); } catch (error) { errors.push(clean(error.message)); }
    try {
      const currentDefault = paths(call(['default-keychain', '-d', 'user'], {allowNoDefault: true}));
      const currentSearch = paths(call(['list-keychains', '-d', 'user']));
      if (JSON.stringify(currentDefault) !== JSON.stringify(originalDefault) || JSON.stringify(currentSearch) !== JSON.stringify(originalSearch))
        throw Error('Native Keychain preferences did not restore byte-exact path lists');
      state.restored = errors.length === 0;
    } catch (error) { errors.push(clean(error.message)); }
    // Never delete a still-selected keychain after a failed restoration. Retain
    // that exact owned path and restoration diagnostics for the disposable job.
    if (state.restored && creationAttempted) {
      try {
        if (ownedFile()) call(['delete-keychain', keychain]);
        state.deleted = !fs.existsSync(keychain);
        if (!state.deleted) throw Error('Owned native Keychain was not deleted');
      }
      catch (error) { errors.push(clean(error.message)); }
    }
    if (errors.length) { state.restorationFailure = errors.join('\n'); state.failure = state.restorationFailure; save(); throw Error(state.restorationFailure); }
    save();
  })();
  try {
    originalDefault = paths(call(['default-keychain', '-d', 'user'], {allowNoDefault: true}));
    if (originalDefault.length > 1) throw Error('Multiple default Keychains are not supported');
    originalSearch = paths(call(['list-keychains', '-d', 'user'])); snapshotComplete = true;
    state.originalDefault = originalDefault; state.originalSearch = originalSearch;
    creationAttempted = true;
    call(['create-keychain', '-p', password, keychain]);
    if (!ownedFile()) throw Error('Native Keychain creation did not produce its owned file');
    call(['unlock-keychain', '-p', password, keychain]);
    call(['set-keychain-settings', '-t', '3600', keychain]);
    call(['default-keychain', '-d', 'user', '-s', keychain]);
    call(['list-keychains', '-d', 'user', '-s', keychain]);
    if (JSON.stringify(paths(call(['default-keychain', '-d', 'user']))) !== JSON.stringify([keychain]) ||
        JSON.stringify(paths(call(['list-keychains', '-d', 'user']))) !== JSON.stringify([keychain]))
      throw Error('Dedicated native Keychain was not selected');
    state.prepared = true; save(); return restore;
  } catch (error) {
    // Cleanup can fail too; never overwrite the original setup failure with
    // only its restoration error (including non-command selection failures).
    const setupFailure = clean(error.message);
    state.setupFailure = setupFailure; state.failure = setupFailure; save();
    try { await restore(); } catch (cleanupError) {
      state.failure = setupFailure + '\nRestoration failed: ' + clean(cleanupError.message); save();
      throw Error(state.failure);
    }
    throw Error(setupFailure);
  }
}
