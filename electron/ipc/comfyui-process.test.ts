import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { ComfySupervisor, LogRing, killProcessTree, redactComfyLog } from './comfyui-process';
import { probeComfy } from './comfyui-probe';
import type { ComfyLaunchSpec } from './comfyui-install';

const supervisors: ComfySupervisor[] = [], children: ChildProcess[] = [], dirs: string[] = [];
const traces = new Map<ComfySupervisor, unknown[]>();
const launchEvidence: unknown[] = [], detailEvidence: unknown[] = [];
const pythonCheck = spawnSync(process.env.COMFY_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import sys;print(sys.executable)'], { windowsHide: true, shell: false, encoding: 'utf8', timeout: 5000 });
const testPython = pythonCheck.status === 0 ? pythonCheck.stdout.trim() : null;
if (!testPython) console.warn('ComfyUI lifecycle real-process tests skipped: Python missing; set COMFY_TEST_PYTHON.');
const processTest = it.skipIf(!testPython);
afterEach(async context => {
  const beforeCleanup = supervisors.map(s => s.snapshot());
  if (context.task.result?.state === 'fail') console.error('COMFY_PROCESS_TEST_FAILURE', JSON.stringify({ test: context.task.name, beforeCleanup, details: detailEvidence }));
  for (const s of supervisors.splice(0)) await s.stop();
  for (const c of children.splice(0)) await killProcessTree(c);
  const evidenceRoot = process.env.COMFY_LIFECYCLE_EVIDENCE_DIR;
  if (evidenceRoot) {
    const output = path.join(evidenceRoot, `${Date.now()}-${context.task.name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100)}`); fs.mkdirSync(output, { recursive: true });
    const ledgers: Record<string, string> = {};
    for (const directory of dirs) { const ledger = path.join(directory, 'ledger.jsonl'); if (fs.existsSync(ledger)) ledgers[directory] = fs.readFileSync(ledger, 'utf8'); }
    fs.writeFileSync(path.join(output, 'TRACE.json'), JSON.stringify({ test: context.task.name, launches: launchEvidence, details: detailEvidence, timelines: [...traces.values()], beforeCleanup, ledgers }, null, 2));
  }
  traces.clear(); launchEvidence.length = 0; detailEvidence.length = 0;
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
async function port() { const s = net.createServer(); await new Promise<void>(r => s.listen(0, '127.0.0.1', r)); const p = (s.address() as net.AddressInfo).port; await new Promise(r => s.close(r)); return p; }
async function until(fn: () => boolean | Promise<boolean>, timeout = 5000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 20)); } throw Error('test timeout: ' + JSON.stringify({ launches: launchEvidence, details: detailEvidence, supervisors: supervisors.map(s => s.snapshot()) })); }
async function fixture(mode = 'ok', delay = 0): Promise<ComfyLaunchSpec> {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'comfy-supervisor-test-'))); dirs.push(directory);
  const mainPath = fs.realpathSync(path.resolve('tests/fixtures/comfyui-protocol/main.py')), p = await port();
  launchEvidence.push({ fixtureOnly: true, directory, python: testPython, mainPath, port: p, mode, startupDelay: delay, argv: [mainPath, '--disable-auto-launch', '--listen', '127.0.0.1', '--port', String(p)] });
  return { directory, root: path.dirname(mainPath), mainPy: mainPath, python: testPython!, pythonVersion: null, supportedFlags: [], helpProbe: 'not-run', helpProbeMessage: null, checkedAt: new Date().toISOString(),
    mainPath, pythonPath: testPython!, cwd: path.dirname(mainPath), layout: 'custom', pythonArgs: [], port: p,
    args: [mainPath, '--disable-auto-launch', '--listen', '127.0.0.1', '--port', String(p)],
    env: { ...process.env, COMFY_FIXTURE_MODE: mode, COMFY_FIXTURE_STARTUP_DELAY: String(delay), COMFY_FIXTURE_LEDGER: path.join(directory, 'ledger.jsonl') } };
}
function supervisor(options: ConstructorParameters<typeof ComfySupervisor>[0] = {}) { const s = new ComfySupervisor({ pollMs: 25, healthMs: 60_000, readyTimeoutMs: 5000, ...options }); supervisors.push(s); const trace: unknown[] = [s.snapshot()]; traces.set(s, trace); s.on(snapshot => trace.push(snapshot)); return s; }

