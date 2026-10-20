import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { matchesOwnedLaunch, parseSystemStats, probeBindable, probeComfy, readWindowsTcpTable, windowsPortTimeWaitOnly } from './comfyui-probe';

it('system_stats requires system object + devices array, keeps measured metadata, not arbitrary content', () => {
  expect(parseSystemStats({ ok: true })).toBeNull(); expect(parseSystemStats({ system: [], devices: [] })).toBeNull();
  expect(parseSystemStats({ system: { comfyui_version: '0.42.1', argv: ['main.py'] }, devices: [{ name: 'fixture', vram_total: 42 }] })).toMatchObject({ comfyuiVersion: '0.42.1', devices: [{ name: 'fixture', vramTotal: 42 }] });
});
it('matches only the actual script, explicit port and no-browser flags, never a saved PID', () => {
  const launch = { mainPath: 'C:/installed/ComfyUI/main.py', cwd: 'C:/installed/ComfyUI', port: 8188 };
  const argv = [launch.mainPath, '--port', '8188', '--disable-auto-launch'];
  expect(matchesOwnedLaunch({ devices: [], argv }, launch)).toBe(true);
  expect(matchesOwnedLaunch({ devices: [], argv: [...argv, '--auto-launch'] }, launch, true)).toBe(false);
  expect(matchesOwnedLaunch({ devices: [], argv: ['C:/other/main.py', '--port', '8188', '--disable-auto-launch'] }, launch, true)).toBe(false);
  expect(matchesOwnedLaunch({ devices: [] }, launch)).toBe(false);
  expect(matchesOwnedLaunch({ devices: [] }, launch, true)).toBe(true);
});
it('actual bound port is foreign or ComfyUI by response; closing it makes the port free/bindable', async () => {
  let actual = false;
  const server = http.createServer((_req, res) => res.end(JSON.stringify(actual ? { system: {}, devices: [] } : { service: 'not-comfy' })));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const target = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try { expect((await probeComfy(target)).kind).toBe('foreign'); actual = true; expect((await probeComfy(target)).kind).toBe('comfyui'); expect((await probeBindable(target)).bindable).toBe(false); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  expect((await probeComfy(target)).kind).toBe('free');
});
it('Windows TIME_WAIT proof requires target-local-port rows, PID0 only and no listener, bound socket, active owner or unknown row', () => {
  const row = (state: string, pid = 0) => `  TCP    127.0.0.1:7571  127.0.0.1:49300  ${state}  ${pid}\r\n`;
  expect(windowsPortTimeWaitOnly('Active Connections\r\n' + row('TIME_WAIT'), 7571)).toBe(true);
  expect(windowsPortTimeWaitOnly(' TCP [::1]:7571 [::1]:4000 TIME_WAIT 0', 7571)).toBe(true);
  for (const state of ['LISTENING', 'BOUND', 'ESTABLISHED', 'CLOSE_WAIT', 'UNKNOWN']) expect(windowsPortTimeWaitOnly(row('TIME_WAIT') + row(state, 123), 7571)).toBe(false);
  expect(windowsPortTimeWaitOnly(row('TIME_WAIT', 123), 7571)).toBe(false);
  expect(windowsPortTimeWaitOnly(' TCP 127.0.0.1:4000 127.0.0.1:7571 TIME_WAIT 0', 7571)).toBe(false);
  expect(windowsPortTimeWaitOnly(row('TIME_WAIT') + ' TCP malformed', 7571)).toBe(false);
  expect(windowsPortTimeWaitOnly('', 7571)).toBe(false);
});
it('access-denied bind errors are preserved, never waived as TIME_WAIT', async () => {
  const denied = new EventEmitter() as net.Server;
  denied.listen = (() => { queueMicrotask(() => denied.emit('error', Object.assign(new Error('denied'), { code: 'EACCES' }))); return denied; }) as net.Server['listen'];
  const make = vi.spyOn(net, 'createServer').mockReturnValueOnce(denied);
  try { expect(await probeBindable({ port: 8188 })).toEqual({ bindable: false, code: 'EACCES' }); }
  finally { make.mockRestore(); }
});
it.skipIf(process.platform !== 'win32')('real Windows TIME_WAIT table plus the observed EADDRINUSE failure is released, without pretending a bind succeeded', async () => {
  const python = process.env.COMFY_TEST_PYTHON || 'python';
  const script = "import socket,json;ls=socket.socket();ls.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1);ls.bind(('127.0.0.1',0));p=ls.getsockname()[1];ls.listen(1);c=socket.socket();c.connect(('127.0.0.1',p));s,_=ls.accept();s.shutdown(socket.SHUT_WR);c.recv(1);c.close();s.close();ls.close();print(json.dumps({'port':p,'serverClosed':True}))";
  const run = spawnSync(python, ['-c', script], { windowsHide: true, shell: false, encoding: 'utf8', timeout: 5000 });
  expect(run.status).toBe(0); expect(run.stderr).toBe(''); const { port } = JSON.parse(run.stdout) as { port: number };
  const table = await readWindowsTcpTable(), actualBind = await probeBindable({ port });
  // A tiny socket does not consistently reproduce the installed aiohttp
  // endpoint's Windows bind error. Preserve that real observation separately,
  // then inject only EADDRINUSE while retaining actual kernel table/TCP probes.
  const make = vi.spyOn(net, 'createServer').mockImplementation(() => {
    const inUse = new EventEmitter() as net.Server;
    inUse.listen = (() => { queueMicrotask(() => inUse.emit('error', Object.assign(new Error('observed Windows bind conflict'), { code: 'EADDRINUSE' }))); return inUse; }) as net.Server['listen'];
    return inUse;
  });
  let observed, found;
  try { observed = await probeBindable({ port }); found = await probeComfy({ port }); }
  finally { make.mockRestore(); }
  const relevantRows = table.split(/\r?\n/).filter(line => new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s`).test(line));
  const directory = process.env.COMFY_LIFECYCLE_EVIDENCE_DIR;
  if (directory) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, `windows-time-wait-${port}.json`), JSON.stringify({ command: [python, '-c', script], stdout: run.stdout, stderr: run.stderr, exitStatus: run.status, port, relevantRows, actualBind, injectedBindFailureOnly: 'EADDRINUSE', observed, preflight: found, noGpuOrComfyUI: true }, null, 2)); }
  expect(windowsPortTimeWaitOnly(table, port)).toBe(true);
  expect(observed.bindable).toBe(false); expect(observed.code).toBe('EADDRINUSE'); expect(observed.timeWaitOnly).toBe(true);
  expect(found.kind).toBe('free'); expect(found.detail).toContain('TIME_WAIT');
}, 15_000);
it.skipIf(process.platform !== 'win32')('real Windows bound non-listening socket remains occupied and its independent owner is not killed', async () => {
  const python = process.env.COMFY_TEST_PYTHON || 'python';
  const script = "import socket,json,sys;s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1);s.bind(('127.0.0.1',0));print(json.dumps({'port':s.getsockname()[1]}),flush=True);sys.stdin.read(1);s.close()";
  const child = spawn(python, ['-u', '-c', script], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', bytes => { stderr += String(bytes); });
  const exited = new Promise<number | null>(resolve => child.once('close', resolve));
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let text = ''; const timer = setTimeout(() => reject(new Error('BOUND fixture startup timeout')), 3000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', bytes => { text += String(bytes); if (text.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(text.trim()).port); } });
    });
    const table = await readWindowsTcpTable(), bind = await probeBindable({ port }), found = await probeComfy({ port });
    const rows = table.split(/\r?\n/).filter(line => new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s`).test(line));
    expect(rows.some(line => /\sBOUND\s/.test(line))).toBe(true); expect(windowsPortTimeWaitOnly(table, port)).toBe(false);
    expect(bind.bindable).toBe(false); expect(bind.timeWaitOnly).not.toBe(true); expect(found.kind).not.toBe('free'); expect(child.exitCode).toBeNull();
    const directory = process.env.COMFY_LIFECYCLE_EVIDENCE_DIR;
    if (directory) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, `windows-bound-${port}.json`), JSON.stringify({ command: [python, '-u', '-c', script], port, ownerPid: child.pid, rows, bind, preflight: found, ownerAliveAfterProbe: child.exitCode === null, noGpuOrComfyUI: true }, null, 2)); }
    child.stdin.end('\n'); expect(await exited).toBe(0); expect(stderr).toBe('');
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; }
}, 15_000);
