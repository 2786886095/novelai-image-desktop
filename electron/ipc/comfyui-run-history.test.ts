import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { readRunHistory, writeRunReceipt } from './comfyui-config';
import type { ComfyRunSnapshot } from '../../src/comfyui/contract';

const roots: string[] = [];
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'comfy-history-')));
  roots.push(root); return { root, profile: path.join(root, 'profile'), receipts: path.join(root, 'profile/comfyui-local/receipts') };
}
function snapshot(id: string, phase: ComfyRunSnapshot['phase'] = 'completed'): ComfyRunSnapshot {
  return { runId: id, workflowId: 'workflow-1', promptId: 'prompt-1', phase, queuePosition: null, currentNode: null,
    progress: null, nodesExecuted: 8, nodesTotal: 8, startedAt: '2026-10-20T00:00:00Z',
    finishedAt: ['completed', 'failed', 'cancelled'].includes(phase) ? '2026-10-20T00:00:01Z' : null,
    seeds: { seed: 42 }, error: null, results: [], nonImageOutputs: 0 };
}
async function raw(file: string, value: unknown) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); }
function envelope(value: unknown) { return { version: 1, updatedAt: '2026-10-20T00:00:01Z', data: { snapshot: value } }; }
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await fs.realpath(os.tmpdir()) || !path.basename(root).startsWith('comfy-history-')) throw new Error('UNSAFE_HISTORY_TEST_CLEANUP');
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('missing receipt storage is an empty history and reading it creates nothing', async () => {
  const f = await fixture(); expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: false });
  expect(await fs.readdir(f.root)).toEqual([]);
});
it('recovery is a whitelist summary and never returns persisted requests, media URLs or executable ownership', async () => {
  const f = await fixture(), value = snapshot('safe-summary');
  await writeRunReceipt(f.profile, value.runId, { snapshot: { ...value, pid: 1234, previewDataUrl: 'data:SECRET_PREVIEW', unexpected: { secret: 'SECRET_SNAPSHOT' },
    results: [{ fileUrl: 'data:UNTRUSTED_RESULT', slotValues: { secret: 'SECRET_PROMPT' } }] }, request: { secret: 'SECRET_REQUEST' }, target: { token: 'SECRET_TOKEN' }, compiledPrompt: { secret: 'SECRET_GRAPH' } });
  const file = path.join(f.receipts, value.runId + '.json'), before = await fs.readFile(file), restored = await readRunHistory(f.profile);
  expect(restored.incomplete).toBe(false); expect(restored.runs).toHaveLength(1);
  expect(restored.runs[0]).toMatchObject({ runId: value.runId, seeds: { seed: 42 }, results: [], history: { restored: true, status: 'recorded', resultCount: 1 } });
  expect(JSON.stringify(restored)).not.toMatch(/SECRET_|data:|pid|compiledPrompt/); expect(await fs.readFile(file)).toEqual(before);
});
it.each(['validating', 'submitting', 'queued', 'running', 'saving', 'cancelling'] as const)('restored %s retains its recorded phase but is explicitly unknown history', async phase => {
  const f = await fixture(), value = snapshot('unfinished-' + phase, phase); await writeRunReceipt(f.profile, value.runId, { snapshot: value });
  const restored = await readRunHistory(f.profile); expect(restored.runs[0]).toMatchObject({ phase, finishedAt: null, history: { restored: true, status: 'unknown' } });
});
it('invalid schemas and mismatched filename IDs are skipped without quarantining any original', async () => {
  const f = await fixture(); await writeRunReceipt(f.profile, 'good', { snapshot: snapshot('good') });
  await raw(path.join(f.receipts, 'different-id.json'), envelope(snapshot('not-the-file-id')));
  await raw(path.join(f.receipts, 'invalid-phase.json'), envelope({ ...snapshot('invalid-phase'), phase: 'new-untrusted-phase' }));
  await raw(path.join(f.receipts, 'invalid-time.json'), envelope({ ...snapshot('invalid-time'), startedAt: 'invalid' }));
  await fs.writeFile(path.join(f.receipts, 'broken.json'), '{literal broken receipt');
  const names = await fs.readdir(f.receipts), before = new Map(await Promise.all(names.map(async name => [name, digest(await fs.readFile(path.join(f.receipts, name)))] as const)));
  const restored = await readRunHistory(f.profile); expect(restored.runs.map(row => row.runId)).toEqual(['good']); expect(restored.incomplete).toBe(true);
  expect(await fs.readdir(f.receipts)).toEqual(names);
  for (const name of names) expect(digest(await fs.readFile(path.join(f.receipts, name)))).toBe(before.get(name));
});
it('snapshot prototype keys and unbounded error/seed structures cannot escape the whitelist', async () => {
  const f = await fixture(); await raw(path.join(f.receipts, 'bad-seeds.json'), envelope({ ...snapshot('bad-seeds'), seeds: JSON.parse('{"__proto__":1}') }));
  await raw(path.join(f.receipts, 'bad-error.json'), envelope({ ...snapshot('bad-error'), error: { code: 'x', message: 'x'.repeat(4097), nodeErrors: [] } }));
  expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: true }); expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
});
it('linked receipt storage is refused without enumerating or modifying its destination', async () => {
  const f = await fixture(), outside = path.join(f.root, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'sentinel.txt'), 'NEVER_TOUCH_OUTSIDE');
  await fs.mkdir(path.dirname(f.receipts), { recursive: true }); await fs.symlink(outside, f.receipts, process.platform === 'win32' ? 'junction' : 'dir');
  const before = await fs.readFile(path.join(outside, 'sentinel.txt')); expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: true });
  expect(await fs.readFile(path.join(outside, 'sentinel.txt'))).toEqual(before); expect((await fs.lstat(f.receipts)).isSymbolicLink()).toBe(true);
});
it('oversized receipt metadata is refused before file content is opened and the sparse original is preserved', async () => {
  const f = await fixture(); await fs.mkdir(f.receipts, { recursive: true }); const large = path.join(f.receipts, 'oversized.json');
  const file = await fs.open(large, 'wx'); await file.truncate(64 * 1024 * 1024 + 1); await file.close();
  const open = vi.spyOn(fs, 'open'); expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: true }); expect(open).not.toHaveBeenCalled();
  expect((await fs.stat(large)).size).toBe(64 * 1024 * 1024 + 1);
});
it('directory scanning stops at its explicit entry budget, closes the handle and reports incomplete', async () => {
  const f = await fixture(); await fs.mkdir(f.receipts, { recursive: true });
  const read = vi.fn(async () => ({ name: 'ignored.tmp', isFile: () => false, isSymbolicLink: () => false })), close = vi.fn(async () => {});
  vi.spyOn(fs, 'opendir').mockResolvedValue({ read, close } as never);
  expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: true }); expect(read).toHaveBeenCalledTimes(20000); expect(close).toHaveBeenCalledOnce();
});
it('charges the complete receipt budget before reads so repeated partial I/O failures cannot bypass it', async () => {
  const f = await fixture(); await fs.mkdir(f.receipts, { recursive: true });
  const files = ['partial-a', 'partial-b', 'partial-c'].map(id => path.join(f.receipts, id + '.json'));
  for (const name of files) { const file = await fs.open(name, 'wx'); await file.truncate(24 * 1024 * 1024); await file.close(); }
  const before = new Map(await Promise.all(files.map(async name => [name, digest(await fs.readFile(name))] as const)));
  const originalOpen = fs.open.bind(fs), reads: Array<ReturnType<typeof vi.fn>> = [], closes: Array<ReturnType<typeof vi.fn>> = [];
  const open = vi.spyOn(fs, 'open').mockImplementation((async (filePath: string, flags: string) => {
    const file = await originalOpen(filePath, flags);
    if (!files.includes(String(filePath)) || flags !== 'r') return file;
    let calls = 0;
    const read = vi.fn(async () => { if (calls++ === 0) return { bytesRead: 1 }; throw new Error('SYNTHETIC_PARTIAL_READ_EIO'); });
    const close = vi.fn(() => file.close()); reads.push(read); closes.push(close);
    return { stat: () => file.stat(), read, close } as never;
  }) as typeof fs.open);
  expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: true });
  // Two 24 MiB + guard reservations fit; the third must never be opened,
  // even though both earlier files failed after returning just one byte.
  expect(open).toHaveBeenCalledTimes(2); expect(reads).toHaveLength(2);
  for (const read of reads) expect(read).toHaveBeenCalledTimes(2);
  for (const close of closes) expect(close).toHaveBeenCalledOnce();
  open.mockRestore(); for (const name of files) expect(digest(await fs.readFile(name))).toBe(before.get(name));
});
it('a linked receipt entry does not read the linked directory or create a quarantine file', async () => {
  const f = await fixture(), outside = path.join(f.root, 'outside'); await fs.mkdir(f.receipts, { recursive: true }); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'safe.txt'), 'KEEP'); await fs.symlink(outside, path.join(f.receipts, 'linked.json'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(await readRunHistory(f.profile)).toEqual({ runs: [], incomplete: true }); expect(await fs.readdir(outside)).toEqual(['safe.txt']);
  expect(fsSync.existsSync(path.join(f.receipts, 'linked.json.corrupt'))).toBe(false);
});
