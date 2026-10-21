import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { killProcessTree, redactComfyLog } from './comfyui-process';
import type { ComfyInstallInspection } from '../../src/comfyui/contract';
import { EXTRA_PATH_FLAGS, parseExtraArgs } from '../../src/comfyui/launch-args';

export interface DetectedComfyInstall extends ComfyInstallInspection { directory: string; mainPath: string; pythonPath?: string; pythonArgs: string[] }
export interface ComfyHelpProbe extends ComfyInstallInspection { stdout: string; stderr: string; exitCode: number | null }
export interface ComfyLaunchSpec extends DetectedComfyInstall { pythonPath: string; args: string[]; port: number; portMode?: 'auto' | 'manual'; env: NodeJS.ProcessEnv; readyTimeoutMs?: number }
function installDetails(input: ComfyInstallInspection | DetectedComfyInstall): DetectedComfyInstall {
  const aliases = input as Partial<DetectedComfyInstall>;
  return { ...input, directory: aliases.directory || input.root, mainPath: aliases.mainPath || input.mainPy,
    pythonPath: aliases.pythonPath || input.python || undefined,
    // Never trust a persisted prefix such as -c/-m. Only this fixed main-owned
    // layout rule may prepend interpreter arguments at the execution boundary.
    pythonArgs: input.layout === 'portable' && /(?:^|[\\/])python_embed(?:d)?ed(?:[\\/]|$)/i.test(input.python) ? ['-s'] : [] };
}
function localAbsolute(input: string): string {
  if (typeof input !== 'string' || !path.isAbsolute(input) || /[\0\r\n]/.test(input) || /^(?:\\\\|\/\/|\\\?\?\\)/.test(input)) throw new Error('COMFY_LOCAL_PATH');
  const real = fs.realpathSync(input);
  if (/^(?:\\\\|\/\/|\\\?\?\\)/.test(real) || /(?:^|[\\/])WindowsApps(?:[\\/]|$)/i.test(real)) throw new Error('COMFY_PYTHON_ALIAS');
  return real;
}
export function validatePythonPath(input: string): string {
  const real = localAbsolute(input);
  if (!fs.statSync(real).isFile() || !/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(path.basename(real))) throw new Error('COMFY_PYTHON_INVALID');
  if (process.platform === 'win32' && !/\.exe$/i.test(real)) throw new Error('COMFY_PYTHON_INVALID');
  if (process.platform !== 'win32') fs.accessSync(real, fs.constants.X_OK);
  return real;
}
export function detectInstallLayout(selected: string, explicitPython?: string): DetectedComfyInstall {
  const directory = localAbsolute(selected);
  if (!fs.statSync(directory).isDirectory()) throw new Error('COMFY_INSTALL_INVALID');
  const possible = [path.join(directory, 'main.py'), path.join(directory, 'ComfyUI', 'main.py')];
  const mainPath = possible.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!mainPath) throw new Error('COMFY_INSTALL_INVALID');
  const source = path.dirname(mainPath), portableRoot = source === directory ? path.dirname(directory) : directory;
  const exe = process.platform === 'win32' ? 'python.exe' : 'python';
  const candidates: Array<{ file: string; layout: DetectedComfyInstall['layout']; cwd: string; args: string[] }> = [
    { file: path.join(portableRoot, 'python_embeded', exe), layout: 'portable', cwd: portableRoot, args: ['-s'] },
    { file: path.join(portableRoot, 'python_embedded', exe), layout: 'portable', cwd: portableRoot, args: ['-s'] },
    { file: path.join(portableRoot, 'python', exe), layout: 'portable', cwd: portableRoot, args: [] },
    { file: path.join(portableRoot, '.ext', exe), layout: 'portable', cwd: portableRoot, args: [] },
    ...[source, directory].flatMap(root => ['.venv', 'venv'].map(v => ({ file: path.join(root, v, process.platform === 'win32' ? 'Scripts' : 'bin', exe), layout: 'venv' as const, cwd: source, args: [] }))),
  ];
  const explicit = explicitPython ? validatePythonPath(explicitPython) : undefined;
  const key = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  // Saved paths are explicit too. Retain their known layout and interpreter flags
  // rather than treating every settings roundtrip as an arbitrary custom Python.
  const candidate = candidates.find(p => fs.existsSync(p.file)
    && (!explicit || key(localAbsolute(p.file)) === key(explicit)));
  const pythonPath = explicit || (candidate ? validatePythonPath(candidate.file) : undefined);
  const realMain = localAbsolute(mainPath);
  return { directory, root: source, mainPy: realMain, python: pythonPath || '', mainPath: realMain, ...(pythonPath ? { pythonPath } : {}),
    cwd: candidate?.cwd || source, layout: candidate?.layout || 'custom', pythonArgs: candidate?.args || [],
    pythonVersion: null, supportedFlags: [], helpProbe: 'not-run', helpProbeMessage: null, checkedAt: new Date().toISOString() };
}
export function sanitizedChildEnv(input: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(input)) {
    if (/^(?:ELECTRON_|NODE_OPTIONS$|NODE_EXTRA_CA_CERTS$|VITE_|NAI_|OPENAI_|ANTHROPIC_|CLAUDE_|CODEX_)/i.test(key) || /TOKEN|SECRET|PASSWORD|API_?KEY/i.test(key)) continue;
    if (/^(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|GLOBAL_AGENT_HTTP_PROXY)$/i.test(key)) continue;
    result[key] = value;
  }
  result.PYTHONUNBUFFERED = '1'; result.PYTHONIOENCODING = 'utf-8'; result.NO_PROXY = '127.0.0.1,localhost,::1';
  return result;
}
export interface ComfyHelpProbeOptions { timeoutMs?: number; spawn?: typeof spawn; env?: NodeJS.ProcessEnv; signal?: AbortSignal }
export async function probeComfyHelp(input: ComfyInstallInspection | DetectedComfyInstall, options: ComfyHelpProbeOptions = {}): Promise<ComfyHelpProbe> {
  if (options.signal?.aborted) throw new Error('COMFY_HELP_ABORTED');
  const install = installDetails(input);
  if (!install.pythonPath) throw new Error('COMFY_PYTHON_INVALID');
  const python = validatePythonPath(install.pythonPath);
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try { child = (options.spawn || spawn)(python, [...install.pythonArgs, install.mainPath, '--help'], { cwd: install.cwd, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: sanitizedChildEnv(options.env) }); }
    catch (error) { reject(error); return; }
    let stdout = '', stderr = '', bytes = 0, done = false, failure: Error | undefined;
    const finish = (error?: Error, code: number | null = null) => { if (done) return; done = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve({ ...install,
      supportedFlags: [...new Set((stdout + '\n' + stderr).match(/--[A-Za-z0-9][\w-]*/g) || [])], helpProbe: 'passed', helpProbeMessage: null,
      checkedAt: new Date().toISOString(), stdout, stderr, exitCode: code }); };
    const fail = (message: string) => { if (failure || done) return; failure = new Error(message); void killProcessTree(child).then(() => finish(failure), error => finish(new Error(`${message}: ${String(error)}`))); };
    const abort = () => fail('COMFY_HELP_ABORTED');
    const collect = (kind: 'stdout' | 'stderr', chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 ** 2) { fail('COMFY_HELP_OUTPUT_LIMIT'); return; } if (kind === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8'); };
    child.stdout?.on('data', chunk => collect('stdout', chunk)); child.stderr?.on('data', chunk => collect('stderr', chunk));
    const timer = setTimeout(() => fail('COMFY_HELP_TIMEOUT'), Math.min(options.timeoutMs || 30_000, 30_000));
    child.once('error', error => finish(error)); child.once('close', code => finish(failure || (code === 0 ? undefined : new Error(`COMFY_HELP_EXIT_${code}: ${redactComfyLog(stderr.slice(-2000))}`)), code));
    options.signal?.addEventListener('abort', abort, { once: true });
    // Handles an injected spawn hook that aborts synchronously before listener registration.
    if (options.signal?.aborted) abort();
  });
}