it('log ring redacts split secrets and terminal colors, preserves loopback and bounds lines/bytes', () => {
  const ring = new LogRing(3, 100); ring.push('stdout', '\x1b[31mAuthorization: Bearer sk-pri'); ring.push('stdout', 'vatekey123\x1b[0m\n');
  expect(ring.tail()[0].text).toBe('Authorization: [REDACTED]'); expect(redactComfyLog('url=http://127.0.0.1:8188 token=abc')).toBe('url=http://127.0.0.1:8188 token=[REDACTED]');
  for (let i = 0; i < 100; i++) ring.line('stderr', 'x'.repeat(10)); expect(ring.tail()).toHaveLength(3);
});
processTest('real delayed process stays starting, duplicate starts create only one PID, stop releases own port', async () => {
  const spec = await fixture('delay', .35), s = supervisor(); const phases: string[] = []; s.on(x => phases.push(x.phase));
  const a = s.start(spec), b = s.start(spec);
  await until(() => s.snapshot().phase === 'starting'); expect(s.snapshot().phase).toBe('starting');
  const ready = await a; expect(ready.phase, JSON.stringify(ready)).toBe('ready'); expect((await b).pid).toBe(s.ownedPid());
  const ledger = fs.readFileSync(spec.env.COMFY_FIXTURE_LEDGER!, 'utf8').trim().split('\n').map(x => JSON.parse(x));
  expect(ledger.filter(x => x.event === 'startup')).toHaveLength(1); expect(ledger[0].argv).toContain('--disable-auto-launch');
  expect(phases).toContain('probing'); expect(phases).toContain('starting');
  expect((await s.stop()).phase).toBe('stopped'); expect(s.ownedPid()).toBeNull(); expect((await probeComfy({ port: spec.port })).kind).toBe('free');
}, 20_000);
processTest('owned readiness and health only observe TCP/HTTP, while preflight and after-stop retain real bind checks', async () => {
  const spec = await fixture('delay', .25);
  let spawned = false;
  const probeCalls: Array<{ spawned: boolean; checkBindable: boolean | undefined }> = [];
  const binds: boolean[] = [];
  const createServer = net.createServer;
  const make = vi.spyOn(net, 'createServer').mockImplementation((...args: Parameters<typeof net.createServer>) => {
    binds.push(spawned); return createServer(...args);
  });
  const s = supervisor({
    spawn: ((...args: Parameters<typeof spawn>) => { const child = spawn(...args); spawned = true; return child; }) as typeof spawn,
    probe: async (target, options) => { probeCalls.push({ spawned, checkBindable: options?.checkBindable }); return probeComfy(target, options); },
  });
  try {
    const ready = await s.start(spec); expect(ready.phase, JSON.stringify(ready)).toBe('ready');
    expect(binds).toEqual([false]);
    expect(probeCalls[0]).toEqual({ spawned: false, checkBindable: undefined });
    expect(probeCalls.filter(call => call.spawned).length).toBeGreaterThan(0);
    expect(probeCalls.filter(call => call.spawned).every(call => call.checkBindable === false)).toBe(true);
    await (s as unknown as { checkHealth(): Promise<void> }).checkHealth();
    expect(probeCalls.at(-1)?.checkBindable).toBe(false); expect(binds).toEqual([false]);
    expect((await s.stop()).phase).toBe('stopped'); expect(binds.some(afterSpawn => afterSpawn)).toBe(true);
    detailEvidence.push({ observationOnlyReadiness: true, probeCalls, binds, realProcessPid: ready.pid });
  } finally { make.mockRestore(); }
}, 20_000);
it('connect-existing observes a closed endpoint without ever binding it', async () => {
  const target = { host: '127.0.0.1' as const, port: await port() };
  const make = vi.spyOn(net, 'createServer');
  try {
    const s = supervisor(), result = await s.connect(target);
    expect(result.failure?.code).toBe('unreachable'); expect(result.failure?.diagnosis).toBeUndefined(); expect(make).not.toHaveBeenCalled(); expect(s.ownedPid()).toBeNull();
  } finally { make.mockRestore(); }
});
processTest('real startup failure retains literal stderr and never claims ready; readiness timeout kills own child', async () => {
  const bad = supervisor(); const result = await bad.start(await fixture('startup-error'));
  expect(result.phase).toBe('failed'); expect(result.failure?.code).toBe('exited-early'); expect(result.failure?.diagnosis).toMatchObject({ kind: 'exit', python: testPython });
  expect(result.failure?.exitCode).not.toBeNull(); expect(result.failure?.logTail.join('\n')).toContain('controlled startup failure'); expect(result.logs.map(x => x.text).join('\n')).toContain('controlled startup failure'); expect(bad.ownedPid()).toBeNull();
  const spec = await fixture('delay', 20), timed = supervisor({ readyTimeoutMs: 200 });
  const timedResult = await timed.start(spec); expect(timedResult.failure?.code).toBe('ready-timeout'); expect(timedResult.failure?.diagnosis?.kind).toBe('timeout'); expect(timed.ownedPid()).toBeNull(); expect((await probeComfy({ port: spec.port })).kind).toBe('free');
}, 20_000);
it('an explicitly raised dependency diagnostic preserves its structure without manufacturing a process exit', async () => {
  const diagnosis = { kind: 'dependency-mismatch' as const, python: 'explicit-test-python', packages: [{ name: 'example', required: '==2.0', installed: '1.0', status: 'mismatch' as const }] };
  const start = vi.fn(), probe = vi.fn();
  const s = supervisor({ launch: () => { throw Object.assign(new Error('COMFY_DEPENDENCY_MISMATCH: example 1.0 / ==2.0 token=fixture-secret'), { diagnosis }); }, spawn: start as never, probe });
  const snapshot = await s.start(); expect(snapshot.phase).toBe('failed'); expect(snapshot.failure).toMatchObject({ code: 'install-invalid', exitCode: null, diagnosis });
  expect(snapshot.failure!.message).not.toContain('fixture-secret'); expect(start).not.toHaveBeenCalled(); expect(probe).not.toHaveBeenCalled();
});
processTest('a real nonzero fixture exit correlates mentioned version mismatches but does not blame unrelated metadata', async () => {
  for (const name of ['controlled', 'unrelated-package']) {
    const spec = await fixture('startup-error'); spec.dependencyChecks = [{ name, required: '==2.0', installed: '1.0', status: 'mismatch' }];
    const result = await supervisor().start(spec);
    expect(result.failure?.exitCode).toBe(23); expect(result.failure?.logTail.join('\n')).toContain('controlled startup failure');
    expect(result.failure?.diagnosis?.kind).toBe(name === 'controlled' ? 'dependency-mismatch' : 'exit');
  }
}, 20_000);
it('owned child stop accepts proven TIME_WAIT-only only after its held child exits, not a fictitious bind success', async () => {
  const spec = await fixture(); let probes = 0;
  const held = Object.assign(new EventEmitter(), { pid: 999999999, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null, stdout: new EventEmitter(), stderr: new EventEmitter() }) as unknown as ChildProcess;
  const kill = vi.fn(async (child: ChildProcess) => { expect(child).toBe(held); Object.assign(held, { exitCode: 1 }); held.emit('exit', 1, null); held.emit('close', 1, null); });
  const s = supervisor({ spawn: vi.fn(() => held) as unknown as typeof spawn, kill,
    probe: async () => ++probes === 1 ? { kind: 'free', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` } }
      : { kind: 'comfyui', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` }, identity: { comfyuiVersion: null, pythonVersion: null, pytorchVersion: null, embeddedPython: null, os: null, devices: [], isProtocolFixture: true, argv: spec.args } },
    bindable: async () => { expect(held.exitCode).toBe(1); return { bindable: false, code: 'EADDRINUSE', timeWaitOnly: true }; } });
  expect((await s.start(spec)).phase).toBe('ready'); const pid = s.ownedPid()!;
  const stopped = await s.stop(); expect(stopped.phase).toBe('stopped'); expect(s.ownedPid()).toBeNull();
  expect(kill).toHaveBeenCalledOnce(); expect(held.exitCode).toBe(1); detailEvidence.push({ pid, syntheticChildNoOsProcess: true, heldChildDead: true, bindable: false, timeWaitOnly: true, stoppedPhase: stopped.phase });
}, 20_000);
it('post-exit port release polls transient EACCES/EADDRINUSE and records every raw observation before stopped', async () => {
  const spec = await fixture(); let probes = 0, releases = 0;
  const held = Object.assign(new EventEmitter(), { pid: 999999998, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null, stdout: new EventEmitter(), stderr: new EventEmitter() }) as unknown as ChildProcess;
  const kill = vi.fn(async () => { Object.assign(held, { exitCode: 1 }); held.emit('exit', 1, null); held.emit('close', 1, null); });
  const s = supervisor({ spawn: vi.fn(() => held) as unknown as typeof spawn, kill, portReleaseTimeoutMs: 1000,
    probe: async () => ++probes === 1 ? { kind: 'free', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` } }
      : { kind: 'comfyui', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` }, identity: { comfyuiVersion: null, pythonVersion: null, pytorchVersion: null, embeddedPython: null, os: null, devices: [], isProtocolFixture: true, argv: spec.args } },
    tcp: async () => false,
    bindable: async () => { expect(held.exitCode).toBe(1); releases++; return releases === 1 ? { bindable: false, code: 'EACCES' } : releases === 2 ? { bindable: false, code: 'EADDRINUSE' } : { bindable: true }; } });
  expect((await s.start(spec)).phase).toBe('ready'); const stopped = await s.stop(); expect(stopped.phase).toBe('stopped'); expect(releases).toBe(3); expect(kill).toHaveBeenCalledOnce();
  const observations = stopped.logs.filter(line => line.text.startsWith('Port release probe:')).map(line => JSON.parse(line.text.slice('Port release probe: '.length)));
  expect(observations.map(item => item.code)).toEqual(['EACCES', 'EADDRINUSE', null]); expect(observations.every(item => item.tcp === false)).toBe(true); expect(observations[2].elapsedMs).toBeGreaterThanOrEqual(150);
  detailEvidence.push({ syntheticChildNoOsProcess: true, observations, stoppedPhase: stopped.phase, killCalls: kill.mock.calls.length });
});
it('foreign listener taking the released child port is never killed and timeout retains raw bind code and TCP state', async () => {
  const spec = await fixture(), server = net.createServer(socket => socket.end()); let probes = 0;
  const held = Object.assign(new EventEmitter(), { pid: 999999997, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null, stdout: new EventEmitter(), stderr: new EventEmitter() }) as unknown as ChildProcess;
  const kill = vi.fn(async (child: ChildProcess) => { expect(child).toBe(held); Object.assign(held, { exitCode: 1 }); held.emit('exit', 1, null); held.emit('close', 1, null); });
  const s = supervisor({ spawn: vi.fn(() => held) as unknown as typeof spawn, kill, portReleaseTimeoutMs: 250,
    probe: async () => ++probes === 1 ? { kind: 'free', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` } }
      : { kind: 'comfyui', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` }, identity: { comfyuiVersion: null, pythonVersion: null, pytorchVersion: null, embeddedPython: null, os: null, devices: [], isProtocolFixture: true, argv: spec.args } } });
  try {
    expect((await s.start(spec)).phase).toBe('ready'); await new Promise<void>(resolve => server.listen(spec.port, '127.0.0.1', resolve));
    const failed = await s.stop(); expect(failed.phase).toBe('failed'); expect(failed.failure?.code).toBe('stop-failed');
    expect(failed.failure?.message).toContain('COMFY_PORT_NOT_RELEASED'); expect(failed.failure?.message).toMatch(/EADDRINUSE|EACCES/); expect(failed.failure?.message).toContain('"tcp":true');
    expect(server.listening).toBe(true); expect(kill).toHaveBeenCalledOnce(); expect(s.ownedPid()).toBeNull();
    detailEvidence.push({ syntheticChildNoOsProcess: true, externalListenerAliveAfterFailure: server.listening, failure: failed.failure, killCalls: kill.mock.calls.length });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
processTest('external real instance disconnect never kills it, and foreign HTTP server remains untouched', async () => {
  const spec = await fixture(); const child = spawn(spec.pythonPath, spec.args, { cwd: spec.cwd, env: spec.env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' }); children.push(child);
  const output = { pid: child.pid, python: spec.pythonPath, argv: spec.args, stdout: '', stderr: '', exitCode: null as number | null, signal: null as string | null }; detailEvidence.push(output);
  child.stdout?.on('data', b => { output.stdout = (output.stdout + String(b)).slice(-16384); }); child.stderr?.on('data', b => { output.stderr = (output.stderr + String(b)).slice(-16384); });
  child.once('error', error => { output.stderr += `spawn error: ${error.message}\n`; }); child.once('close', (code, signal) => { output.exitCode = code; output.signal = signal; });
  await until(async () => (await probeComfy({ port: spec.port }, { checkBindable: false })).kind === 'comfyui');
  const external = supervisor(); expect((await external.start(spec)).owner).toBe('external'); expect(external.ownedPid()).toBeNull(); expect((await external.disconnect()).phase).toBe('idle'); expect(child.exitCode).toBeNull(); expect((await probeComfy({ port: spec.port })).kind).toBe('comfyui');
  detailEvidence.push({ externalPid: child.pid, aliveAfterDisconnect: child.exitCode === null });
  const server = http.createServer((_req, res) => res.end('{"foreign":true}')); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try { const foreign = supervisor(); const r = await foreign.start({ ...spec, port: (server.address() as net.AddressInfo).port }); expect(r.failure?.code).toBe('port-foreign'); expect(server.listening).toBe(true); expect(foreign.ownedPid()).toBeNull(); }
  finally { await new Promise(r => server.close(r)); }
}, 20_000);
processTest('race attribution mismatch kills only launched child, not the independent server that took the port', async () => {
  const spec = await fixture('delay', 20); const other = http.createServer((_req, res) => res.end(JSON.stringify({ system: { argv: ['C:/other/main.py', '--port', String(spec.port), '--disable-auto-launch'] }, devices: [] })));
  let first = true;
  const s = supervisor({ probe: async target => { if (first) { first = false; await new Promise<void>(r => other.listen(spec.port, '127.0.0.1', r)); return { kind: 'free', target: { host: '127.0.0.1', port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}` } }; } return probeComfy(target); } });
  try { expect((await s.start(spec)).failure?.code).toBe('attribution-mismatch'); expect(s.ownedPid()).toBeNull(); expect(other.listening).toBe(true); }
  finally { other.closeAllConnections(); await new Promise(r => other.close(r)); }
}, 20_000);
processTest('immediate stop cancels a queued start before spawn; stop during delayed readiness aborts and cleans', async () => {
  const spec = await fixture('delay', 30), immediate = supervisor();
  const first = immediate.start(spec), stopped = immediate.stop();
  await first; await stopped; expect(immediate.ownedPid()).toBeNull(); expect(fs.existsSync(spec.env.COMFY_FIXTURE_LEDGER!)).toBe(false);
  const s = supervisor(), promise = s.start(spec); await until(() => s.ownedPid() !== null); const stop = s.stop();
  await promise; expect((await stop).phase).toBe('stopped'); expect(s.ownedPid()).toBeNull();
}, 20_000);
processTest('real owned process tree cleanup kills its spawned grandchild without using port/name lookups', async () => {
  const spec = await fixture(), root = spec.directory, grand = path.join(root, 'grandchild.pid');
  spec.mainPath = path.join(root, 'main.py'); spec.cwd = root;
  fs.writeFileSync(spec.mainPath, `import sys,json,subprocess,time\nfrom http.server import HTTPServer,BaseHTTPRequestHandler\np=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))\nopen(${JSON.stringify(grand)},'w').write(str(p.pid))\nclass H(BaseHTTPRequestHandler):\n def do_GET(self):\n  b=json.dumps({'system':{'argv':sys.argv},'devices':[]}).encode();self.send_response(200);self.end_headers();self.wfile.write(b)\n def log_message(self,*a):pass\nHTTPServer(('127.0.0.1',int(sys.argv[sys.argv.index('--port')+1])),H).serve_forever()\n`);
  spec.args = [spec.mainPath, '--disable-auto-launch', '--listen', '127.0.0.1', '--port', String(spec.port)];
  const s = supervisor(), ready = await s.start(spec); expect(ready.phase, JSON.stringify(ready)).toBe('ready');
  const grandPid = Number(fs.readFileSync(grand, 'utf8')); expect(() => process.kill(grandPid, 0)).not.toThrow();
  detailEvidence.push({ grandPid, aliveBeforeStop: true });
  expect((await s.stop()).phase).toBe('stopped');
  await until(() => { try { process.kill(grandPid, 0); return false; } catch { return true; } });
  detailEvidence.push({ grandPid, aliveAfterStop: false });
}, 20_000);
