import net from 'node:net';
import path from 'node:path';
import type { ComfyInstallInspection } from '../../src/comfyui/contract';
import { discoverSelectedComfyEnvironments } from './comfyui-discovery';
import { probeComfyDependencies } from './comfyui-dependencies';
import { validatePythonPath } from './comfyui-install';
import { probeComfy, matchesConfiguredMain } from './comfyui-probe';

export async function selectComfyPython(selected: string, options: { signal?: AbortSignal; preferredPython?: string; probe?: typeof probeComfyDependencies } = {}): Promise<ComfyInstallInspection> {
  options.signal?.throwIfAborted();
  const candidates = discoverSelectedComfyEnvironments(selected).slice(0, 8);
  if (!candidates.length) throw new Error('COMFY_INSTALL_INVALID');
  const inspect = (candidate: typeof candidates[number]): ComfyInstallInspection => ({
    root: candidate.root, mainPy: path.join(candidate.root, 'main.py'), python: candidate.python,
    cwd: ['aki', 'portable'].includes(candidate.layout) ? candidate.sourceRoot : candidate.root,
    layout: candidate.layout === 'venv' ? 'venv' : ['aki', 'portable'].includes(candidate.layout) ? 'portable' : 'custom',
    pythonArgs: candidate.pythonArgs || [], pythonVersion: null, supportedFlags: [], helpProbe: 'not-run', helpProbeMessage: null,
    checkedAt: new Date().toISOString(), pythonSelection: { mode: 'auto', reason: 'COMFY_PYTHON_AUTO_UNCONFIRMED' },
  });
  const observed: ComfyInstallInspection[] = [];
  for (const candidate of candidates) {
    options.signal?.throwIfAborted();
    if (!candidate.python) continue;
    if (!discoverSelectedComfyEnvironments(selected).some(current => current.id === candidate.id && current.python === candidate.python)) throw new Error('COMFY_SETUP_STALE_CANDIDATE');
    const inspection = inspect(candidate); inspection.python = validatePythonPath(candidate.python);
    const metadata = await (options.probe || probeComfyDependencies)(inspection, { signal: options.signal });
    options.signal?.throwIfAborted(); observed.push({ ...inspection, ...metadata });
  }
  const eligible = observed.filter(item => item.dependencyChecks?.some(check => check.status === 'satisfied')
    && !item.dependencyChecks.some(check => check.status === 'mismatch' || check.status === 'missing'));
  const key = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  eligible.sort((a, b) => Number(key(b.python) === key(options.preferredPython || '')) - Number(key(a.python) === key(options.preferredPython || ''))
    || (b.dependencyChecks?.filter(check => check.status === 'satisfied').length || 0) - (a.dependencyChecks?.filter(check => check.status === 'satisfied').length || 0));
  const chosen = eligible[0];
  if (chosen) {
    if (!discoverSelectedComfyEnvironments(selected).some(current => current.root === chosen.root && current.python === chosen.python)) throw new Error('COMFY_SETUP_STALE_CANDIDATE');
    return { ...chosen, pythonSelection: { mode: 'auto', reason: 'COMFY_PYTHON_AUTO_METADATA_MATCH' } };
  }
  return { ...inspect(candidates[0]), python: '', pythonArgs: [], helpProbeMessage: 'COMFY_PYTHON_AUTO_UNCONFIRMED' };
}

async function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('COMFY_PORT_AUTO_UNAVAILABLE')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

/** Bounded loopback observations only, never process ownership or permission to kill. */
export async function selectComfyPort(install: ComfyInstallInspection, ports: number[], options: { signal?: AbortSignal; probe?: typeof probeComfy; allocate?: () => Promise<number>; expectedArgs?: readonly string[] } = {}): Promise<number> {
  options.signal?.throwIfAborted();
  const known = [...new Set([...ports, 8188])].filter(port => Number.isInteger(port) && port >= 1024 && port <= 65535).slice(0, 8);
  let free: number | undefined;
  const observe = options.probe || probeComfy;
  for (const port of known) {
    options.signal?.throwIfAborted();
    const found = await observe({ host: '127.0.0.1', port }, { timeoutMs: 300, signal: options.signal });
    options.signal?.throwIfAborted();
    if (found.kind === 'comfyui' && found.identity && matchesConfiguredMain(found.identity, install.mainPy, port, options.expectedArgs)) return port;
    if (found.kind === 'free' && free === undefined) free = port;
  }
  if (free !== undefined) return free;
  // The reservation must close before Python binds; the supervisor rechecks the
  // selected endpoint immediately before spawn and never kills a competing owner.
  for (let attempt = 0; attempt < 3; attempt++) {
    options.signal?.throwIfAborted(); const port = await (options.allocate || allocateLoopbackPort)(); options.signal?.throwIfAborted();
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('COMFY_PORT_AUTO_UNAVAILABLE');
    const found = await observe({ host: '127.0.0.1', port }, { timeoutMs: 300, signal: options.signal }); options.signal?.throwIfAborted();
    if (found.kind === 'free') return port;
    if (found.kind === 'comfyui' && found.identity && matchesConfiguredMain(found.identity, install.mainPy, port, options.expectedArgs)) return port;
  }
  throw new Error('COMFY_PORT_AUTO_UNAVAILABLE');
}
