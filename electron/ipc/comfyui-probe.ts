import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { comfyGetJson, resolveLoopbackTarget, type ComfyTargetInput, type ComfyTarget } from './comfyui-http';
import type { ComfyIdentity } from '../../src/comfyui/contract';
import { EXTRA_PATH_FLAGS } from '../../src/comfyui/launch-args';

export type ProbedComfyIdentity = ComfyIdentity;
export type ComfyProbeResult = { kind: 'free' | 'comfyui' | 'foreign' | 'reserved' | 'unreachable'; target: ComfyTarget; identity?: ProbedComfyIdentity; detail?: string };
export async function probeTcp(input: ComfyTargetInput, timeoutMs = 500): Promise<boolean> {
  const target = resolveLoopbackTarget(input);
  return new Promise(resolve => {
    const socket = net.connect({ host: target.host, port: target.port }); let done = false;
    const finish = (connected: boolean) => { if (done) return; done = true; socket.destroy(); resolve(connected); };
    socket.setTimeout(timeoutMs, () => finish(false)); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
  });
}
/** A closed TCP endpoint can remain TIME_WAIT on Windows without a listener.
 * -q is essential: a bound, non-listening socket is NOT a released endpoint.
 * Unknown/localized/malformed rows fail closed; a live owner is never ignored.
 */
export function windowsPortTimeWaitOnly(text: string, port: number): boolean {
  if (typeof text !== 'string' || text.length > 4 * 1024 ** 2 || !Number.isInteger(port)) return false;
  let matching = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*TCP\s/i.test(line)) continue;
    const row = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+([A-Z_0-9]+)\s+(\d+)\s*$/i.exec(line);
    if (!row) return false;
    if (Number(row[1]) !== port) continue;
    matching++;
    if (row[2].toUpperCase() !== 'TIME_WAIT' || Number(row[3]) !== 0) return false;
  }
  return matching > 0;
}
export async function readWindowsTcpTable(): Promise<string> {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'netstat.exe');
  return new Promise((resolve, reject) => execFile(executable, ['-a', '-n', '-o', '-q', '-p', 'tcp'],
    { windowsHide: true, shell: false, timeout: 2000, maxBuffer: 4 * 1024 ** 2, encoding: 'utf8' },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
}
export interface ComfyBindProbe { bindable: boolean; code?: string; timeWaitOnly?: boolean }
export async function probeBindable(input: ComfyTargetInput): Promise<ComfyBindProbe> {
  const target = resolveLoopbackTarget(input);
  const result: ComfyBindProbe = await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', (error: NodeJS.ErrnoException) => resolve({ bindable: false, code: error.code }));
    server.listen({ host: target.host, port: target.port, exclusive: true }, () => server.close(() => resolve({ bindable: true })));
  });
  // Never waive access-denied/excluded/reserved ports. This is an observation of
  // kernel TIME_WAIT only, not a bind success and not permission to steal a port.
  if (!result.bindable && result.code === 'EADDRINUSE' && process.platform === 'win32') {
    try {
      const table = await readWindowsTcpTable();
      if (windowsPortTimeWaitOnly(table, target.port) && !await probeTcp(target, 150)) return { ...result, timeWaitOnly: true };
    } catch { /* no trusted table observation: preserve the actual bind failure */ }
  }
  return result;
}
export function parseSystemStats(raw: unknown): ProbedComfyIdentity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>, system = data.system;
  if (!system || typeof system !== 'object' || Array.isArray(system) || !Array.isArray(data.devices)) return null;
  const s = system as Record<string, unknown>;
  const text = (x: unknown) => typeof x === 'string' ? x.slice(0, 2000) : null;
  const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : null;
  return { comfyuiVersion: text(s.comfyui_version), pythonVersion: text(s.python_version), pytorchVersion: text(s.pytorch_version),
    argv: Array.isArray(s.argv) && s.argv.length <= 256 && s.argv.every(x => typeof x === 'string' && x.length <= 8192) ? s.argv as string[] : null,
    embeddedPython: typeof s.embedded_python === 'boolean' ? s.embedded_python : null, os: text(s.os),
    devices: data.devices.slice(0, 32).filter(x => x && typeof x === 'object').map(x => ({ name: text(x.name) || 'unknown', type: text(x.type) || 'unknown', vramTotal: number(x.vram_total), vramFree: number(x.vram_free) })), isProtocolFixture: s.fixture === true };
}
/** Set checkBindable:false for identity/readiness observation; default true is a preflight availability check. */
export async function probeComfy(input: ComfyTargetInput, options: { timeoutMs?: number; signal?: AbortSignal; checkBindable?: boolean } = {}): Promise<ComfyProbeResult> {
  const target = resolveLoopbackTarget(input);
  options.signal?.throwIfAborted();
  if (!await probeTcp(target, Math.min(options.timeoutMs || 500, 1000))) {
    // A launch/readiness observer must never briefly become the port's owner:
    // the child may bind between our failed connect and this next operation.
    // Only explicit preflight/release checks need to measure bind permission.
    if (options.checkBindable === false) return { kind: 'unreachable', target, detail: 'TCP_NOT_LISTENING' };
    const bind = await probeBindable(target);
    return { kind: bind.bindable || bind.timeWaitOnly ? 'free' : bind.code === 'EACCES' || bind.code === 'EPERM' ? 'reserved' : 'unreachable', target, detail: bind.timeWaitOnly ? 'TIME_WAIT_ONLY: no listener or bound/live owner' : bind.code };
  }
  try { const identity = parseSystemStats(await comfyGetJson(target, '/system_stats', { timeoutMs: options.timeoutMs || 3000, signal: options.signal }));
    return { kind: identity ? 'comfyui' : 'foreign', target, identity: identity || undefined };
  } catch (error) { return { kind: 'foreign', target, detail: error instanceof Error ? error.message : String(error) }; }
}

