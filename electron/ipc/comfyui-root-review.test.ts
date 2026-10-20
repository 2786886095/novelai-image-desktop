import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';

// Review fault injection only: NO ComfyUI/Electron/process/socket is started.
const hooks = vi.hoisted(() => ({
  probe: vi.fn(), catalog: null as unknown,
  random: vi.fn((min: number, max: number) => max - 1),
}));
vi.mock('node:crypto', async importOriginal => ({ ...await importOriginal<typeof import('node:crypto')>(), randomInt: hooks.random }));
vi.mock('./comfyui-probe', async importOriginal => ({ ...await importOriginal<typeof import('./comfyui-probe')>(), probeComfy: hooks.probe }));
vi.mock('./comfyui-http', async importOriginal => ({ ...await importOriginal<typeof import('./comfyui-http')>(),
  comfyGetJson: vi.fn(async (_target: unknown, route: string) => route === '/object_info' ? hooks.catalog : []),
}));
vi.mock('./local-media-protocol', () => ({ toLocalMediaUrl: (file: string) => 'nai-review:///' + encodeURIComponent(file) }));
import { ComfyLocalService, type ComfyLocalServiceOptions, type StoredComfyWorkflow } from './comfyui-service';
import { parseComfyWorkflow, analyzeComfyWorkflow } from './comfyui-analysis';
import { buildComfyArgs } from '../../src/comfyui/launch-args';
import { rawCoreCatalog, corePrompt } from '../../src/comfyui/core.test-fixtures';
import { readWorkflowRecord } from './comfyui-config';
import type { ComfyRunRequest } from '../../src/comfyui/contract';

const roots: string[] = [];
const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const free = () => ({ kind: 'free', target: { host: '127.0.0.1', port: 8188, baseUrl: 'http://127.0.0.1:8188' } });
async function service() {
  const parent = process.env.COMFY_ROOT_REVIEW_EVIDENCE_DIR || os.tmpdir(); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'comfy-root-review-')); roots.push(root);
  const originalStore = path.join(root, 'novelai-image-desktop.json'); await fs.writeFile(originalStore, '{"synthetic-account-sentinel":"never overwrite"}');
  const originalSha = hash(await fs.readFile(originalStore));
  const options: ComfyLocalServiceOptions = { userData: root, defaultOutputDirectory: () => path.join(root, 'output'),
    chooseDirectory: async () => null, choosePython: async () => null, chooseWorkflowFile: async () => null,
    revealResult: vi.fn(), openDirectory: vi.fn(async () => undefined), parseWorkflow: parseComfyWorkflow, analyze: analyzeComfyWorkflow,
    buildArgs: config => buildComfyArgs(config.install, config.launch),
    supervisor: { spawn: vi.fn(() => { throw new Error('REVIEW_MUST_NOT_SPAWN'); }) as unknown as NonNullable<ComfyLocalServiceOptions['supervisor']>['spawn'] },
  };
  return { subject: new ComfyLocalService(options), root, originalStore, originalSha };
}
function evidence(root: string, name: string, data: unknown) { fsSync.writeFileSync(path.join(root, name + '.json'), JSON.stringify(data, null, 2)); }
afterEach(async () => {
  vi.restoreAllMocks(); hooks.probe.mockReset(); hooks.random.mockClear();
  if (!process.env.COMFY_ROOT_REVIEW_EVIDENCE_DIR) for (const root of roots) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('comfy-root-review-')) throw new Error('UNSAFE_REVIEW_CLEANUP');
    await fs.rm(root, { recursive: true, force: true });
  }
  roots.length = 0;
});

