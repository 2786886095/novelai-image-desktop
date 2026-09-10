import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSafeDataDirectory, assertUpdateOutputProtection, isInstallationDataPath } from './update-output-protection';

let root: string;
let install: string;
let outside: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-update-output-'));
  install = path.join(root, 'App 中文'); outside = path.join(root, 'App 中文-pictures');
  fs.mkdirSync(install); fs.mkdirSync(outside);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const data = (outputDir: string, history: unknown[] = []) => ({settings: {outputDir}, history});

describe('update output data protection', () => {
  it('blocks arbitrary custom names and the install root itself', () => {
    for (const dir of [install, path.join(install, '我的图片', '2026-09-10'), path.join(install, 'saved')]) {
      expect(() => assertSafeDataDirectory(dir, install)).toThrow('安装目录');
      expect(() => assertUpdateOutputProtection(install, data(dir))).toThrow('更新已停止');
    }
  });
  it('allows sibling names and unrelated external output without changing files', () => {
    fs.writeFileSync(path.join(outside, 'image.webp'), 'image');
    expect(isInstallationDataPath(outside, install)).toBe(false);
    expect(() => assertUpdateOutputProtection(install, data(outside))).not.toThrow();
    expect(fs.readFileSync(path.join(outside, 'image.webp'), 'utf8')).toBe('image');
  });
  it('blocks traversal back into installation and not-yet-created output folders', () => {
    expect(() => assertSafeDataDirectory(path.join(outside, '..', path.basename(install), 'new'), install)).toThrow();
  });
  it('checks gallery downloads, logs and user backups too', () => {
    for (const key of ['onlineGalleryDownloadDir', 'backupDir', 'logDir']) {
      expect(() => assertUpdateOutputProtection(install, {settings: {outputDir: outside, [key]: path.join(install, key)}})).toThrow();
    }
  });
  it('keeps previous output images protected after the selected directory changes', () => {
    const old = path.join(install, 'old', 'image.png'); fs.mkdirSync(path.dirname(old)); fs.writeFileSync(old, 'original');
    expect(() => assertUpdateOutputProtection(install, data(outside, [{filePath: old}]))).toThrow('更新已停止');
    expect(fs.readFileSync(old, 'utf8')).toBe('original');
  });
  it('does not block already-moved historical paths that no longer exist', () => {
    expect(() => assertUpdateOutputProtection(install, data(outside, [{filePath: path.join(install, 'gone.png')}]))).not.toThrow();
  });
  it('blocks the legacy outputs tree without copying or deleting it', () => {
    const folder = path.join(install, 'outputs'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'a.png'), 'png');
    expect(() => assertUpdateOutputProtection(install, data(outside))).toThrow();
    expect(fs.readFileSync(path.join(folder, 'a.png'), 'utf8')).toBe('png');
  });
  it('fails closed on malformed persisted settings', () => {
    expect(() => assertUpdateOutputProtection(install, null)).toThrow();
    expect(() => assertUpdateOutputProtection(install, {})).toThrow();
    expect(() => assertSafeDataDirectory('relative/folder', install)).toThrow();
  });
  it('resolves junction aliases including missing children', () => {
    const alias = path.join(root, 'alias'); fs.symlinkSync(install, alias, 'junction');
    expect(() => assertSafeDataDirectory(path.join(alias, 'future'), install)).toThrow();
    expect(() => assertUpdateOutputProtection(install, data(alias))).toThrow();
  });
  it('blocks an in-install junction even when its physical target is external', () => {
    const link = path.join(install, 'linked'); fs.symlinkSync(outside, link, 'junction');
    expect(() => assertSafeDataDirectory(link, install)).toThrow();
  });
  it('retains protection for custom recovery sources even after the notice is dismissed', () => {
    const old = path.join(install, 'images'); fs.mkdirSync(old); fs.writeFileSync(path.join(old, 'late.png'), 'newly-added');
    const next = data(outside); (next.settings as any).protectedOutputPaths = [old];
    expect(() => assertUpdateOutputProtection(install, next)).toThrow('更新已停止');
  });
  it('also protects the adjacent Tavern workspace', () => {
    const folder = path.join(install, 'LangbaiWorkspace'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder,'agent-workspace.json'), '{}');
    expect(() => assertUpdateOutputProtection(install, data(outside))).toThrow('LangbaiWorkspace');
  });

  it('stops rather than ignoring a malformed persisted directory value', () => {
    const next = data(outside); (next.settings as any).outputDir = 42;
    expect(() => assertUpdateOutputProtection(install, next)).toThrow('格式无效');
  });

});
