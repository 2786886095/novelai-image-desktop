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
  let ancestor = path.dirname(home);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const existingAncestor = fs.realpathSync(ancestor);
  if (existingAncestor !== output && !inside(output, existingAncestor))
    throw Error('Native Keychain HOME ancestor escaped its run');
  fs.mkdirSync(home, {recursive: true});
  if (!inside(output, fs.realpathSync(home))) throw Error('Native Keychain HOME escaped its run');
  const securityEnv = {...env, HOME: home};
  for (const key of Object.keys(securityEnv))
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) delete securityEnv[key];
  const root = fs.realpathSync(fs.mkdtempSync(path.join(temp, 'native-acceptance-keychain-')));
  const keychain = path.join(root, 'acceptance.keychain-db');
  const password = crypto.randomBytes(32).toString('hex');
  const ledger = [], file = path.join(output, 'MAC_NATIVE_KEYCHAIN.json');
  const state = {schema: 'disposable-mac-native-keychain/v1', run: output, keychain,
    prepared: false, restored: false, deleted: false, failure: null, commands: ledger};
  const clean = value => String(value ?? '').split(password).join('<redacted-keychain-password>');
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  function call(args, {allowNoDefault = false} = {}) {
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
    if (row.error || row.exitStatus !== 0 && !absent)
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
    try { call(['default-keychain', '-d', 'user', '-s', ...originalDefault]); } catch (error) { errors.push(clean(error.message)); }
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
    if (errors.length) { state.failure = errors.join('\n'); save(); throw Error(state.failure); }
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
    state.failure = clean(error.message); save();
    try { await restore(); } catch (cleanupError) { throw Error(state.failure + '\nRestoration failed: ' + clean(cleanupError.message)); }
    throw Error(state.failure);
  }
}
