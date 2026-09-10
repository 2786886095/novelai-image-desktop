import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'langbai-install-guard-'));
  roots.push(root);
  const install = path.join(root, 'install');
  const external = path.join(root, 'external');
  const appData = path.join(root, 'AppData');
  const store = path.join(appData, 'novelai-image-desktop', 'novelai-image-desktop.json');
  for (const p of [install, external, path.dirname(store)]) fs.mkdirSync(p, { recursive: true });
  const write = (data: unknown) => fs.writeFileSync(store, JSON.stringify(data));
  const run = () => {
    const started = performance.now();
    const p = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.resolve('build/protect-update-data.ps1'), '-InstallDir', install, '-AppDataDir', appData],
    { encoding: 'utf8', timeout: 20_000, windowsHide: true });
    return { code: p.status, output: p.stdout, error: p.error, ms: performance.now() - started };
  };
  return { root, install, external, store, write, run };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('langbai-install-guard-')) throw Error('Unexpected fixture root');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'win32')('actual NSIS PowerShell data guard', () => {
  it('checks 10,000 external history records within the installer timeout without changing files', () => {
    const f = fixture();
    const image = path.join(f.external, 'image.png');
    fs.writeFileSync(image, 'external sentinel');
    f.write({ settings: { outputDir: f.external }, history: Array.from({ length: 10_000 }, () => ({ filePath: image })) });
    const before = fs.readFileSync(f.store);
    const result = f.run();
    expect(result.error).toBeUndefined();
    expect(result.code).toBe(0);
    expect(result.output).toContain('UPDATE_DATA_CHECK_OK');
    expect(result.ms).toBeLessThan(20_000);
    expect(fs.readFileSync(f.store)).toEqual(before);
    expect(fs.readFileSync(image, 'utf8')).toBe('external sentinel');
  }, 30_000);

  for (const folder of ['outputs', 'LangbaiWorkspace']) {
    it(`stops immediately for ${folder}, even if settings are corrupt`, () => {
      const f = fixture();
      fs.mkdirSync(path.join(f.install, folder));
      fs.writeFileSync(path.join(f.install, folder, 'sentinel'), 'keep');
      fs.writeFileSync(f.store, '{corrupt');
      expect(f.run().code).toBe(20);
      expect(fs.readFileSync(path.join(f.install, folder, 'sentinel'), 'utf8')).toBe('keep');
    });
  }
  for (const field of ['outputDir', 'onlineGalleryDownloadDir', 'backupDir', 'logDir']) {
    it(`protects a custom nested ${field}`, () => {
      const f = fixture();
      f.write({ settings: { outputDir: f.external, [field]: path.join(f.install, 'custom', 'nested') }, history: [] });
      expect(f.run().code).toBe(20);
    });
  }
  it('protects files referenced only by history and ignores missing historical files', () => {
    const f = fixture();
    const image = path.join(f.install, 'historical.png');
    f.write({ settings: { outputDir: f.external }, history: [{ filePath: image }] });
    expect(f.run().code).toBe(0);
    fs.writeFileSync(image, 'history sentinel');
    expect(f.run().code).toBe(20);
    expect(fs.readFileSync(image, 'utf8')).toBe('history sentinel');
  });
  it('resolves a junction parent into the installation directory', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.install, 'history.png'), 'linked sentinel');
    const alias = path.join(f.external, 'alias');
    fs.symlinkSync(f.install, alias, 'junction');
    f.write({ settings: { outputDir: f.external }, history: [{ filePath: path.join(alias, 'history.png') }] });
    expect(f.run().code).toBe(20);
    expect(fs.readFileSync(path.join(f.install, 'history.png'), 'utf8')).toBe('linked sentinel');
  });
  it('fails closed on invalid settings and reads a backup when the primary is absent', () => {
    const f = fixture();
    fs.writeFileSync(f.store, '{broken');
    expect(f.run().code).toBe(21);
    f.write({ settings: { outputDir: f.install }, history: [] });
    fs.renameSync(f.store, f.store + '.bak');
    expect(f.run().code).toBe(20);
  });
});
