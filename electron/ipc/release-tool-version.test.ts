import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const scratch: string[] = [];
const load = createRequire(import.meta.url);
const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
function temp() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-version-')); scratch.push(dir); return dir; }
function put(dir: string, file: string, value: string | Buffer) {
  const target = path.join(dir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value);
}
function cli(script: string, args: string[], cwd = root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd, encoding: 'utf8', timeout: 15000 });
}
afterEach(() => { for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('release tools use authoritative source version without weakening mismatches', () => {
  it('accepts the current and future source versions rather than a previous-release literal', () => {
    const helper = load(path.join(root, 'scripts/release-version.cjs'));
    for (const version of [current, '9.8.7']) {
      const dir = temp(); put(dir, 'package.json', JSON.stringify({ version }));
      expect(helper.readReleaseVersion(dir)).toBe(version);
      expect(helper.assertPackagedVersion(version, version)).toBe(version);
    }
  });
  it('rejects missing or malformed expected versions', () => {
    const helper = load(path.join(root, 'scripts/release-version.cjs'));
    for (const version of [undefined, '', 'latest', '../2.5.9']) expect(() => helper.validateReleaseVersion(version)).toThrow();
  });
  it('rejects stale packaged versions even when both are valid versions', () => {
    const helper = load(path.join(root, 'scripts/release-version.cjs'));
    expect(() => helper.assertPackagedVersion('2.5.8', current)).toThrow('Wrong packaged version');
  });
  it('actual accounts probe accepts matching version before attempting module loading', () => {
    const dir = temp(); put(dir, 'package.json', JSON.stringify({ version: current }));
    const result = cli('packaged-accounts-probe.cjs', [dir, current]);
    expect(result.status).toBe(1); // Deliberately incomplete package, no login or paid call.
    expect(result.stderr).not.toContain('Wrong packaged version');
    expect(result.stderr).toContain('nai-accounts-vault.js');
  });
  it('actual accounts probe rejects stale bytes before attempting module loading', () => {
    const dir = temp(); put(dir, 'package.json', JSON.stringify({ version: '2.5.8' }));
    const result = cli('packaged-accounts-probe.cjs', [dir, current]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Wrong packaged version');
    expect(result.stderr).not.toContain('nai-accounts-vault.js');
  });
  it('actual accounts probe refuses a missing authoritative expected version', () => {
    const dir = temp(); put(dir, 'package.json', JSON.stringify({ version: current }));
    const result = cli('packaged-accounts-probe.cjs', [dir]);
    expect(result.status).toBe(1); expect(result.stderr).toContain('Missing expected release version');
  });
  it('actual font asset probe checks matching source and packaged bytes at current version', () => {
    const source = temp(), packaged = temp();
    for (const dir of [source, packaged]) put(dir, 'package.json', JSON.stringify({ version: current }));
    const digest = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
    const rows = Array.from({ length: 6 }, (_, index) => {
      const bytes = Buffer.from(`synthetic font ${index}`), license = Buffer.from('synthetic SIL Open Font License');
      const file = `${index}.woff2`, licenseFile = `${index}.txt`;
      put(source, `public/ui-fonts/${file}`, bytes);
      put(packaged, `dist/ui-fonts/${file}`, bytes); put(packaged, `dist/ui-fonts/${licenseFile}`, license);
      return { id: String(index), file, licenseFile, bytes: bytes.length, sha256: digest(bytes), licenseSha256: digest(license) };
    });
    put(packaged, 'dist/ui-fonts/catalog.json', JSON.stringify(rows));
    put(packaged, 'THIRD_PARTY_NOTICES.md', 'SIL Open Font License');
    const pass = cli('packaged-font-assets-probe.cjs', [packaged, source]);
    expect(pass.status, pass.stderr).toBe(0); expect(JSON.parse(pass.stdout).version).toBe(current);
    put(packaged, 'package.json', JSON.stringify({ version: '2.5.8' }));
    const fail = cli('packaged-font-assets-probe.cjs', [packaged, source]);
    expect(fail.status).toBe(1); expect(fail.stderr).toContain('Wrong packaged version');
  });
  it('metadata verifier reads real current desktop versions and current-only notes', () => {
    const result = cli('verify-release-windows-metadata.cjs', []);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ version: current, pass: true });
  });
  it('native runtime caller passes source-derived expected version to the package probe', () => {
    const source = fs.readFileSync(path.join(root, 'scripts/verify-packaged-runtime.mjs'), 'utf8');
    expect(source).toContain('const expectedVersion=readReleaseVersion(root)');
    expect(source).toContain("path.resolve('scripts/packaged-accounts-probe.cjs'),appRoot,expectedVersion");
    expect(fs.readFileSync(path.join(root, 'scripts/verify-packaged-fonts.cjs'), 'utf8')).toContain('version:readReleaseVersion(process.cwd())');
  });
});
