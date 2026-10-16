import { spawn } from 'node:child_process';
import {mobileNativeEntries,isMobileScenarioEntry} from './mobile-entry-specs.mjs';

// Flutter 3.24 run --machine: framed app.start/app.log/app.stop plus plain
// native log lines (run.dart creates its daemon with logToStdout=true).
// No TTY keystroke, second launch, repaired JSON, or self-declared count fallback.
export function createNativeProof({ sourceSha, platform, expectedChecks, profileSha, testEntry, requireNativeBegin=false }) {
  if (!Number.isSafeInteger(expectedChecks) || expectedChecks < 1) throw Error('A fixed positive expectedChecks input is required.');
  const checks = [], pending = [], errors = [];
  const pendingFields = new Set(['sourceSha', 'profileSha', 'platform', 'paidCalls', 'mockOnly', 'kind', 'nativeOnly', 'testEntry', 'feature', 'status', 'reason']);
  const beginFields = new Set(['sourceSha', 'profileSha', 'platform', 'paidCalls', 'mockOnly', 'kind', 'nativeOnly', 'testEntry', 'expectedChecks', 'nativePid']);
  const validPid=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
  const boundNativeIdentity = value => /^[a-f0-9]{64}$/.test(profileSha ?? '') &&
    value.profileSha === profileSha && value.kind === 'device' && value.nativeOnly === true &&
    value.mockOnly === false && isMobileScenarioEntry(testEntry) && value.testEntry === testEntry &&
    (!mobileNativeEntries[testEntry].platforms || mobileNativeEntries[testEntry].platforms.includes(platform));
  let completion = null, begin = null;
  function line(text) {
    if (/Unhandled Exception:|FEATURE_NATIVE_ASYNC_ERROR:|FEATURE_ACCEPTANCE_FAILURE:/.test(text)) errors.push('Native asynchronous/journey error: ' + text);
    const reserved = [...text.matchAll(/FEATURE_ACCEPTANCE_/g)];
    if (!reserved.length) return;
    if (reserved.length !== 1) { errors.push('Merged native proof lines are forbidden.'); return; }
    const marker = /FEATURE_ACCEPTANCE_(CHECK|DONE|BEGIN|PENDING):/.exec(text);
    if (!marker) { errors.push('Truncated or unknown native proof marker.'); return; }
    const literal = text.slice(marker.index + marker[0].length).trim();
    let value;
    try { value = JSON.parse(literal); } catch { errors.push('Truncated or malformed native proof JSON.'); return; }
    if (!value || Array.isArray(value) || typeof value !== 'object' || value.sourceSha !== sourceSha || value.platform !== platform || value.paidCalls !== 0) {
      errors.push('Native proof source/platform/safety identity mismatch.'); return;
    }
    if (marker[1] === 'BEGIN') {
      if (begin || completion || checks.length || !boundNativeIdentity(value) ||
          value.expectedChecks !== expectedChecks || Object.keys(value).some(key => !beginFields.has(key)) ||
          ('nativePid' in value && !validPid(value.nativePid)) || (requireNativeBegin && !validPid(value.nativePid))) {
        errors.push('Native BEGIN entry/profile/safety identity mismatch.'); return;
      }
      begin = value;
    } else if (marker[1] === 'PENDING') {
      // A capability observation is neither a CHECK nor a scenario. Bind its
      // profile externally; preserve the exact record without certifying it.
      if (!begin || completion || !boundNativeIdentity(value) || value.status !== 'pending' ||
          value.feature !== 'agent-components' || typeof value.reason !== 'string' ||
          !value.reason.trim() || value.reason.length > 16384 ||
          Object.keys(value).some(key => !pendingFields.has(key)) ||
          pending.some(record => record.feature === value.feature)) {
        errors.push('Native PENDING capability/profile/safety identity mismatch.'); return;
      }
      pending.push(value);
    } else if (marker[1] === 'CHECK') {
      if (requireNativeBegin && !begin) errors.push('Native CHECK before required same-entry native BEGIN.');
      if (completion) errors.push('Native CHECK emitted after DONE.');
      if (value.mockOnly !== false || value.status !== 'passed' || value.kind !== 'device') errors.push('Native CHECK must be a passed, non-mock device check.');
      checks.push(value);
    } else {
      if (completion) errors.push('Duplicate native DONE.');
      completion = value;
    }
  }
  function finish() {
    const failure = [...errors];
    if (requireNativeBegin && !begin) failure.push('Required same-entry native BEGIN/PID is missing.');
    if (!completion || completion.exitStatus !== 0 || completion.checks !== expectedChecks || checks.length !== expectedChecks) failure.push(`Native journey incomplete: expected ${expectedChecks}, checks ${checks.length}, DONE ${completion?.checks}, exit ${completion?.exitStatus}.`);
    return { checks, pending, begin, completion, errors: failure, passed: failure.length === 0 };
  }
  return { line, finish, get completion() { return completion; }, get checksCount() { return checks.length; }, get errorsCount() { return errors.length; } };
}

