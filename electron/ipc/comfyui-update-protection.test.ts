import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertUpdateOutputProtection } from './update-output-protection';

let root: string, install: string, profile: string, external: string;
const put = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ version: 1, data: value })); };
const guard = () => assertUpdateOutputProtection(install, { settings: { outputDir: external }, history: [] }, { comfyUserData: profile } as never);
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'comfy-guard-')); install = path.join(root, 'app'); profile = path.join(root, 'profile'); external = path.join(root, 'environment'); for (const p of [install, profile, external]) fs.mkdirSync(p); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('Comfy update protection', () => {
  it('blocks saved Comfy source, Python and output paths inside installation', () => {
    for (const data of [{ install: { root: path.join(install, 'ComfyUI') } }, { install: { python: path.join(install, 'python', 'python.exe') } }, { outputDirectory: path.join(install, 'comfy-images') }]) {
      put(path.join(profile, 'comfyui-local/settings.json'), data); expect(guard).toThrow('更新已停止');
    }
  });
  it('blocks managed environments and previously saved result images too', () => {
    put(path.join(profile, 'comfyui-local/environments.json'), { schema: 1, environments: [{ root: path.join(install, 'managed') }] }); expect(guard).toThrow();
    fs.unlinkSync(path.join(profile, 'comfyui-local/environments.json'));
    put(path.join(profile, 'comfyui-local/results.json'), [{ filePath: path.join(install, 'old-result.png') }]); expect(guard).toThrow();
  });
  it('blocks a nested unregistered Comfy tree before old uninstaller can clean it', () => {
    const nested = path.join(install, 'bundle', 'ComfyUI'); fs.mkdirSync(path.join(nested, 'comfy'), { recursive: true }); fs.writeFileSync(path.join(nested, 'main.py'), 'sentinel'); expect(guard).toThrow(); expect(fs.readFileSync(path.join(nested, 'main.py'), 'utf8')).toBe('sentinel');
  });
  it('fails closed on malformed Comfy stores', () => { fs.mkdirSync(path.join(profile, 'comfyui-local')); fs.writeFileSync(path.join(profile, 'comfyui-local/settings.json'), '{bad'); expect(guard).toThrow(); });
  it('allows external sibling environment without writing any sentinel', () => {
    const sentinel = path.join(external, 'model.safetensors'); fs.writeFileSync(sentinel, 'pristine'); const mtime = fs.statSync(sentinel).mtimeMs;
    put(path.join(profile, 'comfyui-local/settings.json'), { install: { root: external, python: path.join(external, 'python.exe') }, outputDirectory: path.join(external, 'output') }); expect(guard).not.toThrow(); expect(fs.readFileSync(sentinel, 'utf8')).toBe('pristine'); expect(fs.statSync(sentinel).mtimeMs).toBe(mtime);
  });
});
