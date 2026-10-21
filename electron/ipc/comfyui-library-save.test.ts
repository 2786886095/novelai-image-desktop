import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
vi.mock('./local-media-protocol', () => ({ toLocalMediaUrl: () => 'nai-fixture://unused' }));
vi.mock('./comfyui-probe', () => ({ probeComfy: vi.fn(() => { throw new Error('NETWORK MUST NOT RUN'); }) }));
import { probeComfy } from './comfyui-probe';
import { ComfyLocalService, type StoredComfyWorkflow, type ComfyLocalServiceOptions, type TrustedComfyAnalysis } from './comfyui-service';
import { readWorkflowRecord, saveWorkflowRecord, updateWorkflowRecord } from './comfyui-config';
import { COMFY_LIMITS, type ComfyAnalysis, type ComfyRunRequest } from '../../src/comfyui/contract';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function record(id: string, format: 'api' | 'ui' = 'api'): StoredComfyWorkflow {
  const payload = format === 'api' ? { '4': { class_type: 'CLIPTextEncode', inputs: { text: 'source remains pristine' } } }
    : { nodes: [{ id: 4, type: 'CLIPTextEncode', widgets_values: ['source remains pristine'] }], links: [] };
  return { id, name: id, createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', sourceKind: format === 'api' ? 'api-json' : 'ui-json', sourceFormat: format,
    sourceSha256: hash(payload), fileName: 'original.json', templateName: null, familyLabel: null, lastAnalysis: null,
    payload, savedValues: { 'positive:4:text': 'last run', 'parameter:99:old_branch': 7 } };
}
async function fixture() {
  const base = process.env.COMFY_LIBRARY_SAVE_EVIDENCE_DIR || path.join(os.tmpdir(), 'comfy-library-save-tests');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'synthetic-')), profile = path.join(root, 'profile');
  await fs.mkdir(profile);
  const execute = vi.fn(() => { throw new Error('MODEL EXECUTION MUST NOT RUN'); });
  const options: ComfyLocalServiceOptions = { userData: profile, defaultOutputDirectory: () => path.join(root, 'out'),
    chooseDirectory: execute, choosePython: execute, chooseWorkflowFile: execute, revealResult: execute, openDirectory: execute,
    parseWorkflow: execute, analyze: execute, buildArgs: execute, presets: () => [] };
  return { root, profile, options, service: new ComfyLocalService(options), execute };
}
it.each(['api', 'ui'] as const)('saves a complete %s scalar snapshot in its own library record, preserves graph/source and survives reopening offline', async format => {
  const f = await fixture(), original = record('own-workflow', format);
  const source = path.join(f.root, 'original.json'), sourceBytes = JSON.stringify(original.payload);
  await fs.writeFile(source, sourceBytes); await saveWorkflowRecord(f.profile, original);
  const values = { 'positive:4:text': 'edited but never submitted', 'parameter:88:unseen_branch': true, 'parameter:15:number': .25 };
  expect(await f.service.saveWorkflowValues(original.id, values)).toMatchObject({ id: original.id, savedValues: values });
  const stored = await readWorkflowRecord<StoredComfyWorkflow>(f.profile, original.id);
  expect(stored).toMatchObject({ payload: original.payload, sourceSha256: original.sourceSha256, fileName: original.fileName, savedValues: values });
  expect(stored?.savedValues).not.toHaveProperty('parameter:99:old_branch');
  await f.service.renameWorkflow(original.id, '  Renamed local recipe  ');
  expect((await f.service.listWorkflows())[0]).toMatchObject({ name: 'Renamed local recipe', savedValues: values });
  const reopened = new ComfyLocalService(f.options);
  expect((await reopened.listWorkflows())[0]).toMatchObject({ id: original.id, savedValues: values });
  await reopened.saveWorkflowValues(original.id, {});
  expect((await reopened.listWorkflows())[0].savedValues).toEqual({});
  expect(await fs.readFile(source, 'utf8')).toBe(sourceBytes);
  expect(f.service.snapshot().phase).toBe('idle'); expect(f.execute).not.toHaveBeenCalled(); expect(probeComfy).not.toHaveBeenCalled();
});
it('makes a named new library copy from built-in or own records without modifying its source or transferring approval', async () => {
  const f = await fixture();
  for (const id of ['builtin-local-1-v1', 'own-source']) {
    const original = record(id); original.provenance = { kind: 'independently-authored-API-recipe', family: 'moss-image' };
    await saveWorkflowRecord(f.profile, original);
    const sourceBefore = await readWorkflowRecord(f.profile, id);
    const copied = await f.service.saveWorkflowAs(id, '  My named recipe  ', { 'parameter:other:branch': false });
    expect(copied.id).not.toBe(id); expect(copied.name).toBe('My named recipe'); expect(copied.lastAnalysis).toBeNull();
    expect(copied.savedValues).toEqual({ 'parameter:other:branch': false });
    const stored = await readWorkflowRecord<StoredComfyWorkflow>(f.profile, copied.id);
    expect(stored?.payload).toEqual(original.payload); expect(stored?.sourceSha256).toBe(original.sourceSha256);
    expect(stored).not.toHaveProperty('confirmations');
    expect(await readWorkflowRecord(f.profile, id)).toEqual(sourceBefore);
  }
  expect(f.execute).not.toHaveBeenCalled(); expect(probeComfy).not.toHaveBeenCalled();
});
it('protects reserved built-in records independently of names/family metadata and rejects invalid scalar dictionaries before writes', async () => {
  const f = await fixture(); await saveWorkflowRecord(f.profile, record('builtin-local-99-v3'));
  await saveWorkflowRecord(f.profile, record('own-id'));
  await expect(f.service.saveWorkflowValues('builtin-local-99-v3', {})).rejects.toThrow('COMFY_BUILTIN_WORKFLOW_READ_ONLY');
  await expect(f.service.renameWorkflow('builtin-local-99-v3', 'new')).rejects.toThrow('COMFY_BUILTIN_WORKFLOW_READ_ONLY');
  const ownBefore = await readWorkflowRecord(f.profile, 'own-id');
  const hostile: unknown[] = [null, [], new Date(), { nested: {} }, { array: [] }, { n: NaN }, { n: Infinity }, { n: undefined },
    JSON.parse('{"__proto__":true}'), { constructor: true }, { prototype: 'bad' }, { ['x'.repeat(257)]: true },
    { text: 'x'.repeat(COMFY_LIMITS.slotTextChars + 1) }, Object.fromEntries(Array.from({ length: COMFY_LIMITS.slotCount + 1 }, (_, i) => [`p${i}`, i]))];
  for (const values of hostile) await expect(f.service.saveWorkflowValues('own-id', values as never)).rejects.toThrow('COMFY_INVALID_SLOT');
  for (const name of ['', '   ', 'x\ny', 'x\0y', 'x'.repeat(COMFY_LIMITS.workflowNameChars + 1)]) await expect(f.service.saveWorkflowAs('own-id', name, {})).rejects.toThrow('COMFY_INVALID_WORKFLOW_NAME');
  await expect(f.service.saveWorkflowAs('missing', 'copy', {})).rejects.toThrow('COMFY_WORKFLOW_NOT_FOUND');
  await expect(f.service.saveWorkflowValues('../outside', {})).rejects.toThrow('COMFY_INVALID_ID');
  expect(await readWorkflowRecord(f.profile, 'own-id')).toEqual(ownBefore);
  expect(({} as { polluted?: unknown }).polluted).toBeUndefined(); expect(f.execute).not.toHaveBeenCalled();
});
it('atomically preserves a concurrent local Save and Rename when older analysis/compile metadata finishes later', async () => {
  const f = await fixture(), original = record('race-id'); await saveWorkflowRecord(f.profile, original);
  const internals = f.service as unknown as { analysis: Map<string, TrustedComfyAnalysis>; compile: (record: StoredComfyWorkflow, request: ComfyRunRequest) => Promise<unknown>; captureInventory: () => unknown; refreshInventorySnapshot: () => Promise<unknown>; checkInventorySnapshot: () => void; catalog: unknown; inventory: unknown; initialize: () => Promise<void> };
  const analysis = { ok: true, revision: 'fixture-revision', slots: [], issues: [], thirdParty: [], thirdPartyFingerprint: null, unverifiedConversion: false, cloudNodes: [], family: null, conversion: null } as unknown as ComfyAnalysis;
  const context: TrustedComfyAnalysis = { analysis, prompt: {}, values: { 'positive:4:text': 'old run parameters' }, compatibilityRevision: 'fixture-compatible' };
  const snapshot = { catalog: {}, inventory: { catalogRevision: 'fixture-catalog' } };
  internals.catalog = {}; internals.inventory = snapshot.inventory; internals.initialize = async () => undefined;
  internals.captureInventory = () => snapshot; internals.refreshInventorySnapshot = async () => snapshot; internals.checkInventorySnapshot = () => undefined;
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; });
  f.options.analyze = vi.fn(async () => { await gate; return context; });
  const pendingAnalysis = f.service.analyzeWorkflow(original.id, {});
  // Ensure its source read has completed without any network or real process.
  await vi.waitFor(() => expect(f.options.analyze).toHaveBeenCalled());
  const manual = { 'positive:4:text': 'newer explicitly saved parameters' };
  await f.service.saveWorkflowValues(original.id, manual); await f.service.renameWorkflow(original.id, 'newer name');
  finish(); await pendingAnalysis;
  expect(await readWorkflowRecord(f.profile, original.id)).toMatchObject({ name: 'newer name', savedValues: manual, lastAnalysis: { revision: 'fixture-revision' } });
  internals.analysis.set(original.id, context);
  await internals.compile(original, { workflowId: original.id, analysisRevision: analysis.revision, slotValues: {}, seedMode: 'fixed', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } });
  expect(await readWorkflowRecord(f.profile, original.id)).toMatchObject({ name: 'newer name', savedValues: manual });
  await updateWorkflowRecord<StoredComfyWorkflow>(f.profile, original.id, current => ({ ...current, savedValues: {} }));
  expect((await f.service.listWorkflows())[0].savedValues).toEqual({});
  expect(probeComfy).not.toHaveBeenCalled();
});
it('does not overwrite built-in values on compile, and saved copies still require fresh risk confirmations', async () => {
  const f = await fixture(), original = record('builtin-local-1-v1'); await saveWorkflowRecord(f.profile, original);
  const internals = f.service as unknown as { analysis: Map<string, TrustedComfyAnalysis>; compile: (record: StoredComfyWorkflow, request: ComfyRunRequest) => Promise<unknown>; refreshInventorySnapshot: () => Promise<unknown>; checkInventorySnapshot: () => void };
  const analysis = { ok: true, revision: 'fixture-revision', slots: [], issues: [], thirdParty: [], thirdPartyFingerprint: null, unverifiedConversion: false, cloudNodes: [], family: null, conversion: null } as unknown as ComfyAnalysis;
  const context: TrustedComfyAnalysis = { analysis, prompt: {}, values: { 'positive:4:text': 'actual submitted values' }, compatibilityRevision: 'fixture-compatible' };
  internals.refreshInventorySnapshot = async () => ({ catalog: {}, inventory: { catalogRevision: 'fixture-catalog' } }); internals.checkInventorySnapshot = () => undefined;
  f.options.analyze = vi.fn(async () => context); internals.analysis.set(original.id, context);
  const request: ComfyRunRequest = { workflowId: original.id, analysisRevision: analysis.revision, slotValues: {}, seedMode: 'fixed', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
  await internals.compile(original, request);
  expect((await readWorkflowRecord<StoredComfyWorkflow>(f.profile, original.id))?.savedValues).toEqual(original.savedValues);
  const copy = await f.service.saveWorkflowAs(original.id, 'Local copy, not approval', {});
  const copyRecord = (await readWorkflowRecord<StoredComfyWorkflow>(f.profile, copy.id))!;
  internals.analysis.set(copy.id, context); analysis.thirdPartyFingerprint = 'fixture-risk-fingerprint';
  await expect(internals.compile(copyRecord, { ...request, workflowId: copy.id })).rejects.toThrow('COMFY_THIRD_PARTY_CONFIRMATION_REQUIRED');
  analysis.thirdPartyFingerprint = null; analysis.unverifiedConversion = true;
  await expect(internals.compile(copyRecord, { ...request, workflowId: copy.id })).rejects.toThrow('COMFY_CONVERSION_CONFIRMATION_REQUIRED');
  expect(probeComfy).not.toHaveBeenCalled();
});
it('rejects a library create collision and forbidden updater identity changes without overwriting existing bytes', async () => {
  const f = await fixture(), original = record('collision-id'); await saveWorkflowRecord(f.profile, original);
  const file = path.join(f.profile, 'comfyui-local', 'workflows.json'), before = await fs.readFile(file);
  await expect(saveWorkflowRecord(f.profile, { ...original, name: 'must not replace' }, { createOnly: true })).rejects.toThrow('COMFY_WORKFLOW_ALREADY_EXISTS');
  await expect(updateWorkflowRecord<StoredComfyWorkflow>(f.profile, original.id, current => ({ ...current, id: 'changed-id' }))).rejects.toThrow('workflow update');
  expect(await fs.readFile(file)).toEqual(before);
});
it('keeps an existing analysis after a local save while compile still rechecks unconfirmed generation risks', async () => {
  const f = await fixture(), original = record('save-then-compile'); await saveWorkflowRecord(f.profile, original);
  const internals = f.service as unknown as { analysis: Map<string, TrustedComfyAnalysis>; compile: (record: StoredComfyWorkflow, request: ComfyRunRequest) => Promise<unknown>; refreshInventorySnapshot: () => Promise<unknown>; checkInventorySnapshot: () => void };
  const analysis = { ok: true, revision: 'fixture-same-values', slots: [], issues: [], thirdParty: [], thirdPartyFingerprint: null, unverifiedConversion: false, cloudNodes: [], family: null, conversion: null } as unknown as ComfyAnalysis;
  const values = { 'positive:4:text': 'current editor values' };
  const context: TrustedComfyAnalysis = { analysis, prompt: {}, values, compatibilityRevision: 'fixture-compatible' };
  internals.refreshInventorySnapshot = async () => ({ catalog: {}, inventory: { catalogRevision: 'fixture-catalog' } }); internals.checkInventorySnapshot = () => undefined;
  f.options.analyze = vi.fn(async () => context); internals.analysis.set(original.id, context);
  await f.service.saveWorkflowValues(original.id, values);
  expect(internals.analysis.get(original.id)).toBe(context);
  const saved = (await readWorkflowRecord<StoredComfyWorkflow>(f.profile, original.id))!;
  const request: ComfyRunRequest = { workflowId: original.id, analysisRevision: analysis.revision, slotValues: values, seedMode: 'fixed', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
  await expect(internals.compile(saved, request)).resolves.toMatchObject({ slotValues: values });
  analysis.thirdPartyFingerprint = 'new-third-party-risk';
  await expect(internals.compile(saved, request)).rejects.toThrow('COMFY_THIRD_PARTY_CONFIRMATION_REQUIRED');
  analysis.thirdPartyFingerprint = null; analysis.unverifiedConversion = true;
  await expect(internals.compile(saved, request)).rejects.toThrow('COMFY_CONVERSION_CONFIRMATION_REQUIRED');
  expect(probeComfy).not.toHaveBeenCalled();
});
it('drains an accepted pending local save before close, and rejects new library writes after close without initialization', async () => {
  const f = await fixture(), original = record('close-id'); await saveWorkflowRecord(f.profile, original);
  const rename = fs.rename.bind(fs);
  let commitReached!: () => void, releaseCommit!: () => void;
  const reached = new Promise<void>(resolve => { commitReached = resolve; });
  const gate = new Promise<void>(resolve => { releaseCommit = resolve; });
  let gated = false;
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (!gated && String(to) === path.join(f.profile, 'comfyui-local', 'workflows.json')) { gated = true; commitReached(); await gate; }
    await rename(from, to);
  });
  const saved = f.service.saveWorkflowValues(original.id, { 'positive:4:text': 'must survive close' });
  let closing: Promise<void> | undefined, closed = false;
  try {
    await reached;
    expect(f.service.needsQuitCleanup()).toBe(true);
    closing = f.service.shutdown().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(closed).toBe(false);
    await expect(f.service.saveWorkflowValues(original.id, {})).rejects.toThrow('COMFY_SHUTTING_DOWN');
    await expect(f.service.saveWorkflowAs(original.id, 'late copy', {})).rejects.toThrow('COMFY_SHUTTING_DOWN');
    await expect(f.service.renameWorkflow(original.id, 'late rename')).rejects.toThrow('COMFY_SHUTTING_DOWN');
    await expect(f.service.deleteWorkflow(original.id)).rejects.toThrow('COMFY_SHUTTING_DOWN');
  } finally { releaseCommit(); await saved; await closing; renameSpy.mockRestore(); }
  expect(await readWorkflowRecord(f.profile, original.id)).toMatchObject({ name: original.name, savedValues: { 'positive:4:text': 'must survive close' } });
  expect(f.execute).not.toHaveBeenCalled(); expect(probeComfy).not.toHaveBeenCalled();
});
it('settles a failed accepted save on close without hanging or corrupting the previous library', async () => {
  const f = await fixture(), original = record('failed-close-id'); await saveWorkflowRecord(f.profile, original);
  const rename = fs.rename.bind(fs);
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === path.join(f.profile, 'comfyui-local', 'workflows.json')) throw Object.assign(new Error('SYNTHETIC_DISK_FULL'), { code: 'ENOSPC' });
    await rename(from, to);
  });
  try {
    const save = f.service.saveWorkflowValues(original.id, { 'positive:4:text': 'cannot commit' });
    const rejected = expect(save).rejects.toThrow('SYNTHETIC_DISK_FULL');
    await f.service.shutdown(); await rejected;
  } finally { renameSpy.mockRestore(); }
  expect(f.service.needsQuitCleanup()).toBe(false);
  expect(await readWorkflowRecord(f.profile, original.id)).toEqual(original);
  expect(probeComfy).not.toHaveBeenCalled();
});
it('serializes a pending save with rename/delete without resurrecting a deleted record', async () => {
  const f = await fixture(), original = record('delete-race-id'); await saveWorkflowRecord(f.profile, original);
  (f.service as unknown as { initialize: () => Promise<void> }).initialize = async () => undefined;
  const rename = fs.rename.bind(fs);
  let commitReached!: () => void, releaseCommit!: () => void;
  const reached = new Promise<void>(resolve => { commitReached = resolve; });
  const gate = new Promise<void>(resolve => { releaseCommit = resolve; });
  let gated = false;
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (!gated && String(to) === path.join(f.profile, 'comfyui-local', 'workflows.json')) { gated = true; commitReached(); await gate; }
    await rename(from, to);
  });
  try {
    const save = f.service.saveWorkflowValues(original.id, { 'positive:4:text': 'accepted snapshot' });
    await reached;
    const renamed = f.service.renameWorkflow(original.id, 'accepted new name');
    const deleted = f.service.deleteWorkflow(original.id);
    releaseCommit();
    await save; await renamed; expect(await deleted).toEqual({ deleted: true });
    expect(await readWorkflowRecord(f.profile, original.id)).toBeNull();
    await expect(f.service.saveWorkflowValues(original.id, {})).rejects.toThrow('COMFY_WORKFLOW_NOT_FOUND');
    expect(await readWorkflowRecord(f.profile, original.id)).toBeNull();
  } finally { releaseCommit(); renameSpy.mockRestore(); }
  expect(f.execute).not.toHaveBeenCalled(); expect(probeComfy).not.toHaveBeenCalled();
});
