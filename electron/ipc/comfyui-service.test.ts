import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./local-media-protocol', () => ({ toLocalMediaUrl: (file: string, revision?: string) => `nai-fixture://image/${encodeURIComponent(file)}?revision=${revision || ''}` }));
import { ComfyLocalService, type StoredComfyWorkflow, type TrustedComfyAnalysis } from './comfyui-service';
import type { ComfyLocalServiceOptions } from './comfyui-service';
import type { ComfyAnalysis, ComfyEvent, ComfyRunRequest, ComfySlotValue } from '../../src/comfyui/contract';
import { comfyGetJson, resolveLoopbackTarget } from './comfyui-http';
import { killProcessTree } from './comfyui-process';
import type { ComfyCompiledPrompt } from './comfyui-jobs';

const fixtureRoot = fsSync.realpathSync(path.resolve('tests/fixtures/comfyui-protocol'));
const pythonCheck = spawnSync(process.env.COMFY_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import sys;print(sys.executable)'], { windowsHide: true, shell: false, encoding: 'utf8', timeout: 5000 });
const python = pythonCheck.status === 0 ? pythonCheck.stdout.trim() : null;
if (!python) console.warn('ComfyUI service real-process acceptance explicitly skipped: Python unavailable; set COMFY_TEST_PYTHON.');
const realTest = it.skipIf(!python);
const slot = { text: 'positive:4:text', model: 'model:1:unet_name', seed: 'seed:7:seed' };
type Policy = 'normal' | 'third-party' | 'cloud' | 'conversion';
const hash = (value: unknown) => createHash('sha256').update(Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const services: ComfyLocalService[] = [], children: ChildProcess[] = [], roots: string[] = [];
const records: Array<{ root: string; fixtureOnly: boolean; events: ComfyEvent[]; commands: unknown[]; processOutput: Array<{ pid?: number; stdout: string; stderr: string; exitCode?: number | null; signal?: string | null }>; details: unknown[] }> = [];
async function until(predicate: () => boolean | Promise<boolean>, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() >= deadline) throw new Error('Service fixture observation timeout'); await new Promise(r => setTimeout(r, 20)); }
}
async function freePort(): Promise<number> { const server = net.createServer(); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const p = (server.address() as net.AddressInfo).port; await new Promise(r => server.close(r)); return p; }
async function rootDir() {
  const base = process.env.COMFY_SERVICE_EVIDENCE_DIR || os.tmpdir(); await fs.mkdir(base, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(base), 'comfy-service-'))); roots.push(root); return root;
}
function trackedSpawn(record: typeof records[number], env: NodeJS.ProcessEnv = {}) {
  return ((command: string, args: string[], options: import('node:child_process').SpawnOptions) => {
    const child = spawn(command, args, { ...options, env: { ...options.env, ...env } }); children.push(child);
    const output = { pid: child.pid, stdout: '', stderr: '', exitCode: null as number | null, signal: null as string | null }; record.processOutput.push(output);
    record.commands.push({ command, args, pid: child.pid, cwd: options.cwd, windowsHide: options.windowsHide, shell: options.shell, kind: 'protocol TEST FIXTURE; no inference' });
    child.stdout?.on('data', b => { output.stdout += String(b); }); child.stderr?.on('data', b => { output.stderr += String(b); });
    child.once('error', error => { output.stderr += `spawn error: ${error.message}\n`; });
    child.once('close', (code, signal) => { output.exitCode = code; output.signal = signal; });
    return child;
  }) as typeof spawn;
}
function compiler(policy: { current: Policy }) {
  return (record: StoredComfyWorkflow, catalog: unknown, revision: string, supplied: Record<string, ComfySlotValue>): TrustedComfyAnalysis => {
    // Trusted compiler STUB. This test verifies orchestration, not the separate real workflow compiler.
    const prompt = structuredClone(record.payload) as ComfyCompiledPrompt;
    const values: Record<string, ComfySlotValue> = {
      [slot.text]: supplied[slot.text] ?? record.savedValues[slot.text] ?? String(prompt['4'].inputs.text),
      [slot.model]: supplied[slot.model] ?? record.savedValues[slot.model] ?? String(prompt['1'].inputs.unet_name),
      [slot.seed]: supplied[slot.seed] ?? record.savedValues[slot.seed] ?? Number(prompt['7'].inputs.seed),
    };
    const raw = catalog as Record<string, { input: { required: Record<string, unknown[]> } }>;
    const models = raw.UNETLoader.input.required.unet_name[0] as string[];
    const missing = !models.includes(String(values[slot.model]));
    prompt['4'].inputs.text = values[slot.text]; prompt['1'].inputs.unet_name = values[slot.model]; prompt['7'].inputs.seed = values[slot.seed];
    const analysis: ComfyAnalysis = {
      ok: !missing, revision: hash({ source: record.sourceSha256, revision, values, policy: policy.current }), sourceFormat: 'api',
      issues: missing ? [{ code: 'missing-model', severity: 'block', message: 'Synthetic fixture model is not available' }] : [],
      slots: [
        { id: slot.text, kind: 'positive', nodeId: '4', input: 'text', classType: 'CLIPTextEncode', label: 'fixture prompt', valueType: 'string', defaultValue: String(values[slot.text]) },
        { id: slot.model, kind: 'model', nodeId: '1', input: 'unet_name', classType: 'UNETLoader', label: 'fixture model', valueType: 'combo', defaultValue: String(values[slot.model]), options: models, role: 'diffusion' },
        { id: slot.seed, kind: 'seed', nodeId: '7', input: 'seed', classType: 'KSampler', label: 'fixture seed', valueType: 'int', defaultValue: Number(values[slot.seed]), min: 0, max: 4294967295 },
      ], missingNodeTypes: [], missingModels: [],
      cloudNodes: policy.current === 'cloud' ? [{ nodeId: '1', classType: 'FixtureCloudNode' }] : [],
      thirdParty: policy.current === 'third-party' ? [{ classType: 'UNETLoader', pythonModule: 'custom_nodes.fixture', nodeIds: ['1'] }] : [],
      thirdPartyFingerprint: policy.current === 'third-party' ? hash('fixture-third-party') : null,
      unverifiedConversion: policy.current === 'conversion', conversion: null, family: null, prunedNodes: [], nodeCount: Object.keys(prompt).length, outputNodes: ['9'],
    };
    return { analysis, prompt, values };
  };
}
async function setup(options: { mode?: string; generationDelay?: number; installDirectory?: string } = {}) {
  const root = await rootDir(), out = path.join(root, 'out'), chosenOut = path.join(root, 'chosen-out'), userData = path.join(root, 'profile');
  await Promise.all([fs.mkdir(out), fs.mkdir(chosenOut), fs.mkdir(userData)]);
  const accountFile = path.join(userData, 'novelai-image-desktop.json'); await fs.writeFile(accountFile, '{"synthetic":"must remain byte-exact"}'); const accountBefore = hash(await fs.readFile(accountFile));
  const record: typeof records[number] = { root, fixtureOnly: true, events: [], commands: [], processOutput: [], details: [] }; records.push(record);
  const policy = { current: 'normal' as Policy }, diagnostics: unknown[] = [];
  const ledger = path.join(root, 'fixture-ledger.jsonl'), p = await freePort();
  const dialogs = { install: options.installDirectory || fixtureRoot, output: chosenOut, python: python!, workflow: path.join(fixtureRoot, 'api-workflow-anima.json') };
  const reveal = vi.fn(), openDirectory = vi.fn(async () => undefined);
  const serviceOptions: ComfyLocalServiceOptions = {
    userData, defaultOutputDirectory: () => out,
    chooseDirectory: async kind => dialogs[kind], choosePython: async () => dialogs.python, chooseWorkflowFile: async () => dialogs.workflow,
    revealResult: reveal, openDirectory,
    parseWorkflow: text => ({ payload: JSON.parse(text), format: 'api', sourceKind: 'api-json' }), analyze: compiler(policy),
    buildArgs: config => ['--listen', '127.0.0.1', '--port', String(config.launch.port), '--disable-auto-launch'],
    supervisor: { pollMs: 25, healthMs: 60_000, spawn: trackedSpawn(record, { COMFY_FIXTURE_LEDGER: ledger, COMFY_FIXTURE_MODE: options.mode || 'ok', COMFY_FIXTURE_GENERATION_DELAY: String(options.generationDelay ?? .05) }) },
    onDiagnostic: error => diagnostics.push(String(error)),
  };
  const service = new ComfyLocalService(serviceOptions); services.push(service); service.onEvent(event => record.events.push(event));
  await service.getState(); await service.setLaunchOptions({ port: p }); await service.setConnection({ host: '127.0.0.1', port: p });
  const configure = async () => { const selected = await service.chooseInstallDirectory(); expect(selected?.install?.root).toBe(dialogs.install); if (selected?.install?.helpProbe !== 'passed') await service.choosePython(); expect((await service.getState()).config.install?.helpProbe).toBe('passed'); await service.setLaunchOptions({ portMode: 'manual' }); }; // Explicit protocol fixture, never eligible for automatic real-environment attribution.
  const readLedger = async () => { try { return (await fs.readFile(ledger, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>); } catch { return []; } };
  return { service, serviceOptions, root, userData, out, chosenOut, dialogs, record, diagnostics, policy, ledger, readLedger, configure, reveal, openDirectory, accountFile, accountBefore, port: p };
}
function request(workflowId: string, analysis: ComfyAnalysis, slotValues: Record<string, ComfySlotValue> = {}): ComfyRunRequest {
  return { workflowId, analysisRevision: analysis.revision, slotValues, seedMode: 'fixed', confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
}
afterEach(async context => {
  if (context.task.result?.state === 'fail') console.error('COMFY_SERVICE_TEST_FAILURE', JSON.stringify({ test: context.task.name, snapshots: services.map(service => service.snapshot()), processes: records.flatMap(record => record.processOutput.map(output => ({ ...output, stdout: output.stdout.slice(-16384), stderr: output.stderr.slice(-16384) }))) }));
  for (const service of services.splice(0)) await service.shutdown();
  for (const child of children.splice(0)) await killProcessTree(child);
  await new Promise(r => setTimeout(r, 30));
  for (const record of records.splice(0)) {
    if (process.env.COMFY_SERVICE_EVIDENCE_DIR) await fs.writeFile(path.join(record.root, 'SERVICE_TRACE.json'), JSON.stringify({ test: context.task.name, ...record }, null, 2));
  }
  if (!process.env.COMFY_SERVICE_EVIDENCE_DIR) for (const root of roots) {
    if (path.dirname(root) !== await fs.realpath(os.tmpdir()) || !path.basename(root).startsWith('comfy-service-')) throw new Error('Unsafe test cleanup target');
    await fs.rm(root, { recursive: true, force: true });
  }
  roots.length = 0;
});

realTest('actual service flow: native selections/help -> hidden startup -> inventory -> model/prompt binding -> generated results/reuse; broken event listener is isolated', async () => {
  const f = await setup(); f.service.onEvent(() => { throw new Error('synthetic renderer listener failure'); });
  await f.configure(); await f.service.chooseOutputDirectory(); const ready = await f.service.start();
  expect(ready.phase, JSON.stringify(ready)).toBe('ready'); expect(ready.owner).toBe('app'); expect(ready.identity?.isProtocolFixture).toBe(true); expect(ready.inventory?.nodeTypeCount).toBe(8);
  const workflow = (await f.service.importWorkflowFile())!;
  const values = { [slot.text]: 'TEST FIXTURE most precise tags', [slot.model]: 'fixture_krea2.safetensors' };
  const analysis = await f.service.analyzeWorkflow(workflow.id, values); expect(analysis.ok).toBe(true); expect(analysis.slots.find(s => s.id === slot.model)?.options).toContain('fixture_krea2.safetensors');
  const result = await f.service.run(request(workflow.id, analysis, values)); expect(result.phase).toBe('completed'); expect(result.results).toHaveLength(1);
  const item = result.results[0], bytes = await fs.readFile(item.filePath); expect(bytes.subarray(0, 8)).toEqual(Buffer.from('\x89PNG\r\n\x1a\n', 'binary')); expect(hash(bytes)).toBe(item.sha256);
  expect(item.filePath.startsWith(path.join(f.chosenOut, 'ComfyUI') + path.sep)).toBe(true); expect((await f.service.listResults()).map(i => i.id)).toContain(item.id);
  expect(await f.service.reuseResult(item.id)).toMatchObject({ workflowId: workflow.id, slotValues: values });
  await f.service.openResult(item.id); expect(f.reveal).toHaveBeenCalledWith(item.filePath); await f.service.openResultsFolder(); expect(f.openDirectory).toHaveBeenCalledWith(path.join(f.chosenOut, 'ComfyUI'));
  const ledger = await f.readLedger(), posts = ledger.filter(r => r.method === 'POST' && r.path === '/prompt'); expect(posts).toHaveLength(1);
  const body = posts[0].body as { prompt: ComfyCompiledPrompt }; expect(body.prompt['1'].inputs.unet_name).toBe('fixture_krea2.safetensors'); expect(body.prompt['4'].inputs.text).toBe(values[slot.text]);
  expect(f.diagnostics.length).toBeGreaterThan(0); await until(() => f.record.events.some(e => e.type === 'results'));
  expect((await f.service.stop({ interruptRunning: false })).phase).toBe('stopped'); expect(hash(await fs.readFile(f.accountFile))).toBe(f.accountBefore);
  const reopened = new ComfyLocalService(f.serviceOptions); services.push(reopened); const state = await reopened.getState(); expect(state.config.install?.python).toBe(await fs.realpath(python!)); expect(state.workflows.map(w => w.id)).toContain(workflow.id); expect(state.results.map(i => i.id)).toContain(item.id);
  f.record.details.push({ originalMainStoreUnchanged: true, imageSha256: item.sha256, imageWidth: item.width, imageHeight: item.height, realInference: false });
}, 30_000);

realTest('service blocks stale revision/values, unconfirmed third-party/conversion and cloud analysis before any generation POST', async () => {
  const f = await setup(); await f.configure(); await f.service.start(); const workflow = (await f.service.importWorkflowFile())!;
  const analysis = await f.service.analyzeWorkflow(workflow.id);
  const stale = await f.service.run({ ...request(workflow.id, analysis), analysisRevision: 'old-revision' }); expect(stale.phase).toBe('failed'); expect(stale.error?.message).toContain('STALE_ANALYSIS');
  const changed = await f.service.run(request(workflow.id, analysis, { [slot.text]: 'different values' })); expect(changed.phase).toBe('failed'); expect(changed.error?.message).toContain('STALE_VALUES');
  f.policy.current = 'third-party'; const third = await f.service.analyzeWorkflow(workflow.id);
  const denied = await f.service.run(request(workflow.id, third)); expect(denied.phase).toBe('failed'); expect(denied.error?.message).toContain('THIRD_PARTY_CONFIRMATION');
  f.policy.current = 'conversion'; const conversion = await f.service.analyzeWorkflow(workflow.id);
  const unreviewed = await f.service.run(request(workflow.id, conversion)); expect(unreviewed.phase).toBe('failed'); expect(unreviewed.error?.message).toContain('CONVERSION_CONFIRMATION');
  f.policy.current = 'cloud'; const cloud = await f.service.analyzeWorkflow(workflow.id);
  const remote = await f.service.run(request(workflow.id, cloud)); expect(remote.phase).toBe('failed'); expect(remote.error?.message).toContain('WORKFLOW_BLOCKED');
  expect((await f.readLedger()).filter(r => r.method === 'POST' && r.path === '/prompt')).toHaveLength(0);
  f.policy.current = 'third-party'; const approved = await f.service.analyzeWorkflow(workflow.id); const run = request(workflow.id, approved); run.confirmations.thirdPartyFingerprint = approved.thirdPartyFingerprint;
  expect((await f.service.run(run)).phase).toBe('completed'); expect((await f.readLedger()).filter(r => r.method === 'POST' && r.path === '/prompt')).toHaveLength(1);
}, 30_000);

realTest('service cancels its actual running fixture job and requires confirmation before stopping another active run', async () => {
  const f = await setup({ generationDelay: 30 }); await f.configure(); await f.service.start(); const workflow = (await f.service.importWorkflowFile())!, analysis = await f.service.analyzeWorkflow(workflow.id);
  const running = f.service.run(request(workflow.id, analysis)); await until(() => f.service.snapshot().activeRun?.phase === 'running');
  const active = f.service.snapshot().activeRun!; await f.service.cancel(active.runId); expect((await running).phase).toBe('cancelled');
  const againAnalysis = await f.service.analyzeWorkflow(workflow.id), again = f.service.run(request(workflow.id, againAnalysis)); await until(() => f.service.snapshot().activeRun?.phase === 'running');
  await expect(f.service.stop({ interruptRunning: false })).rejects.toThrow('CONFIRM_RUNNING_STOP'); expect(f.service.supervisor.ownedPid()).not.toBeNull();
  expect((await f.service.stop({ interruptRunning: true })).phase).toBe('stopped'); expect((await again).phase).toBe('cancelled'); expect(f.service.supervisor.ownedPid()).toBeNull();
  const interrupts = (await f.readLedger()).filter(r => r.method === 'POST' && r.path === '/interrupt'); expect(interrupts).toHaveLength(2); for (const r of interrupts) expect((r.body as { prompt_id: string }).prompt_id).toBeTruthy();
}, 30_000);

realTest('connecting/disconnecting an independently started real fixture never terminates that external instance', async () => {
  const f = await setup(); const target = resolveLoopbackTarget({ port: f.port });
  const child = trackedSpawn(f.record)(python!, [path.join(fixtureRoot, 'main.py'), '--disable-auto-launch', '--listen', '127.0.0.1', '--port', String(f.port), '--fixture-ledger', f.ledger], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: process.env });
  await until(async () => { try { await comfyGetJson(target, '/system_stats'); return true; } catch { return false; } });
  expect((await f.service.connect()).owner).toBe('external'); await expect(f.service.stop({ interruptRunning: true })).rejects.toThrow('EXTERNAL_USE_DISCONNECT');
  expect((await f.service.disconnect()).phase).toBe('idle'); expect(child.exitCode).toBeNull(); expect(await comfyGetJson(target, '/system_stats')).toHaveProperty('system');
  f.record.details.push({ externalPid: child.pid, aliveAfterDisconnect: child.exitCode === null });
}, 20_000);

realTest('service shutdown aborts and awaits a real help probe before returning; no helper survives to its 30-second timeout', async () => {
  const directory = await rootDir(), main = path.join(directory, 'main.py'), marker = path.join(directory, 'help.pid');
  await fs.writeFile(main, `import os,time\nopen(${JSON.stringify(marker)},'w').write(str(os.getpid()))\nprint('SERVICE HELP SHUTDOWN FIXTURE',flush=True)\ntime.sleep(60)\n`);
  const f = await setup({ installDirectory: directory }); await f.service.chooseInstallDirectory();
  const choosing = f.service.choosePython().then(value => ({ value, error: null }), error => ({ value: null, error }));
  await until(() => fsSync.existsSync(marker)); const pid = Number(await fs.readFile(marker, 'utf8'));
  expect(f.service.needsQuitCleanup()).toBe(true); await f.service.shutdown();
  expect(String((await choosing).error)).toContain('COMFY_HELP_ABORTED'); expect(() => process.kill(pid, 0)).toThrow(); expect(f.service.needsQuitCleanup()).toBe(false);
  f.record.details.push({ helpPid: pid, aliveAfterShutdown: false, selectionRejectedWith: 'COMFY_HELP_ABORTED' });
}, 20_000);
