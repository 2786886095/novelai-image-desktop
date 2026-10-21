import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
import * as installTools from './comfyui-install';
import * as dependencyTools from './comfyui-dependencies';
import { comfyGetJson } from './comfyui-http';

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
  return { subject: new ComfyLocalService(options), options, root, originalStore, originalSha };
}
function evidence(root: string, name: string, data: unknown) { fsSync.writeFileSync(path.join(root, name + '.json'), JSON.stringify(data, null, 2)); }

it('setup reads saved service configuration without help execution, passive network probing, preset seeding or mutation', async () => {
  const f = await service(), directory = path.join(f.root, 'comfyui-local'); await fs.mkdir(directory);
  const install = { root: path.join(f.root, 'explicit-source'), mainPy: path.join(f.root, 'explicit-source/main.py'), python: path.join(f.root, 'explicit-runtime/python.exe'),
    layout: 'custom', cwd: path.join(f.root, 'explicit-source'), pythonVersion: null, supportedFlags: [], helpProbe: 'not-run', helpProbeMessage: null, checkedAt: '2026-10-20T00:00:00Z', pythonArgs: [] };
  const settings = path.join(directory, 'settings.json'), bytes = JSON.stringify({ version: 1, updatedAt: '2026-10-20T00:00:00Z', data: {
    schema: 1, install, launch: { port: 8188, readyTimeoutSec: 300, disableApiNodes: true, safeMode: true, extraArgs: ['--cpu'] }, connection: { host: '127.0.0.1', port: 8188 }, outputDirectory: null,
  } });
  await fs.writeFile(settings, bytes);
  const current = await f.subject.configuredInstall(); expect(current).toEqual(install);
  current!.python = 'changed-return-copy'; expect((await f.subject.configuredInstall())!.python).toBe(install.python);
  expect(hooks.probe).not.toHaveBeenCalled(); expect(await fs.readdir(directory)).toEqual(['settings.json']); expect(await fs.readFile(settings, 'utf8')).toBe(bytes);
  expect(hash(await fs.readFile(f.originalStore))).toBe(f.originalSha);
});
it('an unconfirmed multi-Python bundle requires manual fallback; reselecting preserves the explicit .ext interpreter', async () => {
  hooks.probe.mockResolvedValue(free()); const f = await service(), bundle = path.join(f.root, 'bundle'), source = path.join(bundle, 'ComfyUI');
  await fs.mkdir(source, { recursive: true }); await fs.writeFile(path.join(source, 'main.py'), '# static fixture');
  const executable = process.platform === 'win32' ? 'python.exe' : 'python';
  for (const name of ['python', '.ext']) { await fs.mkdir(path.join(bundle, name)); await fs.writeFile(path.join(bundle, name, executable), 'STATIC FIXTURE', { mode: 0o700 }); }
  f.options.chooseDirectory = async () => bundle;
  const help = vi.spyOn(installTools, 'probeComfyHelp').mockImplementation(async value => ({ ...value, stdout: 'fixed mock help', stderr: '', exitCode: 0,
    helpProbe: 'passed', supportedFlags: ['--listen','--port','--disable-auto-launch'], checkedAt: '2026-10-20T00:00:00Z' }));
  const unselected = await f.subject.chooseInstallDirectory();
  expect(unselected?.install).toMatchObject({ python: '', helpProbe: 'not-run', helpProbeMessage: 'COMFY_PYTHON_AUTO_UNCONFIRMED' });
  expect(help).not.toHaveBeenCalled(); expect((await f.subject.start()).failure?.code).toBe('python-invalid'); expect(help).not.toHaveBeenCalled();
  const explicit = path.join(bundle, '.ext', executable);
  expect((await f.subject.adoptDiscoveredInstall(source, explicit)).install?.python).toBe(explicit);
  expect((await f.subject.chooseInstallDirectory())?.install?.python).toBe(explicit);
  expect(help).toHaveBeenCalledTimes(2); expect(f.options.supervisor!.spawn).not.toHaveBeenCalled();
});
it('metadata differences remain visible warnings and never blanket-block the user explicit startup request', async () => {
  hooks.probe.mockResolvedValue(free()); const f = await service(), source = path.join(f.root, 'explicit-source');
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'main.py'), '# static fixture');
  const python = path.join(source, process.platform === 'win32' ? 'python.exe' : 'python'); await fs.writeFile(python, 'STATIC FIXTURE', { mode: 0o700 });
  vi.spyOn(installTools, 'probeComfyHelp').mockImplementation(async value => ({ ...value, stdout: 'fixed mock help', stderr: '', exitCode: 0,
    helpProbe: 'passed', supportedFlags: ['--listen','--port','--disable-auto-launch','--disable-api-nodes','--disable-all-custom-nodes'], checkedAt: '2026-10-20T00:00:00Z' }));
  vi.spyOn(dependencyTools, 'probeComfyDependencies').mockResolvedValue({ pythonVersion: '3.11.9', dependencyChecks: [{ name: 'example', required: '==2.0', installed: '1.0', status: 'mismatch' }], dependencyProbeMessage: null });
  const configured = await f.subject.adoptDiscoveredInstall(source, python); expect(configured.install!.dependencyChecks![0].status).toBe('mismatch');
  // The injected spawn intentionally throws instead of creating an OS process.
  // Reaching it proves metadata did not masquerade as a startup API failure.
  const snapshot = await f.subject.start(); expect(f.options.supervisor!.spawn).toHaveBeenCalledOnce();
  expect(snapshot.failure?.code).toBe('spawn-error'); expect(snapshot.failure?.message).toContain('REVIEW_MUST_NOT_SPAWN');
});
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
  const snapshot = f.subject.snapshot(); vi.spyOn(f.subject.supervisor, 'snapshot').mockImplementation(() => ({ ...snapshot, phase: 'ready', health: 'ok', owner: 'external', baseUrl: 'http://127.0.0.1:8188' }));
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

