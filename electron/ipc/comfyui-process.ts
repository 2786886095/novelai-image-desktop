import { spawn, execFile, execFileSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { probeBindable, probeComfy, probeTcp, matchesOwnedLaunch, matchesConfiguredMain, type ComfyProbeResult, type ProbedComfyIdentity } from './comfyui-probe';
import { resolveLoopbackTarget, type ComfyTarget, type ComfyTargetInput } from './comfyui-http';
import type { ComfyLaunchSpec } from './comfyui-install';
import type { ComfyPhase, ComfyFailureCode, ComfySnapshot, ComfyLogLine, ComfyConnectionTarget, ComfyLaunchDiagnosis } from '../../src/comfyui/contract';

export type ComfyProcessLog = ComfyLogLine;
export function redactComfyLog(value: string): string {
  return value.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, '')
    .replace(/\b(Authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|secret|password)\s*["']?\s*[:=]\s*["']?)[^\s,;"']+/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|hf_[A-Za-z0-9]{10,})\b/g, '[REDACTED]');
}
export class LogRing {
  private rows: ComfyProcessLog[] = [];
  private bytes = 0;
  private pending = new Map<string, string>();
  private seq = 0;
  constructor(private readonly maxLines = 1000, private readonly maxBytes = 256 * 1024) {}
  push(stream: ComfyProcessLog['stream'], chunk: string): void {
    const text = (this.pending.get(stream) || '') + chunk;
    const lines = text.split(/\r\n|\n|\r/); this.pending.set(stream, lines.pop()!.slice(-16384));
    for (const line of lines) this.line(stream, line);
  }
  line(stream: ComfyProcessLog['stream'], text: string): void {
    const row = { seq: ++this.seq, at: new Date().toISOString(), stream, text: redactComfyLog(text).slice(0, 16384) };
    this.rows.push(row); this.bytes += Buffer.byteLength(row.text);
    while (this.rows.length > this.maxLines || this.bytes > this.maxBytes) this.bytes -= Buffer.byteLength(this.rows.shift()!.text);
  }
  flush(): void { for (const [stream, text] of this.pending) { if (text) this.line(stream as ComfyProcessLog['stream'], text); } this.pending.clear(); }
  tail(count = 300): ComfyProcessLog[] { return this.rows.slice(-Math.min(count, 1000)).map(x => ({ ...x })); }
}
const live = (child: ChildProcess | null | undefined): child is ChildProcess & { pid: number } => !!child?.pid && child.exitCode === null && child.signalCode === null;
const taskkillPath = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
function waitExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (!live(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); child.removeListener('exit', onExit); resolve(!live(child)); };
    const onExit = () => done();
    const timer = setTimeout(done, timeoutMs); child.once('exit', onExit);
  });
}
/** Caller must pass its still-held ChildProcess, never a saved PID/port/name. */
export async function killProcessTree(child: ChildProcess, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (!live(child)) return;
  if (platform === 'win32') {
    await new Promise<void>((resolve, reject) => execFile(taskkillPath(), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, timeout: 10_000 }, error => error && live(child) ? reject(error) : resolve()));
    if (!await waitExit(child, 10_000)) throw new Error('COMFY_STOP_TIMEOUT');
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    if (!await waitExit(child, 8000) && live(child)) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
    if (!await waitExit(child, 2000)) throw new Error('COMFY_STOP_TIMEOUT');
  }
}
export function killProcessTreeSync(child: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  if (!live(child)) return;
  if (platform === 'win32') execFileSync(taskkillPath(), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, timeout: 10_000, stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
}
export type SupervisorPhase = ComfyPhase;
export type SupervisorSnapshot = ComfySnapshot;
interface InternalSupervisorState {
  phase: ComfyPhase; owner: 'none' | 'owned' | 'external'; target?: ComfyTarget; identity?: ProbedComfyIdentity;
  startedAt?: string; readyAt?: string; healthy?: boolean; pid?: number;
  failure?: { code: ComfyFailureCode; detail?: string; exitCode?: number | null; signal?: string | null; at?: string; diagnosis?: ComfyLaunchDiagnosis };
}
export interface SupervisorOptions {
  launch?: () => Promise<ComfyLaunchSpec> | ComfyLaunchSpec;
  readyTimeoutMs?: number;
  pollMs?: number;
  healthMs?: number;
  spawn?: typeof spawn;
  probe?: typeof probeComfy;
  bindable?: typeof probeBindable;
  tcp?: typeof probeTcp;
  /** Bounded post-exit kernel/listener drain. Internal override for tests only. */
  portReleaseTimeoutMs?: number;
  kill?: typeof killProcessTree;
  killSync?: typeof killProcessTreeSync;
  beforeStop?: () => Promise<void>;
  ownedChanged?: (marker: { pid: number; mainPath: string; port: number } | null) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  target?: ComfyConnectionTarget;
}
export class ComfySupervisor {
  private state: InternalSupervisorState = { phase: 'idle', owner: 'none' };
  private context: Pick<ComfySnapshot, 'detectedExternal' | 'previousSession' | 'inventory' | 'activeRun'> = { detectedExternal: null, previousSession: null, inventory: null, activeRun: null };
  private child: ChildProcess | null = null;
  private autoMainPath: string | null = null;
  private autoExpectedArgs: readonly string[] | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private abort?: AbortController;
  private healthTimer?: ReturnType<typeof setInterval>;
  private healthBusy = false;
  private healthFailures = 0;
  private stopVersion = 0;
  private events = new EventEmitter();
  private log = new LogRing();
  constructor(private readonly options: SupervisorOptions = {}) {}
  private now() { return (this.options.now || Date.now)(); }
  private stamp() { return new Date(this.now()).toISOString(); }
  snapshot(): ComfySnapshot {
    const s = this.state, f = s.failure;
    return structuredClone({ phase: s.phase, owner: s.owner === 'owned' ? 'app' : s.owner === 'external' ? 'external' : null,
      stage: s.phase === 'probing' ? 'checking-port' : s.phase === 'starting' ? 'waiting-http' : null,
      target: s.target ? { host: s.target.host, port: s.target.port } : this.options.target || { host: '127.0.0.1', port: 8188 }, baseUrl: s.target?.baseUrl || null,
      pid: s.owner === 'owned' ? s.pid ?? null : null, startedAt: s.startedAt || null, readyAt: s.readyAt || null,
      failure: f ? { code: f.code, message: f.detail || f.code, exitCode: f.exitCode ?? null, signal: f.signal || null, logTail: this.log.tail(40).map(l => l.text), at: f.at || this.stamp(), ...(f.diagnosis ? { diagnosis: f.diagnosis } : {}) } : null,
      identity: s.identity || null, health: s.healthy === true ? 'ok' : s.healthy === false ? 'unresponsive' : 'unknown', ...this.context, logs: this.log.tail() });
  }
  setContext(patch: Partial<Pick<ComfySnapshot, 'detectedExternal' | 'previousSession' | 'inventory' | 'activeRun'>>) { this.context = { ...this.context, ...patch }; this.events.emit('state', this.snapshot()); }
  on(callback: (state: SupervisorSnapshot) => void): () => void { this.events.on('state', callback); return () => this.events.removeListener('state', callback); }
  ownedPid(): number | null { return live(this.child) ? this.child.pid : null; }
  private publish(patch: Partial<InternalSupervisorState>) { this.state = { ...this.state, ...patch }; this.events.emit('state', this.snapshot()); }
  private serialize<T>(action: () => Promise<T>): Promise<T> { const next = this.chain.then(action, action); this.chain = next.catch(() => undefined); return next; }
  private failure(code: ComfyFailureCode, detail?: string, extra: Partial<NonNullable<InternalSupervisorState['failure']>> = {}) { this.publish({ phase: 'failed', healthy: false, failure: { code, at: this.stamp(), detail: detail ? redactComfyLog(detail).slice(-8000) : undefined, ...extra } }); }
  private async notifyOwned(marker: { pid: number; mainPath: string; port: number } | null) {
    try { await this.options.ownedChanged?.(marker); }
    catch { this.log.line('app', 'Owned-session marker could not be persisted; ownership remains memory-only.'); }
  }
  private stopHealth() { clearInterval(this.healthTimer); this.healthTimer = undefined; this.healthFailures = 0; }
  private beginHealth() {
    this.stopHealth();
    this.healthTimer = setInterval(() => { void this.checkHealth(); }, this.options.healthMs || 5000); this.healthTimer.unref();
  }
  private async checkHealth() {
    if (this.healthBusy || this.state.phase !== 'ready' || !this.state.target) return;
    this.healthBusy = true;
    const target = this.state.target;
    try {
      // Observe an existing service without taking over a temporarily closed port.
      const probe = await (this.options.probe || probeComfy)(target, { checkBindable: false });
      if (this.state.phase !== 'ready' || this.state.target !== target) return;
      if (probe.kind === 'comfyui' && this.autoMainPath && (!probe.identity || !matchesConfiguredMain(probe.identity, this.autoMainPath, target.port, this.autoExpectedArgs))) {
        this.stopHealth(); this.failure('attribution-mismatch', 'COMFY_AUTO_IDENTITY_CHANGED'); return;
      }
      if (probe.kind === 'comfyui') { this.healthFailures = 0; if (this.state.healthy === false) this.publish({ healthy: true }); }
      else if (++this.healthFailures >= 3) {
        if (this.state.owner === 'external') { this.stopHealth(); this.publish({ phase: 'idle', owner: 'none', identity: undefined, healthy: false }); }
        else this.publish({ healthy: false }); // Never auto-kill an unresponsive owned process.
      }
    } catch { /* bounded next health check; no resubmit or restart */ }
    finally { this.healthBusy = false; }
  }
  start(spec?: ComfyLaunchSpec): Promise<SupervisorSnapshot> {
    const requestedAtVersion = this.stopVersion;
    return this.serialize(async () => {
      if (requestedAtVersion !== this.stopVersion) { if (!live(this.child)) this.publish({ phase: this.state.owner === 'external' ? 'idle' : 'stopped', owner: 'none' }); return this.snapshot(); }
      if (this.state.phase === 'ready') return this.snapshot();
      if (live(this.child)) { this.failure('stop-failed', 'Previous owned child still exists'); return this.snapshot(); }
      this.stopHealth(); this.abort = new AbortController();
      this.publish({ phase: 'probing', owner: 'none', failure: undefined, identity: undefined, pid: undefined, startedAt: this.stamp(), readyAt: undefined, healthy: false });
      let launch: ComfyLaunchSpec;
      try { launch = spec || await this.options.launch?.()!; if (!launch) throw new Error('COMFY_NOT_CONFIGURED'); }
      catch (error) {
        const detail = String(error);
        const diagnosis = error && typeof error === 'object' && 'diagnosis' in error
          && (error.diagnosis as ComfyLaunchDiagnosis)?.kind === 'dependency-mismatch' ? error.diagnosis as ComfyLaunchDiagnosis : undefined;
        const code = diagnosis ? 'install-invalid' : /python/i.test(detail) ? 'python-invalid' : /help/i.test(detail) ? 'help-probe-failed' : /install|main\.py|local.path/i.test(detail) ? 'install-invalid' : 'not-configured';
        this.failure(code, detail, diagnosis ? { diagnosis } : {}); return this.snapshot();
      }
      this.autoMainPath = launch.portMode === 'auto' ? launch.mainPath : null;
      this.autoExpectedArgs = this.autoMainPath ? launch.args : undefined;
      let target: ComfyTarget;
      try { target = resolveLoopbackTarget({ host: '127.0.0.1', port: launch.port }); }
      catch (error) { this.failure('install-invalid', String(error)); return this.snapshot(); }
      this.publish({ target });
      let found: ComfyProbeResult;
      // Before spawn only: verify availability/reservation without a child competing to bind.
      try { found = await (this.options.probe || probeComfy)(target, { signal: this.abort.signal }); }
      catch (error) { this.failure('unreachable', String(error)); return this.snapshot(); }
      if (this.abort.signal.aborted) { this.publish({ phase: 'stopped', owner: 'none' }); return this.snapshot(); }
      if (found.kind === 'comfyui') {
        if (this.autoMainPath && (!found.identity || !matchesConfiguredMain(found.identity, this.autoMainPath, target.port, this.autoExpectedArgs))) {
          this.failure('attribution-mismatch', 'COMFY_AUTO_EXTERNAL_ROOT_UNCONFIRMED'); return this.snapshot();
        }
        this.publish({ phase: 'ready', owner: 'external', identity: found.identity, readyAt: this.stamp(), healthy: true }); this.beginHealth(); return this.snapshot();
      }
      if (found.kind !== 'free') { this.failure(found.kind === 'reserved' ? 'port-reserved' : 'port-foreign', found.detail); return this.snapshot(); }
      let child: ChildProcess;
      this.publish({ phase: 'starting', owner: 'owned' });
      try { child = (this.options.spawn || spawn)(launch.pythonPath, launch.args, { cwd: launch.cwd, windowsHide: true, shell: false,
        stdio: ['ignore', 'pipe', 'pipe'], env: launch.env, detached: process.platform !== 'win32' }); this.child = child; }
      catch (error) { this.failure('spawn-error', String(error)); return this.snapshot(); }
      let spawnError: Error | undefined, exited = false, ownReadyLine = false;
      const exitDiagnosis = (): ComfyLaunchDiagnosis => {
        const text = this.log.tail(40).map(item => item.text).join('\n');
        const mentionedMismatch = launch.dependencyChecks?.some(item => item.status === 'mismatch'
          && new RegExp(item.name.split(/[-_.]+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-_.]'), 'i').test(text));
        return { kind: mentionedMismatch ? 'dependency-mismatch' : 'exit', python: launch.pythonPath,
          ...(launch.dependencyChecks ? { packages: launch.dependencyChecks } : {}) };
      };
      child.stdout?.on('data', (chunk: Buffer) => { this.log.push('stdout', chunk.toString('utf8')); if (/(?:Starting server|To see the GUI go to:|TEST FIXTURE ready)/.test(this.log.tail(5).map(l => l.text).join('\n'))) ownReadyLine = true; this.events.emit('state', this.snapshot()); });
      child.stderr?.on('data', (chunk: Buffer) => { this.log.push('stderr', chunk.toString('utf8')); if (/Starting server|To see the GUI go to:/.test(this.log.tail(5).map(l => l.text).join('\n'))) ownReadyLine = true; this.events.emit('state', this.snapshot()); });
      child.once('error', error => { spawnError = error; });
      child.once('close', () => { this.log.flush(); this.events.emit('state', this.snapshot()); });
      child.once('exit', (code, signal) => {
        exited = true; this.log.flush();
        if (this.child !== child) return;
        this.child = null; void this.notifyOwned(null);
        if (this.state.phase === 'ready' && this.state.owner === 'owned') { this.stopHealth(); this.failure('crashed', this.log.tail(40).map(x => x.text).join('\n'), { exitCode: code, signal, diagnosis: exitDiagnosis() }); }
      });
      if (child.pid) { this.publish({ pid: child.pid }); await this.notifyOwned({ pid: child.pid, mainPath: launch.mainPath, port: launch.port }); }
      const deadline = this.now() + (this.options.readyTimeoutMs ?? launch.readyTimeoutMs ?? 300_000);
      while (this.now() < deadline && !this.abort.signal.aborted) {
        if (spawnError || exited || !live(child)) { this.failure(spawnError ? 'spawn-error' : 'exited-early', spawnError?.message || this.log.tail(40).map(x => x.text).join('\n'), { exitCode: child.exitCode, signal: child.signalCode, diagnosis: exitDiagnosis() }); return this.snapshot(); }
        // The launched child may bind at any moment; readiness must never listen itself.
        const observed = await (this.options.probe || probeComfy)(target, { timeoutMs: 1000, signal: this.abort.signal, checkBindable: false }).catch(() => undefined);
        if (this.abort.signal.aborted) break;
        if (observed?.kind === 'comfyui' && observed.identity && live(child)) {
          if (!(this.autoMainPath ? matchesConfiguredMain(observed.identity, this.autoMainPath, target.port, this.autoExpectedArgs) : matchesOwnedLaunch(observed.identity, launch, ownReadyLine))) { await this.cleanupOwned().catch(() => undefined); this.failure('attribution-mismatch'); return this.snapshot(); }
          this.publish({ phase: 'ready', owner: 'owned', identity: observed.identity, readyAt: this.stamp(), healthy: true }); this.beginHealth(); return this.snapshot();
        }
        await (this.options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))))(this.options.pollMs ?? 250);
      }
      await this.cleanupOwned().catch(error => this.log.line('app', String(error)));
      if (this.abort.signal.aborted) this.publish({ phase: live(this.child) ? 'failed' : 'stopped', owner: live(this.child) ? 'owned' : 'none' });
      else this.failure('ready-timeout', this.log.tail(40).map(x => x.text).join('\n'), { diagnosis: { kind: 'timeout', python: launch.pythonPath,
        ...(launch.dependencyChecks ? { packages: launch.dependencyChecks } : {}) } });
      return this.snapshot();
    });
  }
  connect(input: ComfyTargetInput): Promise<SupervisorSnapshot> {
    return this.serialize(async () => {
      if (live(this.child)) return this.snapshot();
      this.stopHealth(); this.autoMainPath = null; this.autoExpectedArgs = undefined; const target = resolveLoopbackTarget(input);
      this.publish({ phase: 'probing', owner: 'none', target, failure: undefined, identity: undefined, startedAt: this.stamp(), healthy: false });
      // Connecting discovers an external identity; it does not reserve or own that port.
      const found = await (this.options.probe || probeComfy)(target, { checkBindable: false });
      if (found.kind === 'comfyui') { this.publish({ phase: 'ready', owner: 'external', identity: found.identity, readyAt: this.stamp(), healthy: true }); this.beginHealth(); }
      else this.failure(found.kind === 'free' || found.kind === 'unreachable' ? 'unreachable' : 'not-comfyui', found.detail);
      return this.snapshot();
    });
  }
  private async cleanupOwned() {
    const child = this.child;
    if (live(child)) await (this.options.kill || killProcessTree)(child);
    if (child && live(child)) throw new Error('COMFY_STOP_FAILED');
    if (this.child === child) this.child = null;
    await this.notifyOwned(null);
  }
  private async waitPortReleased(target: ComfyTarget): Promise<void> {
    const configured = this.options.portReleaseTimeoutMs;
    const timeout = configured !== undefined && Number.isFinite(configured) ? Math.max(0, Math.min(5000, configured)) : 5000;
    const began = this.now(), deadline = began + timeout;
    for (let attempt = 1; ; attempt++) {
      let bindable = false, code: string | null = null, timeWaitOnly = false, tcp: boolean | null = null;
      try { const observed = await (this.options.bindable || probeBindable)(target); bindable = observed.bindable; code = observed.code || null; timeWaitOnly = observed.timeWaitOnly === true; }
      catch (error) { code = `PROBE_ERROR: ${String(error)}`.slice(0, 500); }
      try { tcp = await (this.options.tcp || probeTcp)(target, 150); }
      catch { /* Unknown is not evidence of a released listener. */ }
      const observed = { attempt, elapsedMs: Math.max(0, this.now() - began), port: target.port, bindable, code, timeWaitOnly, tcp };
      this.log.line('app', `Port release probe: ${JSON.stringify(observed)}`);
      // Child exit precedes this check, but Windows may drain its handles and
      // redirector/listener for a short interval. Never force bind or kill a
      // new owner: a competing listener remains a bounded diagnostic failure.
      if (tcp === false && (bindable || timeWaitOnly)) return;
      if (this.now() >= deadline || attempt >= 51) throw new Error(`COMFY_PORT_NOT_RELEASED: ${JSON.stringify(observed)}`);
      await (this.options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))))(Math.min(100, Math.max(1, deadline - this.now())));
    }
  }
  stop(): Promise<SupervisorSnapshot> {
    this.stopVersion++;
    this.abort?.abort();
    return this.serialize(async () => {
      this.stopHealth();
      if (this.state.owner !== 'owned' && !live(this.child)) { this.publish({ phase: this.state.phase === 'stopped' ? 'stopped' : 'idle', owner: 'none', identity: undefined, pid: undefined }); return this.snapshot(); }
      this.publish({ phase: 'stopping' });
      try {
        if (this.options.beforeStop) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try { await Promise.race([this.options.beforeStop(), new Promise(resolve => { timer = setTimeout(resolve, 5000); })]); }
          catch (error) { this.log.line('app', `Job cancellation did not finish before process cleanup: ${String(error)}`); }
          finally { clearTimeout(timer); }
        }
        await this.cleanupOwned();
        if (this.state.target) await this.waitPortReleased(this.state.target);
        this.publish({ phase: 'stopped', owner: 'none', pid: undefined, identity: undefined, healthy: false });
      } catch (error) { this.failure('stop-failed', String(error)); }
      return this.snapshot();
    });
  }
  disconnect(): Promise<SupervisorSnapshot> { if (live(this.child)) return Promise.resolve(this.snapshot()); return this.stop(); }
  killOwnedSync(): void { this.stopHealth(); const child = this.child; if (live(child)) (this.options.killSync || killProcessTreeSync)(child); }
}
