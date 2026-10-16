import {spawn} from 'node:child_process';

// Unlike spawnSync's SIGTERM timeout, this cannot wait forever for an Electron
// child (or an inherited stdio pipe). A timeout always remains a failed command.
export function runBoundedNativeCommand(argv, {
  cwd, env = process.env, timeout = 180000, killGrace = 1000,
  drainGrace = 1000, maxBuffer = 60 * 1024 * 1024, onStdout, onStderr,
} = {}) {
  if (!Array.isArray(argv) || !argv.length || !Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new TypeError('A command and positive timeout are required');
  }
  return new Promise(resolve => {
    const started = Date.now(), chunks = {stdout: [], stderr: []}, cleanup = [];
    let child, settled = false, timedOut = false, overflow = false, inheritedPipeFailure = false, error = null;
    let status = null, signal = null, bytes = 0, deadline, forceTimer, finishTimer, drainTimer;
    let childClosed = false, forceSent = false, cleanupComplete = true;
    const killers = new Set();
    const result = () => ({command: argv, cwd, stdout: Buffer.concat(chunks.stdout).toString('utf8'),
      stderr: Buffer.concat(chunks.stderr).toString('utf8'), exitStatus: timedOut ? 124 : overflow || inheritedPipeFailure ? 125 : status,
      signal, error, timedOut, outputOverflow: overflow, pid: child?.pid ?? null,
      timeoutMs: timeout, elapsedMs: Date.now() - started, cleanupComplete, cleanup});
    const finish = () => {
      if (settled) return;
      settled = true;
      for (const timer of [deadline, forceTimer, finishTimer, drainTimer]) clearTimeout(timer);
      child?.stdout?.destroy(); child?.stderr?.destroy(); child?.unref();
      resolve(result());
    };
    const finishCleanAbort = () => {
      if ((timedOut || overflow) && childClosed && killers.size === 0 &&
          (process.platform === 'win32' || forceSent)) {
        cleanupComplete = true;
        finish();
      }
    };
    const killTree = force => {
      if (!child?.pid) return;
      const action = {pid: child.pid, force: force || process.platform === 'win32', atMs: Date.now() - started};
      cleanup.push(action);
      if (process.platform === 'win32') {
        // /T targets this freshly spawned test tree, never unrelated user apps.
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
        killers.add(killer);
        killer.on('error', e => {action.error = e.message;});
        killer.on('exit', code => {action.exitStatus = code;});
        killer.on('close', () => {killers.delete(killer); finishCleanAbort();});
        killer.unref();
      } else {
        if (force) forceSent = true;
        try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); action.sent = true; }
        catch (e) { action.error = e.code || e.message; }
        finishCleanAbort();
      }
    };
    const abort = reason => {
      if (settled || finishTimer) return;
      if (reason === 'timeout') timedOut = true;
      cleanupComplete = false;
      error ||= reason === 'timeout' ? `Native command exceeded ${timeout}ms` : reason;
      killTree(false);
      forceTimer = setTimeout(() => killTree(true), killGrace);
      // Force resolution independently of `close`: descendants can retain pipes.
      // Windows taskkill completion is observed, not guessed from a short sleep.
      finishTimer = setTimeout(finish, killGrace + drainGrace + (process.platform === 'win32' ? 3000 : 0));
    };
    try {
      child = spawn(argv[0], argv.slice(1), {cwd, env, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
    } catch (e) { error = e.message; finish(); return; }
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maxBuffer) { overflow = true; abort(`Native command exceeded output limit ${maxBuffer}`); return; }
      chunks[name].push(Buffer.from(chunk));
      (name === 'stdout' ? onStdout : onStderr)?.(chunk);
    });
    child.on('error', e => { error = e.message; finish(); });
    child.on('exit', (code, value) => {
      status = code; signal = value;
      // A process can exit while its descendant holds the inherited pipes open.
      if (!timedOut && !overflow) drainTimer = setTimeout(() => {
        error ||= 'Native command exited but inherited output pipes did not close';
        inheritedPipeFailure = true; cleanupComplete = false; killTree(true);
        finishTimer = setTimeout(finish, drainGrace);
      }, drainGrace);
    });
    child.on('close', (code, value) => {
      status = code; signal = value; childClosed = true;
      // Keep the grace deadline on an abort so the entire POSIX group receives
      // SIGKILL even if the original parent exits first.
      if (!timedOut && !overflow) {cleanupComplete = true; finish();} else finishCleanAbort();
    });
    deadline = setTimeout(() => abort('timeout'), timeout);
  });
}