/** Recheck the shared whitelist and real filesystem at the process boundary. */
export function buildLaunchSpec(input: ComfyInstallInspection | DetectedComfyInstall, options: { port: number; args: string[]; env?: NodeJS.ProcessEnv; readyTimeoutSec?: number }): ComfyLaunchSpec {
  const install = installDetails(input);
  if (!install.pythonPath) throw new Error('COMFY_PYTHON_INVALID');
  if (install.helpProbe !== 'passed' || !install.supportedFlags.includes('--disable-auto-launch')) throw new Error('COMFY_HELP_NOT_VERIFIED');
  const pythonPath = validatePythonPath(install.pythonPath);
  const mainPath = localAbsolute(install.mainPath), cwd = localAbsolute(install.cwd);
  if (path.basename(mainPath).toLowerCase() !== 'main.py' || !fs.statSync(mainPath).isFile() || !fs.statSync(cwd).isDirectory()) throw new Error('COMFY_INSTALL_INVALID');
  const timeout = options.readyTimeoutSec ?? 300;
  if (!Number.isFinite(timeout) || timeout < 30 || timeout > 1800) throw new Error('COMFY_LAUNCH_TIMEOUT');
  if (!Array.isArray(options.args) || options.args.length > 256 || options.args.some(a => typeof a !== 'string' || /[\0\r\n]/.test(a))) throw new Error('COMFY_LAUNCH_ARGS');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535 || !options.args.includes('--disable-auto-launch')) throw new Error('COMFY_LAUNCH_ARGS');
  if (options.args.some(a => /^--(?:auto-launch|enable-cors-header|enable-manager.*|tls-.*|windows-standalone-build|front-end-version|front-end-root|comfy-api-base|multi-user|dont-print-server|quick-test-for-ci|database-url)(?:=|$)/.test(a) || a === '--')) throw new Error('COMFY_LAUNCH_ARGS');
  for (const fixed of ['listen', 'port', 'disable-auto-launch']) if (options.args.filter(a => new RegExp(`^--${fixed}(?:=|$)`).test(a)).length !== 1) throw new Error('COMFY_LAUNCH_ARGS');
  const p = options.args.indexOf('--port'), l = options.args.indexOf('--listen');
  if (p < 0 || options.args[p + 1] !== String(options.port) || l < 0 || options.args[l + 1] !== '127.0.0.1') throw new Error('COMFY_LAUNCH_ARGS');
  const extra: string[] = [];
  const fixed = new Set(['--listen', '--port', '--disable-auto-launch', '--disable-api-nodes', '--disable-all-custom-nodes']);
  for (let index = 0; index < options.args.length; index++) {
    const value = options.args[index];
    if (fixed.has(value)) {
      if (!install.supportedFlags.includes(value)) throw new Error('COMFY_LAUNCH_ARGS');
      if (value === '--listen' || value === '--port') index++;
      else if (options.args.filter(arg => arg === value).length !== 1) throw new Error('COMFY_LAUNCH_ARGS');
    } else extra.push(value);
  }
  const checkedExtra = parseExtraArgs(extra, install.supportedFlags);
  for (let index = 0; index < checkedExtra.length; index++) {
    const kind = EXTRA_PATH_FLAGS[checkedExtra[index]];
    if (!kind) continue;
    const file = localAbsolute(checkedExtra[++index]), stat = fs.statSync(file);
    if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) throw new Error('COMFY_LAUNCH_PATH_TYPE');
  }
  return { ...install, mainPath, mainPy: mainPath, cwd, pythonPath, python: pythonPath, port: options.port, readyTimeoutMs: timeout * 1000,
    args: [...install.pythonArgs, mainPath, ...options.args], env: sanitizedChildEnv(options.env) };
}