/** Attribution is session-only: never takes a persisted PID or guesses by port. */
export function matchesOwnedLaunch(identity: ProbedComfyIdentity, launch: { mainPath: string; port: number; cwd: string }, ownReadyLine = false): boolean {
  if (!identity.argv) return ownReadyLine;
  const argv = identity.argv;
  const equal = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  const scripts = argv.filter(a => /(?:^|[\\/])main\.py$/i.test(a) || a === 'main.py');
  if (!scripts.some(p => equal(path.resolve(launch.cwd, p), path.resolve(launch.mainPath)))) return false;
  if (!argv.includes('--disable-auto-launch') || argv.includes('--auto-launch')) return false;
  const i = argv.indexOf('--port'), port = i >= 0 ? argv[i + 1] : argv.find(x => x.startsWith('--port='))?.slice(7);
  return port === String(launch.port);
}

/** Auto attachment is stricter than explicit connect: a relative script has an
 * unknown external cwd and must never be resolved against our selected project. */
export function matchesConfiguredMain(identity: ProbedComfyIdentity, mainPath: string, port?: number, expectedArgs?: readonly string[]): boolean {
  if (identity.isProtocolFixture || !identity.argv) return false;
  const scripts = identity.argv.filter(value => /(?:^|[\\/])main\.py$/i.test(value) || value === 'main.py');
  if (scripts.length !== 1 || !path.isAbsolute(scripts[0]) || /^(?:\\\\|\/\/|\\\?\?\\)/.test(scripts[0]) || /[\0\r\n]/.test(scripts[0])) return false;
  try {
    const key = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    if (key(fs.realpathSync(scripts[0])) !== key(fs.realpathSync(mainPath))) return false;
  } catch { return false; }
  if (port !== undefined) {
    const values: string[] = [];
    for (let i = 0; i < identity.argv.length; i++) {
      if (identity.argv[i] === '--port') values.push(identity.argv[++i] || '');
      else if (identity.argv[i].startsWith('--port=')) values.push(identity.argv[i].slice(7));
    }
    if (values.length > 1 || values.length === 1 && values[0] !== String(port)) return false;
  }
  if (expectedArgs) {
    for (const flag of ['--disable-all-custom-nodes', '--disable-api-nodes']) {
      const expected = expectedArgs.filter(value => value === flag || value.startsWith(flag + '=')).length;
      const actual = identity.argv.filter(value => value === flag || value.startsWith(flag + '=')).length;
      if (expected > 1 || actual > 1 || expected !== actual
        || expectedArgs.some(value => value.startsWith(flag + '=')) || identity.argv.some(value => value.startsWith(flag + '='))) return false;
    }
    const paths = (args: readonly string[]) => {
      const result = new Map<string, string>();
      for (let i = 0; i < args.length; i++) {
        const token = args[i], at = token.indexOf('='), flag = at < 0 ? token : token.slice(0, at);
        if (!Object.hasOwn(EXTRA_PATH_FLAGS, flag)) continue;
        const value = at < 0 ? args[++i] : token.slice(at + 1);
        if (result.has(flag) || !value || !path.isAbsolute(value) || /^(?:\\\\|\/\/|\\\?\?\\)/.test(value) || /[\0\r\n]/.test(value)) return null;
        try { const real = fs.realpathSync(value); result.set(flag, process.platform === 'win32' ? real.toLowerCase() : real); }
        catch { return null; }
      }
      return result;
    };
    const expected = paths(expectedArgs), actual = paths(identity.argv);
    if (!expected || !actual || expected.size !== actual.size || [...expected].some(([name, value]) => actual.get(name) !== value)) return false;
  }
  return true;
}
