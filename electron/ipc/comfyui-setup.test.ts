import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ComfySetupController, COMFY_OFFICIAL_ACQUISITION_PAGE, type ComfySetupOptions } from './comfyui-setup';
import { detectInstallLayout } from './comfyui-install';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function harness() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'comfy-controller-'))); roots.push(root);
  const softwareHome = path.join(root, 'software'), userData = path.join(root, 'profile'), desktopDirectory = path.join(root, 'desktop');
  for (const p of [softwareHome, userData, desktopDirectory]) fs.mkdirSync(p);
  const adopt = vi.fn(async () => ({ schema: 1 } as never)), openExternal = vi.fn(async () => undefined);
  const chooseDirectory = vi.fn(async () => null as string | null), chooseArchive = vi.fn(async () => null as string | null);
  const options: ComfySetupOptions = { softwareHome, userData, desktopDirectory, platform: 'win32', discoveryRoots: [softwareHome],
    policy: { installDirectories: [path.join(softwareHome, 'app')], temporaryDirectories: [], userDataDirectory: userData },
    chooseDirectory, chooseArchive, adopt, openExternal,
    // Shortcut file serialization is a test fixture, not native Windows shell acceptance.
    writeShortcut: (file, value) => { fs.writeFileSync(file, JSON.stringify(value)); return true; },
    readShortcut: file => JSON.parse(fs.readFileSync(file, 'utf8')),
  };
  return { root, softwareHome, userData, desktopDirectory, options, adopt, openExternal, chooseDirectory, chooseArchive, setup: new ComfySetupController(options) };
}
const file = (root: string, relative: string, content = 'STATIC FIXTURE; DO NOT EXECUTE') => { const p = path.join(root, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; };
describe('Comfy managed setup controller', () => {
  it('uses the independent software sibling root and only opens the fixed official acquisition page', async () => {
    const h = harness(); expect((await h.setup.getState()).defaultRoot).toBe(path.join(h.softwareHome, 'ComfyUI 环境'));
    await h.setup.openOfficialPage(); expect(h.openExternal).toHaveBeenCalledExactlyOnceWith(COMFY_OFFICIAL_ACQUISITION_PAGE);
  });
  it('discovers statically and requires explicit consent before using any interpreter', async () => {
    const h = harness(); file(h.softwareHome, 'bundle/ComfyUI/main.py'); file(h.softwareHome, `bundle/python/${process.platform === 'win32' ? 'python.exe' : 'python'}`);
    const state = await h.setup.discover(); expect(state.discovery?.environments).toHaveLength(1); expect(h.adopt).not.toHaveBeenCalled();
    const candidate = state.discovery!.environments[0]; await expect(h.setup.adoptCandidate(candidate.id, false)).rejects.toThrow('CONFIRMATION_REQUIRED');
    await h.setup.adoptCandidate(candidate.id, true); expect(h.adopt).toHaveBeenCalledExactlyOnceWith(candidate.root, candidate.python);
  });
  it('rejects stale candidates rather than silently choosing another interpreter', async () => {
    const h = harness(); file(h.softwareHome, 'bundle/ComfyUI/main.py'); const python = file(h.softwareHome, `bundle/python/${process.platform === 'win32' ? 'python.exe' : 'python'}`);
    const candidate = (await h.setup.discover()).discovery!.environments[0]; fs.unlinkSync(python);
    await expect(h.setup.adoptCandidate(candidate.id, true)).rejects.toThrow('STALE_CANDIDATE'); expect(h.adopt).not.toHaveBeenCalled();
  });
  it('keeps a saved explicit Python current, exposes .ext as a separate confirmed choice and rejects stale configured paths', async () => {
    const h = harness(), bundle = path.join(h.root, 'existing-user-bundle'), executable = process.platform === 'win32' ? 'python.exe' : 'python';
    file(bundle, 'ComfyUI/main.py'); const python = file(bundle, `python/${executable}`), ext = file(bundle, `.ext/${executable}`);
    fs.chmodSync(python, 0o700); fs.chmodSync(ext, 0o700);
    let configured = detectInstallLayout(bundle, python);
    h.options.configuredInstall = async () => configured;
    const state = await h.setup.discover(), current = state.discovery!.current!, alternate = state.discovery!.environments.find(item => item.python === ext)!;
    expect(current).toMatchObject({ python, isCurrent: true }); expect(state.discovery!.conflict).toBe(true);
    expect(alternate.id).not.toBe(current.id); expect(h.adopt).not.toHaveBeenCalled();
    await expect(h.setup.adoptCandidate(alternate.id, false)).rejects.toThrow('CONFIRMATION_REQUIRED');
    await h.setup.adoptCandidate(alternate.id, true); expect(h.adopt).toHaveBeenCalledExactlyOnceWith(path.join(bundle, 'ComfyUI'), ext);
    const other = path.join(h.root, 'other-bundle'); file(other, 'ComfyUI/main.py'); const otherPython = file(other, `python/${executable}`);
    fs.chmodSync(otherPython, 0o700);
    configured = detectInstallLayout(other, otherPython);
    await expect(h.setup.adoptCandidate(current.id, true)).rejects.toThrow('STALE_CANDIDATE'); expect(h.adopt).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(python, 'utf8')).toBe('STATIC FIXTURE; DO NOT EXECUTE');
  });
  it('rechecks configured interpreter files and active-service lock immediately before adoption', async () => {
    const h = harness(), bundle = path.join(h.root, 'bundle'), executable = process.platform === 'win32' ? 'python.exe' : 'python';
    file(bundle, 'ComfyUI/main.py'); const python = file(bundle, `python/${executable}`);
    fs.chmodSync(python, 0o700);
    const configured = detectInstallLayout(bundle, python); h.options.configuredInstall = async () => configured;
    const candidate = (await h.setup.discover()).discovery!.current!;
    h.options.configurationLocked = () => true;
    await expect(h.setup.adoptCandidate(candidate.id, true)).rejects.toThrow('BUSY'); h.options.configurationLocked = () => false;
    fs.unlinkSync(python);
    await expect(h.setup.adoptCandidate(candidate.id, true)).rejects.toThrow('STALE_CANDIDATE'); expect(h.adopt).not.toHaveBeenCalled();
  });
  it('does not accept renderer-style IDs as arbitrary filesystem paths', async () => {
    const h = harness(); await expect(h.setup.adoptCandidate('C:/python.exe', true)).rejects.toThrow('INVALID_ID'); await expect(h.setup.createShortcut('../launcher.exe')).rejects.toThrow('INVALID_ID');
  });
  it('keeps the previous archive after native dialog cancellation and describes only a local hash', async () => {
    const h = harness(), archive = file(h.root, 'selected.zip', 'archive fixture'); h.chooseArchive.mockResolvedValueOnce(archive);
    const selected = await h.setup.chooseArchive(); expect(selected.package).toMatchObject({ source: 'user-import', officialHash: null, sha256: createHash('sha256').update('archive fixture').digest('hex') });
    expect((await h.setup.chooseArchive()).package).toEqual(selected.package); expect(h.adopt).not.toHaveBeenCalled();
  });
  it('requires source acknowledgement and refuses changed reviewed archive bytes', async () => {
    const h = harness(), archive = file(h.root, 'selected.zip', 'first'); h.chooseArchive.mockResolvedValueOnce(archive); await h.setup.chooseArchive();
    await expect(h.setup.install({ acknowledgeUnverifiedSource: false })).rejects.toThrow('CONFIRMATION_REQUIRED');
    fs.writeFileSync(archive, 'different'); await expect(h.setup.install({ acknowledgeUnverifiedSource: true })).rejects.toThrow('ARCHIVE_CHANGED'); expect(h.adopt).not.toHaveBeenCalled();
  });
  it('refuses a nonempty target without changing existing model or workflow bytes', async () => {
    const h = harness(); const target = path.join(h.root, 'existing'); const model = file(target, 'models/model.safetensors', 'pristine-model'); h.chooseDirectory.mockResolvedValueOnce(target);
    await expect(h.setup.chooseTargetDirectory()).rejects.toThrow('NOT_EMPTY'); expect(fs.readFileSync(model, 'utf8')).toBe('pristine-model');
  });
  it('never overwrites an existing shortcut and atomically creates a separate name', async () => {
    const h = harness(), root = path.join(h.root, 'managed'), launcher = file(root, '绘世启动器.exe', 'MZlocalfixture'); const sha = createHash('sha256').update('MZlocalfixture').digest('hex');
    file(h.desktopDirectory, '绘世启动器.lnk', 'ORIGINAL USER SHORTCUT');
    file(h.userData, 'comfyui-local/environments.json', JSON.stringify({ version: 1, data: { schema: 1, selectedRoot: root, environments: [{ id: 'managed-one', root, python: path.join(root, 'python/python.exe'), launcherPath: launcher, launcherSha256: sha, modelDirectory: null, createdAt: new Date().toISOString() }] } }));
    file(root, '.langbai-environment.json', JSON.stringify({ schema: 1, environment: { id: 'managed-one', launcherPath: launcher }, launcherSha256: sha }));
    const state = await h.setup.createShortcut('managed-one'); expect(path.basename(state.shortcutPath!)).toBe('绘世启动器 (2).lnk'); expect(fs.readFileSync(path.join(h.desktopDirectory, '绘世启动器.lnk'), 'utf8')).toBe('ORIGINAL USER SHORTCUT');
    expect(h.options.readShortcut(state.shortcutPath!).target).toBe(launcher); expect(h.adopt).not.toHaveBeenCalled();
  });
  it('refuses a launcher that no longer matches its local receipt fingerprint', async () => {
    const h = harness(), root = path.join(h.root, 'managed'), launcher = file(root, '绘世启动器.exe', 'MZchanged');
    file(h.userData, 'comfyui-local/environments.json', JSON.stringify({ version: 1, data: { schema: 1, selectedRoot: root, environments: [{ id: 'managed-one', root, python: path.join(root, 'python/python.exe'), launcherPath: launcher, launcherSha256: 'a'.repeat(64), modelDirectory: null, createdAt: new Date().toISOString() }] } }));
    file(root, '.langbai-environment.json', JSON.stringify({ schema: 1, environment: { id: 'managed-one', launcherPath: launcher }, launcherSha256: 'a'.repeat(64) }));
    await expect(h.setup.createShortcut('managed-one')).rejects.toThrow('LAUNCHER_CHANGED'); expect(fs.readdirSync(h.desktopDirectory)).toEqual([]);
  });
});