// This frozen probe imports only modules present in the original source. It is
// also run against BASELINE/ROLLBACK copies to reproduce the real stale failure.
// It invokes the production service compiler with mocked GET inventory only:
// no job runner, transport POST, socket, process, GPU or live server is used.
describe('catalog compatibility submission', () => {
  async function prepared() {
    hooks.probe.mockResolvedValue(free());
    const catalog: Record<string, any> = { ...structuredClone(rawCoreCatalog), UnrelatedRandomDefaults: { input: { required: { value: ['STRING', { default: 'first-generated-default' }] } }, output: ['STRING'], python_module: 'custom_nodes.fixture' } };
    hooks.catalog = catalog;
    const f = await service(); await f.subject.getState();
    const snapshot = f.subject.snapshot(); vi.spyOn(f.subject.supervisor, 'snapshot').mockImplementation(() => ({ ...snapshot, phase: 'ready', health: 'ok', owner: 'external', baseUrl: 'http://127.0.0.1:8188' }));
    const workflow = await f.subject.importWorkflowJson(JSON.stringify(corePrompt()), 'Catalog compatibility frozen fixture'), analysis = await f.subject.analyzeWorkflow(workflow.id);
    expect(analysis.ok).toBe(true);
    const stored = await readWorkflowRecord<StoredComfyWorkflow>(f.root, workflow.id); if (!stored) throw new Error('Missing compatibility fixture');
    const request: ComfyRunRequest = { workflowId: workflow.id, analysisRevision: analysis.revision, slotValues: {}, seedMode: 'fixed', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
    const compiler = f.subject as unknown as { compile: (source: StoredComfyWorkflow, request: ComfyRunRequest) => Promise<{ prompt: unknown; receipt: Record<string,unknown> }> };
    return { ...f, catalog, stored, request, compiler };
  }
  it('accepts fresh full validation when only an unrelated generated default changes', async () => {
    const f = await prepared(), fresh = structuredClone(f.catalog); fresh.UnrelatedRandomDefaults.input.required.value[1].default = 'second-generated-default'; hooks.catalog = fresh;
    const compiled = await f.compiler.compile(f.stored,f.request);
    expect(compiled.prompt).toEqual(corePrompt()); expect(hash(await fs.readFile(f.originalStore))).toBe(f.originalSha);
    evidence(f.root,'unrelated-generated-default',{ noProcessOrNetwork: true, compileAccepted: true, originalProfileUnchanged: true });
  });
  it('accepts catalog object-key reordering after fresh validation', async () => {
    const f = await prepared(); hooks.catalog = Object.fromEntries(Object.entries(f.catalog).reverse());
    expect((await f.compiler.compile(f.stored,f.request)).prompt).toEqual(corePrompt());
  });
  it('retains analyzed context across an unrelated manual refresh before run', async () => {
    const f = await prepared(), fresh = structuredClone(f.catalog); fresh.UnrelatedRandomDefaults.input.required.value[1].default = 'manually-refreshed-default'; hooks.catalog = fresh;
    await f.subject.refreshInventory();
    const compiled = await f.compiler.compile(f.stored,f.request);
    expect(compiled.prompt).toEqual(corePrompt()); expect(compiled.receipt.compatibilityRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(compiled.receipt.compatibilityRevision).not.toBe(compiled.receipt.catalogRevision);
  });
  it('uses one captured catalog and revision for current, resolved and receipt during a concurrent refresh', async () => {
    const f = await prepared(), entered = deferred<void>(), release = deferred<void>(), original = f.options.analyze;
    const seen: Array<{ catalog: unknown; revision: string }> = [];
    f.options.analyze = async (record,catalog,revision,values) => {
      seen.push({ catalog, revision });
      if (seen.length === 1) { entered.resolve(); await release.promise; }
      return original(record,catalog,revision,values);
    };
    const compiling = f.compiler.compile(f.stored,f.request); await entered.promise;
    const fresh = structuredClone(f.catalog); fresh.UnrelatedRandomDefaults.input.required.value[1].default = 'concurrent-new-default'; hooks.catalog = fresh;
    const latest = await f.subject.refreshInventory(); release.resolve(); const compiled = await compiling;
    expect(seen).toHaveLength(2); expect(seen[0].catalog).toBe(seen[1].catalog); expect(seen[0].revision).toBe(seen[1].revision);
    expect(compiled.receipt.catalogRevision).toBe(seen[0].revision); expect(compiled.receipt.catalogRevision).not.toBe(latest.catalogRevision);
  });
  it('coalesces concurrent inventory refreshes into one GET snapshot', async () => {
    const f = await prepared(), gate = deferred<unknown>(), entered = deferred<void>();
    const before = vi.mocked(comfyGetJson).mock.calls.filter(([,route]) => route === '/object_info').length;
    vi.mocked(comfyGetJson).mockImplementationOnce(async (_target,route) => { expect(route).toBe('/object_info'); entered.resolve(); return gate.promise; });
    const first = f.subject.refreshInventory(); await entered.promise; const second = f.subject.refreshInventory(); gate.resolve(f.catalog);
    expect(await first).toEqual(await second);
    expect(vi.mocked(comfyGetJson).mock.calls.filter(([,route]) => route === '/object_info').length - before).toBe(1);
  });
  it('never lets an old in-flight fetch resurrect an invalidated session', async () => {
    const f = await prepared(), gate = deferred<unknown>(), entered = deferred<void>();
    vi.mocked(comfyGetJson).mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
    const old = f.subject.refreshInventory().then(value => ({ value, error: null }),error => ({ value: null, error: String(error) })); await entered.promise;
    vi.spyOn(f.subject.supervisor,'disconnect').mockImplementation(async () => f.subject.supervisor.snapshot()); await f.subject.disconnect();
    const internal = f.subject as unknown as { catalog: unknown; inventory: { catalogRevision: string } | null; analysis: Map<string,unknown> };
    expect(internal.catalog).toBeNull(); expect(internal.inventory).toBeNull(); expect(internal.analysis.size).toBe(0);
    const fresh = structuredClone(f.catalog); fresh.UnrelatedRandomDefaults.input.required.value[1].default = 'new-session-default'; hooks.catalog = fresh;
    const latest = await f.subject.refreshInventory(); gate.resolve(f.catalog);
    expect((await old).error).toContain('COMFY_STALE_ANALYSIS'); expect(internal.inventory?.catalogRevision).toBe(latest.catalogRevision);
    expect(internal.catalog).toBe(fresh);
  });
  it.each(['stop','disconnect'] as const)('%s still clears analyzed contexts and requires new analysis', async operation => {
    const f = await prepared(), snapshot = f.subject.supervisor.snapshot();
    if (operation === 'stop') vi.spyOn(f.subject.supervisor,'snapshot').mockImplementation(() => ({ ...snapshot, owner: 'app' }));
    vi.spyOn(f.subject.supervisor,operation).mockImplementation(async () => f.subject.supervisor.snapshot());
    if (operation === 'stop') await f.subject.stop({ interruptRunning: false }); else await f.subject.disconnect();
    const internal = f.subject as unknown as { catalog: unknown; inventory: unknown; analysis: Map<string,unknown> };
    expect(internal.catalog).toBeNull(); expect(internal.inventory).toBeNull(); expect(internal.analysis.size).toBe(0);
    await expect(f.compiler.compile(f.stored,f.request)).rejects.toThrow('COMFY_STALE_ANALYSIS');
  });
  it('does not re-cache an analyzed reply that completes after disconnect invalidation', async () => {
    const f = await prepared(), entered = deferred<void>(), release = deferred<void>(), original = f.options.analyze;
    f.options.analyze = async (...args) => { entered.resolve(); await release.promise; return original(...args); };
    const analyzing = f.subject.analyzeWorkflow(f.stored.id).then(value => ({ value, error: null }),error => ({ value: null, error: String(error) })); await entered.promise;
    vi.spyOn(f.subject.supervisor,'disconnect').mockImplementation(async () => f.subject.supervisor.snapshot()); await f.subject.disconnect(); release.resolve();
    expect((await analyzing).error).toContain('COMFY_STALE_ANALYSIS');
    expect((f.subject as unknown as { analysis: Map<string,unknown> }).analysis.size).toBe(0);
  });
  it.each([
    ['used model enumeration', (raw: Record<string, any>) => raw.UNETLoader.input.required.unet_name[0].push('new-local.safetensors')],
    ['used socket type', (raw: Record<string, any>) => raw.UNETLoader.output[0] = 'CHANGED_MODEL'],
    ['used input default', (raw: Record<string, any>) => raw.CLIPTextEncode.input.required.text[1].default = 'changed default'],
    ['used node origin', (raw: Record<string, any>) => raw.UNETLoader.python_module = 'custom_nodes.changed'],
    ['used cloud marker', (raw: Record<string, any>) => raw.UNETLoader.api_node = true],
    ['used unsupported schema', (raw: Record<string, any>) => raw.UNETLoader.input.required.unet_name = [[{ opaque: true }]]],
    ['used missing node', (raw: Record<string, any>) => delete raw.UNETLoader],
  ] as const)('rejects %s changes after fresh validation and before admission', async (_name,mutate) => {
    const f = await prepared(), fresh = structuredClone(f.catalog); mutate(fresh); hooks.catalog = fresh;
    await expect(f.compiler.compile(f.stored,f.request)).rejects.toThrow('COMFY_STALE_CATALOG_REANALYZE');
  });
  it('does not scope away unsafe JSON in an unrelated node', async () => {
    const f = await prepared(); hooks.catalog = { ...f.catalog, UnsafeUnrelated: JSON.parse('{"__proto__":{}}') };
    await expect(f.compiler.compile(f.stored,f.request)).rejects.toThrow();
  });
});
