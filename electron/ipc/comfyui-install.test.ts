import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { getEventListeners } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { buildLaunchSpec, detectInstallLayout, probeComfyHelp, sanitizedChildEnv, validatePythonPath } from './comfyui-install';
import { killProcessTree } from './comfyui-process';

const dirs: string[] = [];
const pythonCheck = spawnSync(process.env.COMFY_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import sys;print(sys.executable)'], { windowsHide: true, shell: false, encoding: 'utf8', timeout: 5000 });
const testPython = pythonCheck.status === 0 ? pythonCheck.stdout.trim() : null;
if (!testPython) console.warn('ComfyUI install real-process tests skipped: Python missing; set COMFY_TEST_PYTHON.');
const processTest = it.skipIf(!testPython);
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const temp = () => { const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'comfy-install-test-'))); dirs.push(dir); return dir; };
it('detects portable/绘世 python and nested main.py, rejects opaque launchers/WindowsApps/UNC', () => {
  const root = temp(); fs.mkdirSync(path.join(root, 'ComfyUI')); fs.mkdirSync(path.join(root, 'python'));
  const executable = process.platform === 'win32' ? 'python.exe' : 'python';
  fs.writeFileSync(path.join(root, 'ComfyUI/main.py'), '# test only'); fs.writeFileSync(path.join(root, 'python', executable), 'not executed test fixture', { mode: 0o700 });
  const install = detectInstallLayout(root);
  expect(install.layout).toBe('portable'); expect(install.pythonPath).toBe(path.join(root, 'python', executable)); expect(install.cwd).toBe(root);
  for (const name of ['start.bat', 'python.cmd', 'launcher.exe']) { fs.writeFileSync(path.join(root, name), 'test'); expect(() => validatePythonPath(path.join(root, name))).toThrow(); }
  fs.mkdirSync(path.join(root, 'WindowsApps')); fs.writeFileSync(path.join(root, 'WindowsApps/python.exe'), 'alias'); expect(() => validatePythonPath(path.join(root, 'WindowsApps/python.exe'))).toThrow();
  expect(() => validatePythonPath('\\\\remote\\share\\python.exe')).toThrow();
});
it('sanitizes child-only interpreter and app credentials without mutating parent environment', () => {
  const input = { PATH: 'keep', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require private', VITE_API_TOKEN: 'x', NAI_TOKEN: 'private', OPENAI_API_KEY: 'private', HTTP_PROXY: 'private', LANG: 'en' };
  const result = sanitizedChildEnv(input);
  expect(result.PATH).toBe('keep'); expect(result.NAI_TOKEN).toBeUndefined(); expect(result.OPENAI_API_KEY).toBeUndefined(); expect(result.HTTP_PROXY).toBeUndefined(); expect(result.NODE_OPTIONS).toBeUndefined();
  expect(result.PYTHONUNBUFFERED).toBe('1'); expect(input.NAI_TOKEN).toBe('private');
});
it('missing interpreter aliases are omitted so a detected installation remains plain JSON', () => {
  const root = temp(); fs.writeFileSync(path.join(root, 'main.py'), '# fixture');
  const install = detectInstallLayout(root);
  expect(install.python).toBe(''); expect(Object.hasOwn(install, 'pythonPath')).toBe(false);
  expect(JSON.parse(JSON.stringify(install))).toEqual(install);
});
it('saved portable and Aki .ext interpreters retain their known layout and only main-owned Python prefixes', () => {
  const root = temp(), executable = process.platform === 'win32' ? 'python.exe' : 'python';
  fs.mkdirSync(path.join(root, 'ComfyUI')); fs.mkdirSync(path.join(root, 'python_embeded')); fs.mkdirSync(path.join(root, '.ext'));
  fs.writeFileSync(path.join(root, 'ComfyUI/main.py'), '# static fixture');
  for (const folder of ['python_embeded', '.ext']) fs.writeFileSync(path.join(root, folder, executable), 'fixture', { mode: 0o700 });
  const first = detectInstallLayout(root), saved = JSON.parse(JSON.stringify(first));
  const reloaded = detectInstallLayout(saved.root, saved.python);
  expect(reloaded).toMatchObject({ layout: 'portable', pythonArgs: ['-s'], python: first.python });
  const ext = detectInstallLayout(saved.root, path.join(root, '.ext', executable));
  expect(ext).toMatchObject({ layout: 'portable', pythonArgs: [], cwd: root });
  const malicious = { ...reloaded, pythonArgs: ['-c', 'throw new Error("must never execute")'], helpProbe: 'passed' as const, supportedFlags: ['--listen', '--port', '--disable-auto-launch'] };
  expect(buildLaunchSpec(malicious, { port: 8188, args: ['--listen','127.0.0.1','--port','8188','--disable-auto-launch'] }).args.slice(0, 2)).toEqual(['-s', path.join(root, 'ComfyUI/main.py')]);
});
it('launch spec fixes loopback, explicit port and no-browser and does not accept arbitrary shell', () => {
  const root = temp(); fs.writeFileSync(path.join(root, 'main.py'), '# fixture'); fs.writeFileSync(path.join(root, 'python.exe'), 'fixture', { mode: 0o700 });
  const install = detectInstallLayout(root, path.join(root, 'python.exe'));
  const args = ['--listen', '127.0.0.1', '--port', '8190', '--disable-auto-launch'];
  expect(() => buildLaunchSpec(install, { port: 8190, args })).toThrow('HELP_NOT_VERIFIED');
  install.helpProbe = 'passed'; install.supportedFlags = ['--disable-auto-launch', '--listen', '--port'];
  expect(buildLaunchSpec(install, { port: 8190, args }).args).toEqual([install.mainPath, ...args]);
  expect(buildLaunchSpec(install, { port: 8190, args, readyTimeoutSec: 60 }).readyTimeoutMs).toBe(60_000);
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--auto-launch'] })).toThrow();
  expect(() => buildLaunchSpec(install, { port: 8190, args: args.filter(a => a !== '--disable-auto-launch') })).toThrow();
});
it('launch boundary rechecks allow-listed extras and filesystem path existence/type', () => {
  const root = temp(); fs.writeFileSync(path.join(root, 'main.py'), '# fixture'); fs.writeFileSync(path.join(root, 'python.exe'), 'fixture', { mode: 0o700 });
  const install = detectInstallLayout(root, path.join(root, 'python.exe'));
  install.helpProbe = 'passed'; install.supportedFlags = ['--disable-auto-launch', '--listen', '--port', '--cpu', '--reserve-vram', '--output-directory', '--extra-model-paths-config'];
  const args = ['--listen', '127.0.0.1', '--port', '8190', '--disable-auto-launch'];
  const config = path.join(root, 'extra.yaml'); fs.writeFileSync(config, '# fixture');
  expect(buildLaunchSpec(install, { port: 8190, args: [...args, '--cpu', '--output-directory', root, '--extra-model-paths-config=' + config] }).args).toContain('--cpu');
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--unverified-flag'] })).toThrow('LAUNCH_ARGS');
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--output-directory', config] })).toThrow('PATH_TYPE');
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--extra-model-paths-config', root] })).toThrow('PATH_TYPE');
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--output-directory', path.join(root, 'missing')] })).toThrow();
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--reserve-vram', 'bad'] })).toThrow('LAUNCH_ARGS');
  expect(() => buildLaunchSpec(install, { port: 8190, args: [...args, '--cpu', '--cpu'] })).toThrow('LAUNCH_ARGS');
});
processTest('real help probe is a hidden shell:false Python process and collects supported flags without launching server', async () => {
  const fixture = path.resolve('tests/fixtures/comfyui-protocol/main.py');
  const install = detectInstallLayout(path.dirname(fixture), testPython!);
  const controller = new AbortController();
  const answer = await probeComfyHelp(install, { signal: controller.signal });
  expect(answer.exitCode).toBe(0); expect(answer.supportedFlags).toContain('--disable-auto-launch'); expect(answer.supportedFlags).toContain('--port');
  expect(answer.stdout).toContain('TEST FIXTURE'); expect(answer.stderr).toBe('');
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  controller.abort(); // Completed probes cannot be killed by a later shutdown signal.
}, 15_000);
it('already-aborted help probe never spawns or registers a lingering listener', async () => {
  const root = temp(); fs.writeFileSync(path.join(root, 'main.py'), '# fixture'); fs.writeFileSync(path.join(root, 'python.exe'), 'fixture', { mode: 0o700 });
  const install = detectInstallLayout(root, path.join(root, 'python.exe'));
  const controller = new AbortController(); controller.abort(); const start = vi.fn();
  await expect(probeComfyHelp(install, { signal: controller.signal, spawn: start as unknown as typeof spawn })).rejects.toThrow('COMFY_HELP_ABORTED');
  expect(start).not.toHaveBeenCalled(); expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});
processTest('aborting a real help probe cleans its held child only and removes the abort listener', async () => {
  const root = temp(), mainPath = path.join(root, 'main.py'), marker = path.join(root, 'help-child.pid');
  fs.writeFileSync(mainPath, `import os,time\nopen(${JSON.stringify(marker)},'w').write(str(os.getpid()))\nprint('HELP ABORT TEST child started',flush=True)\ntime.sleep(60)\n`);
  const install = detectInstallLayout(root, testPython!), controller = new AbortController();
  const independent = spawn(testPython!, ['-c', 'import time;time.sleep(60)'], { windowsHide: true, shell: false, stdio: 'ignore', detached: process.platform !== 'win32' });
  let owned: ChildProcess | undefined, stdout = '', stderr = '';
  const start = ((...args: Parameters<typeof spawn>) => {
    const child = spawn(...args); owned = child;
    child.stdout?.on('data', b => { stdout += String(b); }); child.stderr?.on('data', b => { stderr += String(b); });
    return child;
  }) as typeof spawn;
  const result = probeComfyHelp(install, { signal: controller.signal, spawn: start }).then(value => ({ value, error: null }), error => ({ value: null, error }));
  const observed: Record<string, unknown> = { fixtureOnly: true, mainPath, python: testPython, independentPid: independent.pid };
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
    expect(fs.existsSync(marker)).toBe(true); const pid = Number(fs.readFileSync(marker, 'utf8'));
    observed.ownedPid = pid; observed.aliveBeforeAbort = owned?.exitCode === null;
    controller.abort(); const answer = await result;
    expect(String(answer.error)).toContain('COMFY_HELP_ABORTED'); expect(answer.value).toBeNull();
    expect(owned?.exitCode !== null || owned?.signalCode !== null).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow(); expect(independent.exitCode).toBeNull();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    observed.ownedAliveAfterAbort = false; observed.independentAliveAfterAbort = independent.exitCode === null;
    observed.error = String(answer.error); observed.exitCode = owned?.exitCode; observed.signal = owned?.signalCode;
  } finally {
    controller.abort(); await result;
    if (owned) await killProcessTree(owned); await killProcessTree(independent);
    const evidence = process.env.COMFY_LIFECYCLE_EVIDENCE_DIR;
    if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, `help-abort-${Date.now()}.json`), JSON.stringify({ ...observed, stdout, stderr }, null, 2)); }
  }
}, 20_000);
processTest('real hidden help probe kills its own interpreter on timeout or oversized output', async () => {
  const root = temp(), mainPath = path.join(root, 'main.py');
  fs.writeFileSync(mainPath, 'import time\ntime.sleep(60)\n');
  const install = detectInstallLayout(root, testPython!);
  await expect(probeComfyHelp(install, { timeoutMs: 100 })).rejects.toThrow('HELP_TIMEOUT');
  fs.writeFileSync(mainPath, "import sys,time\nsys.stdout.write('x'*(2*1024*1024))\nsys.stdout.flush()\ntime.sleep(60)\n");
  await expect(probeComfyHelp(install)).rejects.toThrow('HELP_OUTPUT_LIMIT');
}, 20_000);