it('pending start/connect/run are visible to quit; shutdown blocks old/new admission, update-failure resume only reopens after cleanup', async () => {
  for (const operation of ['start', 'connect', 'run'] as const) {
  const gate = deferred<ReturnType<typeof free>>(), entered = deferred<void>();
  hooks.probe.mockImplementation(async () => { entered.resolve(); return gate.promise; });
  const f = await service();
  // The real public start() is intentionally paused inside initialize(). The
  // Supervisor spy avoids any install help, HTTP, Python or GPU operation.
  let shutDownFinished = false;
  const startSupervisor = vi.spyOn(f.subject.supervisor, 'start').mockImplementation(async () => f.subject.supervisor.snapshot());
  const connectSupervisor = vi.spyOn(f.subject.supervisor, 'connect').mockImplementation(async () => f.subject.supervisor.snapshot());
  const runJob = vi.spyOn(f.subject.jobs, 'run').mockRejectedValue(new Error('REVIEW_MUST_NOT_START_JOB'));
  const cleanupGate = deferred<void>(), cleanupEntered = deferred<void>();
  const disconnect = vi.spyOn(f.subject.supervisor, 'disconnect').mockImplementation(async () => { cleanupEntered.resolve(); await cleanupGate.promise; return f.subject.supervisor.snapshot(); });
  const request: ComfyRunRequest = { workflowId: 'unused-review-workflow', analysisRevision: 'unused', slotValues: {}, seedMode: 'fixed', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
  const invoke = () => operation === 'run' ? f.subject.run(request) : f.subject[operation]();
  const starting = invoke().then(value => ({ value, error: null }), error => ({ value: null, error: String(error) }));
  await entered.promise;
  const needsCleanupDuringPendingStart = f.subject.needsQuitCleanup();
  const stopping = f.subject.shutdown().then(() => { shutDownFinished = true; });
  await cleanupEntered.promise;
  f.subject.resumeAfterUpdateFailure();
  await expect(f.subject.start()).rejects.toThrow('COMFY_SHUTTING_DOWN');
  cleanupGate.resolve();
  // Resolve after cleanup has had a turn, without requiring shutdown to ignore
  // its pending initialization. A correct barrier may await it or reject start.
  await new Promise(r => setTimeout(r, 0)); const shutdownReturnedBeforeInit = shutDownFinished;
  gate.resolve(free()); const startResult = await starting; await stopping;
  const originalUnchanged = hash(await fs.readFile(f.originalStore)) === f.originalSha;
  evidence(f.root, 'pending-' + operation + '-quit', { noProcessOrNetwork: true, needsCleanupDuringPendingStart, shutdownReturnedBeforeInit,
    supervisorStartCallsAfterShutdownWasRequested: startSupervisor.mock.calls.length, supervisorConnectCalls: connectSupervisor.mock.calls.length, jobRunCalls: runJob.mock.calls.length, startResult, originalProfileUnchanged: originalUnchanged });
  expect(originalUnchanged).toBe(true);
  expect(startSupervisor, 'shutdown must prevent the earlier admitted start from entering Supervisor afterwards').not.toHaveBeenCalled();
  expect(connectSupervisor).not.toHaveBeenCalled(); expect(runJob).not.toHaveBeenCalled(); expect(disconnect).toHaveBeenCalledOnce();
  expect(needsCleanupDuringPendingStart).toBe(true);
  expect(startResult.error).toContain('COMFY_SHUTTING_DOWN');
  await expect(f.subject.start()).rejects.toThrow('COMFY_SHUTTING_DOWN');
  await expect(f.subject.connect()).rejects.toThrow('COMFY_SHUTTING_DOWN');
  await expect(f.subject.run(request)).rejects.toThrow('COMFY_SHUTTING_DOWN');
  f.subject.resumeAfterUpdateFailure();
  await f.subject.start(); expect(startSupervisor).toHaveBeenCalledOnce();
  f.subject.shutdownSync(); await expect(f.subject.start()).rejects.toThrow('COMFY_SHUTTING_DOWN');
  expect(f.subject.needsQuitCleanup()).toBe(false);
  }
});

it('random seeds honor the live schema range rather than failing an otherwise valid low-range seed workflow', async () => {
  hooks.probe.mockResolvedValue(free());
  const catalog = structuredClone(rawCoreCatalog); catalog.KSampler.input.required.seed[1] = { min: 10, max: 15, control_after_generate: true };
  hooks.catalog = catalog; const f = await service(); await f.subject.getState();
  const snapshot = f.subject.snapshot(); vi.spyOn(f.subject.supervisor, 'snapshot').mockImplementation(() => ({ ...snapshot, phase: 'ready', owner: 'external', baseUrl: 'http://127.0.0.1:8188' }));
  const prompt = corePrompt(); prompt['7'].inputs.seed = 12;
  const workflow = await f.subject.importWorkflowJson(JSON.stringify(prompt), 'Live seed range fixture'), analysis = await f.subject.analyzeWorkflow(workflow.id);
  expect(analysis.ok).toBe(true); expect(analysis.slots.find(slot => slot.kind === 'seed')).toMatchObject({ min: 10, max: 15 });
  const source = await readWorkflowRecord<StoredComfyWorkflow>(f.root, workflow.id); if (!source) throw new Error('Missing review workflow');
  const request: ComfyRunRequest = { workflowId: workflow.id, analysisRevision: analysis.revision, slotValues: {}, seedMode: 'random', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
  // Only the actual service compiler is invoked. No job runner or transport
  // admission, execution, model loading or image generation occurs.
  const compiler = f.subject as unknown as { compile: (source: StoredComfyWorkflow, request: ComfyRunRequest) => Promise<{ seeds: Record<string, number>; prompt: typeof prompt }> };
  const compiled = await compiler.compile(source, request).then(value => ({ value, error: null }), error => ({ value: null, error: String(error) }));
  const originalUnchanged = hash(await fs.readFile(f.originalStore)) === f.originalSha;
  evidence(f.root, 'live-seed-range', { noProcessOrNetwork: true, schemaRange: { min: 10, max: 15 }, analysisOk: analysis.ok,
    randomCalls: hooks.random.mock.calls, compiled, originalProfileUnchanged: originalUnchanged });
  expect(originalUnchanged).toBe(true); expect(compiled.error).toBeNull();
  const seed = compiled.value!.seeds['seed:7:seed']; expect(seed).toBeGreaterThanOrEqual(10); expect(seed).toBeLessThanOrEqual(15);
  // The normal workflow bound can span the complete safe 53-bit range. The
  // entropy stub chooses the largest candidate; every randomInt call must
  // remain below Node's <2^48 range restriction, without truncating the seed.
  const wideCatalog = structuredClone(rawCoreCatalog); wideCatalog.KSampler.input.required.seed[1] = { min: 0, max: Number.MAX_SAFE_INTEGER, control_after_generate: true };
  hooks.catalog = wideCatalog; await f.subject.refreshInventory(); const wideAnalysis = await f.subject.analyzeWorkflow(workflow.id);
  hooks.random.mockClear(); const wide = await compiler.compile(source, { ...request, analysisRevision: wideAnalysis.revision });
  expect(wide.seeds['seed:7:seed']).toBe(Number.MAX_SAFE_INTEGER);
  expect(hooks.random.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(hooks.random.mock.calls.every(([min, max]) => max - min < 2 ** 48)).toBe(true);
  evidence(f.root, 'safe53-seed-range', { randomCalls: hooks.random.mock.calls, seed: wide.seeds['seed:7:seed'], exactSafeInteger: Number.isSafeInteger(wide.seeds['seed:7:seed']) });
});