export async function collectResidentFlutter({ command, cwd, env, sourceSha, platform, device, expectedChecks, profileSha, testEntry, requireNativeBegin=false, timeoutMs = 1500000, journeyTimeoutMs = 300000, completionTailMs = 750, stopGraceMs = 15000 }) {
  const proof = createNativeProof({ sourceSha, platform, expectedChecks, profileSha, testEntry, requireNativeBegin });
  let stdout = '', stderr = '', nativeStdout = '', nativeStderr = '', appId = null;
  let actualCloseCode = null, actualCloseSignal = null, timedOut = false, terminationReason = 'unexpected-process-close', processError = null;
  let journeyStarted = false;
  let appStarted = false, stopDeadline = null;
  let stopRequested = false, stopReply = null, stopEventObserved = false;
  const protocolErrors = [], protocolEvents = [], stdinCommands = [];
  const buffers = { stdout: '', stderr: '' };
  const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const childPid = child.pid ?? null;
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  let deadline, tailTimer, killTimer;
  function forceStop(reason) {
    terminationReason = reason;
    clearTimeout(killTimer);
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), stopGraceMs);
  }
  function armDeadline(ms, reason) { clearTimeout(deadline); deadline = setTimeout(() => { timedOut = true; forceStop(reason); }, ms); }
  armDeadline(timeoutMs, 'build-or-launch-timeout');
  function startJourneyDeadline() {
    if (!journeyStarted && !proof.completion && !stopRequested) { journeyStarted = true; armDeadline(journeyTimeoutMs, 'native-journey-timeout'); }
  }
  function scheduleStopAfterReady() {
    if (!proof.completion || !appStarted || tailTimer || stopRequested || timedOut) return;
    // DONE can precede Flutter's devFS/service initialization. It is only a
    // completion candidate; app.stop is safe only after this app.started.
    tailTimer = setTimeout(() => {
      tailTimer = null;
      if (timedOut) return;
      if (!appId || !appStarted) { protocolErrors.push('Missing ready current Flutter app identity.'); forceStop('missing-app-identity'); return; }
      stopRequested = true; terminationReason = 'machine-app-stop-after-done';
      const request = { id: 'native-proof-stop', method: 'app.stop', params: { appId } };
      stdinCommands.push(request);
      child.stdin.write(JSON.stringify([request]) + '\n', error => { if (error) { protocolErrors.push(error.message); forceStop('stdin-stop-error'); } });
      // Only an actual stop request starts stopGrace. DONE-before-started keeps
      // the original build/journey deadline; repeated ready events extend none.
      clearTimeout(deadline);
      stopDeadline = Date.now() + stopGraceMs;
      deadline = setTimeout(() => { timedOut = true; forceStop('machine-stop-timeout'); }, stopGraceMs);
    }, completionTailMs);
  }
  function nativeLine(text, channel) {
    if (!appId && /FEATURE_ACCEPTANCE_(CHECK|DONE|BEGIN|PENDING):/.test(text)) protocolErrors.push('Native proof before matching current app.start.');
    if (channel === 'stderr') nativeStderr += text + '\n'; else nativeStdout += text + '\n';
    const beforeChecks = proof.checksCount, beforeErrors = proof.errorsCount;
    proof.line(text);
    if (appId && proof.errorsCount === beforeErrors && proof.checksCount > beforeChecks) startJourneyDeadline();
    scheduleStopAfterReady(); // Keep draining trailing native async errors.
  }
  function transportLine(text, channel) {
    const trimmed = text.trim();
    if (channel === 'stdout' && trimmed.startsWith('[{')) {
      let messages;
      try { messages = JSON.parse(trimmed); } catch { protocolErrors.push('Truncated/malformed Flutter machine frame.'); return; }
      if (!Array.isArray(messages) || messages.length !== 1 || !messages[0] || typeof messages[0] !== 'object') { protocolErrors.push('Invalid Flutter machine frame.'); return; }
      const message = messages[0], p = message.params ?? {};
      if (message.event === 'app.start') {
        if (appId || typeof p.appId !== 'string' || !p.appId || p.deviceId !== device) protocolErrors.push('Flutter current app.start identity mismatch.');
        else { appId = p.appId; } // app.start precedes the cold Xcode build in Flutter3.24.
        protocolEvents.push(message);
      } else if (message.event === 'app.started') {
        protocolEvents.push(message);
        if (!appId || p.appId !== appId) protocolErrors.push('Flutter app.started identity mismatch.');
        else { appStarted = true; startJourneyDeadline(); scheduleStopAfterReady(); }
      } else if (message.event === 'app.log') {
        if (!appId || p.appId !== appId || typeof p.log !== 'string') protocolErrors.push('Flutter app.log identity mismatch.');
        else for (const line of p.log.split(/\r?\n/)) nativeLine(line, p.error ? 'stderr' : 'stdout');
      } else if (message.event === 'app.stop') {
        protocolEvents.push(message);
        if (!appId || p.appId !== appId || p.error) protocolErrors.push('Flutter app.stop identity/error mismatch.');
        stopEventObserved = true;
      } else if (message.id === 'native-proof-stop') { stopReply = message; if (message.result !== true || message.error) protocolErrors.push('Flutter app.stop request failed.'); }
      else if (message.error) protocolErrors.push('Flutter machine command error: ' + JSON.stringify(message));
    } else nativeLine(text, channel);
  }
  function consume(data, channel) {
    if (channel === 'stdout') stdout += data; else stderr += data;
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 80 * 1024 * 1024) { protocolErrors.push('Resident Flutter output exceeds bounded 80MiB collection.'); forceStop('output-limit'); }
    buffers[channel] += data;
    let index;
    while ((index = buffers[channel].indexOf('\n')) >= 0) {
      const line = buffers[channel].slice(0, index).replace(/\r$/, ''); buffers[channel] = buffers[channel].slice(index + 1); transportLine(line, channel);
    }
  }
  child.stdout.on('data', data => consume(data, 'stdout'));
  child.stderr.on('data', data => consume(data, 'stderr'));
  child.stdin.on('error', error => { processError ??= error.message; });
  await new Promise(resolve => {
    child.on('error', error => { processError = error.stack || error.message; });
    // close, unlike exit, follows the final UTF-8 stdout/stderr data events.
    child.on('close', (code, signal) => { actualCloseCode = code; actualCloseSignal = signal; resolve(); });
  });
  clearTimeout(deadline); clearTimeout(tailTimer); clearTimeout(killTimer);
  for (const channel of ['stdout', 'stderr']) if (buffers[channel]) transportLine(buffers[channel], channel);
  const parsed = proof.finish(), errors = [...parsed.errors, ...protocolErrors];
  if (actualCloseCode !== 0 || actualCloseSignal !== null || timedOut || processError) errors.push('Resident Flutter process did not close successfully: ' + JSON.stringify({ actualCloseCode, actualCloseSignal, timedOut, processError }));
  if (!stopRequested || !stopEventObserved || stopReply?.result !== true || terminationReason !== 'machine-app-stop-after-done') errors.push('Current resident Flutter process lacks successful app.stop protocol/close evidence.');
  return { ...parsed, passed: errors.length === 0, errors, stdout, stderr, nativeStdout, nativeStderr, command, cwd, childPid,
    currentAppId: appId, currentAppStarted: appStarted, stopDeadline, requestedDevice: device, actualCloseCode, actualCloseSignal, timedOut, terminationReason, processError,
    journeyStarted, stdinCommands, protocolEvents, stopReply, stopEventObserved, expectedChecks,
    exitStatus: actualCloseCode, exitStatusMeaning: 'actual resident Flutter child close code; null/signal/nonzero is never accepted' };
}
