import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ComfyLocalConfig, ComfyRunSnapshot } from '../../src/comfyui/contract';
const hooks = vi.hoisted(() => ({ history: vi.fn(async () => ({ runs: [], incomplete: false })), process: vi.fn(() => { throw new Error('NO_PROCESS_IN_STATE_TEST'); }) }));
vi.mock('node:child_process', () => ({ spawn: hooks.process, execFile: hooks.process, execFileSync: hooks.process }));
vi.mock('./comfyui-config', async original => ({ ...await original<typeof import('./comfyui-config')>(), readRunHistory: hooks.history }));
vi.mock('./local-media-protocol', () => ({ toLocalMediaUrl: () => { throw new Error('NO_MEDIA_IN_STATE_TEST'); } }));
import { ComfyLocalService } from './comfyui-service';

function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
afterEach(() => { vi.restoreAllMocks(); expect(hooks.process).not.toHaveBeenCalled(); vi.clearAllMocks(); });
it.each(['listWorkflows', 'listResults'] as const)('samples the active snapshot and config only after delayed %s has settled', async delayedMethod => {
  const service = new ComfyLocalService({ userData: path.join(os.tmpdir(), 'comfy-state-no-files-created'), defaultOutputDirectory: () => os.tmpdir(),
    chooseDirectory: vi.fn(), choosePython: vi.fn(), chooseWorkflowFile: vi.fn(), revealResult: vi.fn(), openDirectory: vi.fn(),
    parseWorkflow: vi.fn(), analyze: vi.fn(), buildArgs: vi.fn() });
  // Only the public orchestration is real: no profile read/write or execution.
  vi.spyOn(service as unknown as { initialize(): Promise<void> }, 'initialize').mockResolvedValue();
  const state = service.snapshot(), entered = gate(), finish = gate();
  const run: ComfyRunSnapshot = { runId: 'finishes-during-state-read', workflowId: 'workflow', promptId: 'prompt', phase: 'running',
    queuePosition: null, currentNode: null, progress: null, nodesExecuted: 0, nodesTotal: 1, startedAt: '2026-10-20T00:00:00Z',
    finishedAt: null, seeds: {}, error: null, results: [], nonImageOutputs: 0 };
  state.activeRun = run;
  const snapshot = vi.spyOn(service, 'snapshot').mockImplementation(() => structuredClone(state));
  vi.spyOn(service, 'listWorkflows').mockResolvedValue([]); vi.spyOn(service, 'listResults').mockResolvedValue([]);
  vi.mocked(service[delayedMethod]).mockImplementation(async () => { entered.resolve(); await finish.promise; return []; });
  const pending = service.getState(); await entered.promise;
  state.activeRun = { ...run, phase: 'completed', nodesExecuted: 1, finishedAt: '2026-10-20T00:00:01Z' };
  const config = (service as unknown as { config: ComfyLocalConfig }).config;
  config.launch.port = 49231; config.connection.port = 49231;
  finish.resolve(); const bundle = await pending;
  expect(bundle.snapshot.activeRun?.phase).toBe('completed'); expect(bundle.config.launch.port).toBe(49231);
  expect(bundle.config.connection.port).toBe(49231); expect(snapshot).toHaveBeenCalledOnce();
  expect(hooks.history).toHaveBeenCalledOnce(); expect(bundle.runs).toEqual([]);
});
