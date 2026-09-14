import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const fixture = vi.hoisted(() => ({ items: [] as any[] }));
vi.mock('electron', () => ({ dialog: {}, shell: {} }));
vi.mock('./agent-store', () => ({ invalidateAgentHistoryImage: vi.fn() }));
vi.mock('./store', () => ({
  getHistory: () => fixture.items,
  updateHistoryItem: (id: string, changes: any) => Object.assign(fixture.items.find(i => i.id === id), changes),
}));
import { renameHistoryItem } from './storage';
let directory = '';
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-rename-audit-'));
  fixture.items = ['a','b'].map(id => ({ id, filePath: path.join(directory, id+'.png') }));
  await Promise.all(fixture.items.map(item => fs.writeFile(item.filePath, item.id)));
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('nai-rename-audit-')) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
describe('history image rename identity and collisions', () => {
  it('keeps independent bytes when two images are renamed to the same name concurrently', async () => {
    const results = await Promise.all(['a','b'].map(id => renameHistoryItem(id, 'new-name')));
    expect(results.every(result => result.ok)).toBe(true);
    expect(new Set(results.map(result => result.item?.filePath)).size).toBe(2);
    expect(await Promise.all(results.map(result => fs.readFile(result.item!.filePath,'utf8')))).toEqual(['a','b']);
  });
  it('returns a record-versioned URL immediately after rename', async () => {
    const result = await renameHistoryItem('a', 'new-name');
    expect(result.ok).toBe(true);
    expect(new URL(result.item!.fileUrl).searchParams.get('v')).toBe('a');
  });
  it('keeps the winning result when the same image is renamed twice concurrently', async () => {
    const results = await Promise.all(['first-name','second-name'].map(name => renameHistoryItem('a', name)));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(await fs.readFile(fixture.items[0].filePath, 'utf8')).toBe('a');
    expect((await fs.readdir(directory)).length).toBe(2);
  });
  it('does not overwrite a destination that already exists', async () => {
    const target = path.join(directory, 'new-name.png');
    await fs.writeFile(target, 'existing');
    const result = await renameHistoryItem('a', 'new-name');
    expect(result.ok).toBe(true);
    expect(await fs.readFile(target, 'utf8')).toBe('existing');
    expect(await fs.readFile(result.item!.filePath, 'utf8')).toBe('a');
  });
  it('retains the index when the source file is missing', async () => {
    const original = fixture.items[0].filePath;
    await fs.unlink(original);
    expect((await renameHistoryItem('a', 'new-name')).ok).toBe(false);
    expect(fixture.items[0].filePath).toBe(original);
  });
  it('rolls back its new copy when removing the old name fails', async () => {
    const original = fixture.items[0].filePath;
    const unlink = fs.unlink.bind(fs);
    vi.spyOn(fs, 'unlink').mockImplementation(async file => {
      if (file === original) throw Object.assign(new Error('fixture locked'), { code: 'EPERM' });
      return unlink(file);
    });
    expect((await renameHistoryItem('a', 'new-name')).ok).toBe(false);
    expect(fixture.items[0].filePath).toBe(original);
    expect(await fs.readFile(original, 'utf8')).toBe('a');
    expect((await fs.readdir(directory)).sort()).toEqual(['a.png','b.png']);
  });
});
