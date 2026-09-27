import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import JSZip from 'jszip';
vi.mock('../ipc/local-media-protocol', () => ({ toLocalMediaUrl: (file: string) => `file://${file}` }));
import { exportReferenceBackup, importReferenceBackup } from './reference-backup';
import type { ReferenceState } from '../../src/artist-comparison/reference-types';
const roots: string[] = [];
function root() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-backup-')); roots.push(dir); return dir; }
function empty(): ReferenceState { return { version: 1, records: {}, queue: [], running: false, paused: true }; }
afterEach(() => { roots.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })); roots.length = 0; });
it('round trips portable images and preserves an existing reference choice', async () => {
  const source = root(), target = root();
  fs.mkdirSync(path.join(source, 'covers'));
  const file = path.join(source, 'covers', 'test.jpg');
  await sharp({ create: { width: 320, height: 160, channels: 3, background: '#446655' } }).jpeg().toFile(file);
  const state = empty();
  state.records.alpha = { tag: 'alpha', postCount: 486, cover: { filePath: file, imageUrl: 'private-file-url', postId: 42, postUrl: 'https://danbooru.donmai.us/posts/42', sourceUrl: 'https://cdn.donmai.us/test.jpg', width: 320, height: 160, savedAt: 1 } };
  const archive = path.join(source, 'backup.zip');
  await exportReferenceBackup(source, state, archive);
  const zip = await JSZip.loadAsync(fs.readFileSync(archive));
  const manifest = await zip.file('references.json')!.async('string');
  expect(manifest).not.toContain(source);
  expect(manifest).not.toContain('private-file-url');
  const index = path.join(target, 'references.v1.json');
  expect(await importReferenceBackup(target, index, empty(), archive)).toBe(1);
  const restored = JSON.parse(fs.readFileSync(index, 'utf8')) as ReferenceState;
  expect(restored.records.alpha.postCount).toBe(486);
  const metadata = await sharp(restored.records.alpha.cover!.filePath!).metadata();
  expect(metadata.width).toBe(320); expect(metadata.height).toBe(160);
  restored.records.alpha.postCount = 99;
  expect(await importReferenceBackup(target, index, restored, archive)).toBe(0);
  expect(JSON.parse(fs.readFileSync(index, 'utf8')).records.alpha.postCount).toBe(99);
});
it('rejects malicious archive paths before committing the index', async () => {
  const target = root(), zip = new JSZip();
  zip.file('references.json', JSON.stringify({ version: 1, records: { alpha: { tag: 'alpha', asset: '../secret.jpg', cover: { postId: 1 } } } }));
  const input = path.join(target, 'bad.zip'), index = path.join(target, 'references.v1.json');
  fs.writeFileSync(input, await zip.generateAsync({ type: 'nodebuffer' }));
  await expect(importReferenceBackup(target, index, empty(), input)).rejects.toThrow();
  expect(fs.existsSync(index)).toBe(false);
});
it('refuses import while an in-flight paused queue item is finishing', async () => {
  const state = empty(); state.queue = [{ tag: 'alpha', status: 'running' }];
  await expect(importReferenceBackup(root(), '/unused', state, '/unused')).rejects.toThrow('暂停');
});
