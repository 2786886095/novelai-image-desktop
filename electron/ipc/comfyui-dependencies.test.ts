import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { compareComfyMetadata, parseComfyRequirements, probeComfyDependencies, comfyDependencyDiagnosis } from './comfyui-dependencies';
import { detectInstallLayout } from './comfyui-install';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('comfy-metadata-test-')) throw new Error('UNSAFE_TEST_CLEANUP');
    fs.rmSync(root, { recursive: true });
  }
});
function fixture(requirements?: string) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'comfy-metadata-test-'))); roots.push(root);
  fs.writeFileSync(path.join(root, 'main.py'), '# static fixture; never executed');
  const python = path.join(root, process.platform === 'win32' ? 'python.exe' : 'python'); fs.writeFileSync(python, 'STATIC FIXTURE', { mode: 0o700 });
  if (requirements !== undefined) fs.writeFileSync(path.join(root, 'requirements.txt'), requirements);
  return { root, python, inspection: detectInstallLayout(root, python) };
}
it('compares safe exact numeric pins generically and leaves ranges, extras, markers and absent metadata unknown', () => {
  const requirements = parseComfyRequirements('# header\ncomfy-demo==0.5.6\ntorch>=2.0\noptional==7.0; python_version < "3.0"\nplain\npackage[extra]==1.2\n-r constraints.txt\nabsent==2.0');
  const rows = compareComfyMetadata(requirements, { pythonVersion: null, packages: {
    'comfy-demo': { status: 'found', version: '0.2.12' }, torch: { status: 'found', version: '1.0' },
    optional: { status: 'found', version: '1.0' }, plain: { status: 'found', version: '2.0' },
    package: { status: 'found', version: '0.1' }, absent: { status: 'missing', version: null },
  } });
  expect(rows.map(item => item.status)).toEqual(['mismatch', 'unknown', 'unknown', 'satisfied', 'unknown', 'unknown', 'unknown']);
  expect(compareComfyMetadata(parseComfyRequirements('example==1.2'), { pythonVersion: null, packages: { example: { status: 'found', version: '1.2.0+local' } } })[0].status).toBe('satisfied');
  expect(compareComfyMetadata(parseComfyRequirements('example==1.2'), { pythonVersion: null, packages: { example: { status: 'found', version: '1.2rc1' } } })[0].status).toBe('unknown');
  expect(compareComfyMetadata(requirements, null).every(item => item.status === 'unknown')).toBe(true);
});
it('reads installed metadata through a fixed isolated script without importing model packages or running pip', async () => {
  const f = fixture('comfy-demo==0.5.6\nother>=1.0\n');
  const before = fs.readFileSync(path.join(f.root, 'requirements.txt'));
  const execute = vi.fn((...args: unknown[]) => {
    const callback = args.at(-1) as (error: null, stdout: string, stderr: string) => void;
    callback(null, JSON.stringify({ pythonVersion: '3.11.9', packages: { 'comfy-demo': { status: 'found', version: '0.2.12' }, other: { status: 'missing', version: null } } }), '');
  });
  const result = await probeComfyDependencies(f.inspection, { execFile: execute as never });
  const [python, argv, options] = execute.mock.calls[0] as [string, string[], Record<string, unknown>];
  expect(python).toBe(f.python); expect(argv.slice(0,3)).toEqual(['-I', '-B', '-c']);
  expect(argv[3]).toContain('from importlib import metadata'); expect(argv[3]).not.toMatch(/import torch|pip|subprocess|system\(/);
  expect(JSON.parse(argv[4])).toEqual(['comfy-demo', 'other']); expect(options).toMatchObject({ windowsHide: true, shell: false });
  expect(result.pythonVersion).toBe('3.11.9'); expect(result.dependencyChecks?.[0]).toMatchObject({ name: 'comfy-demo', required: '==0.5.6', installed: '0.2.12', status: 'mismatch' });
  expect(result.dependencyChecks?.[1].status).toBe('unknown');
  expect(comfyDependencyDiagnosis({ ...f.inspection, ...result })).toMatchObject({ kind: 'dependency-mismatch', python: f.python });
  expect(fs.readFileSync(path.join(f.root, 'requirements.txt'))).toEqual(before); expect(fs.readFileSync(f.python, 'utf8')).toBe('STATIC FIXTURE');
});
it('missing requirements, unavailable metadata or malformed output never invent a dependency mismatch', async () => {
  const missing = fixture(), execute = vi.fn();
  expect((await probeComfyDependencies(missing.inspection, { execFile: execute as never })).dependencyChecks).toEqual([]); expect(execute).not.toHaveBeenCalled();
  const f = fixture('example==1.2\n');
  const failed = vi.fn((...args: unknown[]) => (args.at(-1) as Function)(new Error('unavailable'), '', 'token=secret-fixture'));
  const result = await probeComfyDependencies(f.inspection, { execFile: failed as never });
  expect(result.dependencyChecks?.[0].status).toBe('unknown'); expect(result.dependencyProbeMessage).not.toContain('secret-fixture');
  expect(comfyDependencyDiagnosis({ ...f.inspection, ...result })).toBeUndefined();
  const invalid = vi.fn((...args: unknown[]) => (args.at(-1) as Function)(null, 'not json', ''));
  expect((await probeComfyDependencies(f.inspection, { execFile: invalid as never })).dependencyChecks?.[0].status).toBe('unknown');
});
it('abort before metadata inspection never starts a child', async () => {
  const f = fixture('example==1.2'), controller = new AbortController(), execute = vi.fn(); controller.abort();
  await expect(probeComfyDependencies(f.inspection, { signal: controller.signal, execFile: execute as never })).rejects.toThrow(); expect(execute).not.toHaveBeenCalled();
});
