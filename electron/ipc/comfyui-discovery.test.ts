import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverComfyEnvironments } from './comfyui-discovery';

const fixtures: string[] = [];
const executable = process.platform === 'win32' ? 'python.exe' : 'python';
const pythonFolder = process.platform === 'win32' ? 'Scripts' : 'bin';
const temporary = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'comfy-discovery-fixture-')));
  fixtures.push(root);
  return root;
};
const file = (root: string, relative: string) => {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, 'STATIC TEST FIXTURE; MUST NOT BE EXECUTED');
  return destination;
};
const directoryLink = (destination: string, link: string) => {
  fs.symlinkSync(destination, link, process.platform === 'win32' ? 'junction' : 'dir');
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('bounded static ComfyUI environment discovery', () => {
  it('finds an Aki bundle without running its interpreter or launcher', () => {
    const root = temporary();
    const main = file(root, 'Aki Bundle/ComfyUI/main.py');
    const python = file(root, `Aki Bundle/python/${executable}`);
    fs.mkdirSync(path.join(root, 'Aki Bundle/ComfyUI/models'));
    file(root, 'Aki Bundle/绘世启动器.exe');
    const result = discoverComfyEnvironments({ roots: [root] });
    expect(result.environments).toHaveLength(1);
    expect(result.environments[0]).toMatchObject({
      root: path.dirname(main), python, layout: 'aki', label: 'Aki Bundle', sourceRoot: root,
      modelDirectory: path.join(path.dirname(main), 'models'), reason: 'static-layout-detected',
    });
    expect(result.environments[0].id).toMatch(/^comfy-env-[a-f0-9]{24}$/);
    expect(result.environments[0].warnings).toContain('runtime-not-verified');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain('"ready"');
  });

  it('recognizes official portable python_embeded before an Aki-style fallback', () => {
    const root = temporary();
    file(root, 'portable/ComfyUI/main.py');
    const python = file(root, `portable/python_embeded/${executable}`);
    file(root, `portable/python/${executable}`);
    const result = discoverComfyEnvironments({ roots: [root] });
    expect(result.environments[0]).toMatchObject({ python, layout: 'portable', label: 'portable' });
  });

  it('finds a checked-out source tree and its own .venv', () => {
    const root = temporary();
    const main = file(root, 'checkout/main.py');
    const python = file(root, `checkout/.venv/${pythonFolder}/${executable}`);
    expect(discoverComfyEnvironments({ roots: [root] }).environments[0]).toMatchObject({
      root: path.dirname(main), python, layout: 'venv', label: 'checkout',
    });
  });

  it('keeps a source candidate when Python is missing instead of calling it ready', () => {
    const root = temporary();
    file(root, 'main.py');
    const candidate = discoverComfyEnvironments({ roots: [root], maxDepth: 0 }).environments[0];
    expect(candidate).toMatchObject({ root, python: '', layout: 'source', reason: 'python-not-found', modelDirectory: '' });
    expect(candidate.warnings).toEqual(expect.arrayContaining(['runtime-not-verified', 'python-not-found', 'model-directory-not-found']));
  });

  it('deduplicates overlapping roots and keeps opaque identifiers stable across calls and root order', () => {
    const root = temporary();
    file(root, 'b/main.py');
    file(root, 'a/main.py');
    const first = discoverComfyEnvironments({ roots: [path.join(root, 'a'), root, root] });
    const second = discoverComfyEnvironments({ roots: [root, path.join(root, 'a')] });
    expect(first.environments).toEqual(second.environments);
    expect(first.environments).toHaveLength(2);
    expect(first.environments.map(candidate => candidate.root)).toEqual([path.join(root, 'a'), path.join(root, 'b')]);
    const direct = discoverComfyEnvironments({ roots: [path.join(root, 'a')] });
    expect(direct.environments[0].id).toBe(first.environments[0].id);
  });

  it('does not inspect sibling Python outside a directly selected source root', () => {
    const root = temporary();
    file(root, 'bundle/ComfyUI/main.py');
    file(root, `bundle/python/${executable}`);
    const source = path.join(root, 'bundle/ComfyUI');
    expect(discoverComfyEnvironments({ roots: [source] }).environments[0]).toMatchObject({ sourceRoot: source, python: '' });
  });

  it('never follows a child directory junction or symlink', () => {
    const root = temporary(), outside = temporary();
    file(outside, 'main.py');
    directoryLink(outside, path.join(root, 'linked-bundle'));
    const result = discoverComfyEnvironments({ roots: [root] });
    expect(result.environments).toEqual([]);
    expect(result.warnings.some(warning => warning.code === 'link-rejected')).toBe(true);
  });

  it('rejects a linked root and a non-linked leaf below a linked ancestor', () => {
    const root = temporary(), outside = temporary();
    file(outside, 'nested/main.py');
    const link = path.join(root, 'bundle-link');
    directoryLink(outside, link);
    const result = discoverComfyEnvironments({ roots: [link, path.join(link, 'nested')] });
    expect(result.environments).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every(warning => warning.code === 'link-rejected')).toBe(true);
  });

  it('rejects Python and model directory links without rejecting the unrelated source', () => {
    const root = temporary(), outside = temporary();
    file(root, 'bundle/ComfyUI/main.py');
    file(outside, executable);
    directoryLink(outside, path.join(root, 'bundle/python'));
    directoryLink(outside, path.join(root, 'bundle/ComfyUI/models'));
    const candidate = discoverComfyEnvironments({ roots: [root] }).environments[0];
    expect(candidate.python).toBe('');
    expect(candidate.modelDirectory).toBe('');
    expect(candidate.warnings).toEqual(expect.arrayContaining(['python-path-rejected', 'model-directory-path-rejected']));
  });

  it('rejects UNC/device/WindowsApps/relative/drive-root inputs before scanning them', () => {
    const root = temporary();
    const forbidden = [
      '\\\\server\\share\\bundle', '\\\\?\\C:\\bundle', '\\\\.\\C:\\bundle', '\\??\\C:\\bundle',
      '//server/share/bundle', path.join(root, 'WindowsApps', 'package'), 'relative/bundle', path.parse(root).root,
    ];
    const result = discoverComfyEnvironments({ roots: forbidden });
    expect(result.environments).toEqual([]);
    expect(result.examinedEntries).toBe(0);
    expect(result.warnings).toHaveLength(forbidden.length);
    expect(result.warnings.every(warning => warning.code === 'unsafe-root')).toBe(true);
  });

  it('skips WindowsApps branches rather than checking inside them', () => {
    const root = temporary();
    file(root, 'WindowsApps/alias/main.py');
    expect(discoverComfyEnvironments({ roots: [root] }).environments).toEqual([]);
  });

  it('clamps the traversal depth to three and obeys a smaller requested depth', () => {
    const root = temporary();
    file(root, 'a/b/c/main.py');
    file(root, 'a/b/c/d/main.py');
    expect(discoverComfyEnvironments({ roots: [root], maxDepth: 999 }).environments.map(candidate => candidate.root)).toEqual([path.join(root, 'a/b/c')]);
    expect(discoverComfyEnvironments({ roots: [root], maxDepth: 2 }).environments).toEqual([]);
  });

  it('bounds directory enumeration globally and does not load full directory lists', () => {
    const root = temporary();
    for (let index = 0; index < 600; index++) file(root, `file-${String(index).padStart(3, '0')}.txt`);
    const readdir = vi.spyOn(fs, 'readdirSync');
    const result = discoverComfyEnvironments({ roots: [root], maxEntries: 999_999 });
    expect(result.examinedEntries).toBeLessThanOrEqual(512);
    expect(result.truncated).toBe(true);
    expect(readdir).not.toHaveBeenCalled();
    expect(discoverComfyEnvironments({ roots: [root], maxEntries: 3 }).examinedEntries).toBeLessThanOrEqual(3);
  });

  it('does not recurse into model blobs, outputs, dependency trees or credentials', () => {
    const root = temporary();
    for (const folder of ['models', 'output', 'input', 'node_modules', '.git', 'custom_nodes', '.venv']) file(root, `${folder}/ignored/main.py`);
    file(root, '.env');
    file(root, 'credentials.json');
    const read = vi.spyOn(fs, 'readFileSync');
    const spawn = vi.spyOn(childProcess, 'spawn');
    const exec = vi.spyOn(childProcess, 'execFileSync');
    const result = discoverComfyEnvironments({ roots: [root] });
    expect(result.environments).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('does not infer an installation from only an opaque launcher or arbitrary executable', () => {
    const root = temporary();
    file(root, '绘世启动器.exe');
    file(root, `python/${executable}`);
    expect(discoverComfyEnvironments({ roots: [root] }).environments).toEqual([]);
  });

  it('reports inaccessible/missing roots without exposing raw exception messages', () => {
    const root = temporary();
    const result = discoverComfyEnvironments({ roots: [path.join(root, 'not-there')] });
    expect(result.environments).toEqual([]);
    expect(result.warnings).toEqual([{ sourceRoot: path.join(root, 'not-there'), code: 'root-unavailable' }]);
  });

  it('validates bad budgets and limits the number of explicit roots', () => {
    const root = temporary();
    expect(() => discoverComfyEnvironments({ roots: [root], maxDepth: -1 })).toThrow('COMFY_DISCOVERY_OPTIONS');
    expect(() => discoverComfyEnvironments({ roots: [root], maxEntries: 0 })).toThrow('COMFY_DISCOVERY_OPTIONS');
    expect(() => discoverComfyEnvironments({ roots: [root], maxEntries: Number.NaN })).toThrow('COMFY_DISCOVERY_OPTIONS');
    expect(() => discoverComfyEnvironments({ roots: Array(33).fill(root) })).toThrow('COMFY_DISCOVERY_OPTIONS');
  });
});
