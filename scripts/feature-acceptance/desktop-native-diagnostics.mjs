import fs from 'node:fs';
import path from 'node:path';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';

// Only a fresh macOS Actions runner may collect an OS native stack. No human
// workstation screenshot/keychain/clipboard is inspected, and diagnostics never
// change the native command deadline, checks, exit code, or source qualification.
export function startMacNativeStallDiagnostics({run, timeout, hostPlatform = process.platform,
  githubActions = process.env.GITHUB_ACTIONS, command = runBoundedNativeCommand,
  schedule = setTimeout, cancel = clearTimeout, delayMs = Math.min(200000, timeout - 15000)} = {}) {
  if (hostPlatform !== 'darwin' || githubActions !== 'true' || delayMs <= 0) return async () => {};
  let task;
  const timer = schedule(() => {
    task = (async () => {
      const record = {kind: 'mac-native-stall-stack', at: new Date().toISOString(), diagnosticOnly: true};
      try {
        const file = path.join(run, 'BOOTSTRAP_PHASES.jsonl');
        const events = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
        const event = events.at(-1);
        if (event?.platform !== 'darwin' || !Number.isSafeInteger(event.pid) || event.pid <= 0) {
          throw Error('No actual native macOS PID in this run bootstrap trace');
        }
        record.lastBootstrapPhase = event;
        record.nativePid = event.pid;
        record.command = await command(['/usr/bin/sample', String(event.pid), '3', '-file', path.join(run, 'MAC_NATIVE_STALL.sample.txt')],
          {cwd: run, timeout: 10000, maxBuffer: 4 * 1024 * 1024});
      } catch (error) {record.failure = error.stack || String(error);}
      fs.writeFileSync(path.join(run, 'MAC_NATIVE_STALL_DIAGNOSTICS.json'), JSON.stringify(record, null, 2) + '\n');
    })();
  }, delayMs);
  timer?.unref?.();
  return async () => {cancel(timer); await task;};
}
