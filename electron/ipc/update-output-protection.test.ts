import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSafeDataDirectory, isInstallationDataPath, PROTECTED_DIRECTORY_KEYS } from './update-output-protection';

let root: string;
let install: string;
let outside: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-update-output-'));
  install = path.join(root, 'App 中文'); outside = path.join(root, 'App 中文-pictures');
  fs.mkdirSync(install); fs.mkdirSync(outside);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('installation directory data protection', () => {
  it('blocks arbitrary custom names and the install root itself', () => {
    for (const dir of [install, path.join(install, '我的图片', '2026-09-10'), path.join(install, 'saved')]) {
      expect(() => assertSafeDataDirectory(dir, install)).toThrow('安装目录');
    }
  });
  it('allows sibling names and unrelated external output without changing files', () => {
    fs.writeFileSync(path.join(outside, 'image.webp'), 'image');
    expect(isInstallationDataPath(outside, install)).toBe(false);
    expect(() => assertSafeDataDirectory(outside, install)).not.toThrow();
    expect(fs.readFileSync(path.join(outside, 'image.webp'), 'utf8')).toBe('image');
  });
  it('blocks traversal back into installation and not-yet-created output folders', () => {
    expect(() => assertSafeDataDirectory(path.join(outside, '..', path.basename(install), 'new'), install)).toThrow();
  });
  it('guards gallery downloads, logs and user backups too', () => {
    expect([...PROTECTED_DIRECTORY_KEYS]).toEqual(['outputDir', 'onlineGalleryDownloadDir', 'backupDir', 'logDir']);
  });
  it('fails closed on relative folders', () => {
    expect(() => assertSafeDataDirectory('relative/folder', install)).toThrow();
  });
  it('resolves junction aliases including missing children', () => {
    const alias = path.join(root, 'alias'); fs.symlinkSync(install, alias, 'junction');
    expect(() => assertSafeDataDirectory(path.join(alias, 'future'), install)).toThrow();
    expect(() => assertSafeDataDirectory(alias, install)).toThrow();
  });
  it('blocks an in-install junction even when its physical target is external', () => {
    const link = path.join(install, 'linked'); fs.symlinkSync(outside, link, 'junction');
    expect(() => assertSafeDataDirectory(link, install)).toThrow();
  });
});
