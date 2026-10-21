import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ComfySnapshot } from '../../src/comfyui/contract';
const forbidden = vi.hoisted(() => ({ spawn: vi.fn(() => { throw new Error('NO_PROCESS_IN_OPEN_WEB_TEST'); }), http: vi.fn(() => { throw new Error('NO_HTTP_IN_OPEN_WEB_TEST'); }) }));
vi.mock('node:child_process', () => ({ spawn: forbidden.spawn, execFile: forbidden.spawn, execFileSync: forbidden.spawn }));
vi.mock('./comfyui-probe', () => ({ probeComfy: forbidden.http }));
vi.mock('./local-media-protocol', () => ({ toLocalMediaUrl: () => { throw new Error('NO_MEDIA_IN_OPEN_WEB_TEST'); } }));
import { ComfyLocalService, type ComfyLocalServiceOptions } from './comfyui-service';

function fixture() {
  const openExternal = vi.fn(async (_url: string) => undefined);
  const options: ComfyLocalServiceOptions = {
    userData: path.join(os.tmpdir(), 'comfy-open-web-no-files-created'), defaultOutputDirectory: () => os.tmpdir(),
    chooseDirectory: vi.fn(), choosePython: vi.fn(), chooseWorkflowFile: vi.fn(), revealResult: vi.fn(), openDirectory: vi.fn(),
    parseWorkflow: vi.fn(), analyze: vi.fn(), buildArgs: vi.fn(), openExternal,
  };
  const service = new ComfyLocalService(options), initial = service.snapshot();
  const snapshot = vi.spyOn(service.supervisor, 'snapshot');
  const start = vi.spyOn(service, 'start'), connect = vi.spyOn(service, 'connect');
  const ready = (patch: Partial<ComfySnapshot> = {}) => snapshot.mockReturnValue({ ...initial,
    phase: 'ready', health: 'ok', owner: 'external', target: { host: '127.0.0.1', port: 49217 },
    // These are deliberately hostile/stale: only the main-owned target is used.
    baseUrl: 'https://external.example/token-secret?token=NO', identity: { argv: ['http://external.example/'] } as never, ...patch });
  return { service, options, snapshot, ready, start, connect, openExternal };
}
afterEach(() => { vi.restoreAllMocks(); expect(forbidden.spawn).not.toHaveBeenCalled(); expect(forbidden.http).not.toHaveBeenCalled(); vi.clearAllMocks(); });

it('opens the actual ready port root, not a stale configured URL, identity or secret-bearing baseUrl', async () => {
  const f = fixture(); f.ready(); await f.service.openWeb();
  expect(f.openExternal).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:49217/');
  expect(f.start).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
});
it.each(['idle', 'probing', 'starting', 'failed', 'stopping', 'stopped'] as const)('does not start/connect/open a %s service', async phase => {
  const f = fixture(); f.ready({ phase }); await expect(f.service.openWeb()).rejects.toThrow('COMFY_NOT_READY');
  expect(f.openExternal).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
});
it.each(['unknown', 'unresponsive'] as const)('does not open a ready service whose health is %s', async health => {
  const f = fixture(); f.ready({ health }); await expect(f.service.openWeb()).rejects.toThrow('COMFY_NOT_READY'); expect(f.openExternal).not.toHaveBeenCalled();
});
it.each([
  [{ host: 'localhost', port: 49218 }, 'http://127.0.0.1:49218/'],
  [{ host: '::1', port: 49219 }, 'http://[::1]:49219/'],
] as const)('canonicalizes the loopback target %j without changing ownership', async (target, expected) => {
  const f = fixture(); f.ready({ target }); await f.service.openWeb();
  expect(f.openExternal).toHaveBeenCalledExactlyOnceWith(expected); expect(f.service.snapshot().owner).toBe('external');
  expect(f.service.supervisor.ownedPid()).toBeNull();
});
it.each([
  { host: 'evil.example', port: 49217 }, { host: '127.0.0.1/redirect?token=NO', port: 49217 },
  { host: '127.0.0.1', port: 0 }, { host: '127.0.0.1', port: 65536 },
] as const)('rejects invalid target %j instead of forwarding arbitrary browser destinations', async target => {
  const f = fixture(); f.ready({ target: target as never }); await expect(f.service.openWeb()).rejects.toThrow(/COMFY_(LOOPBACK_TARGET|PORT|TARGET_MISMATCH)/); expect(f.openExternal).not.toHaveBeenCalled();
});
it('strips even an injected target.baseUrl and builds only from host and port', async () => {
  const f = fixture(); f.ready({ target: { host: '127.0.0.1', port: 49220, baseUrl: 'http://localhost:9999/?token=NO' } as never });
  await f.service.openWeb(); expect(f.openExternal).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:49220/');
});
it('reports unavailable or rejected browser opening without mutating/starting the service', async () => {
  const f = fixture(); f.ready(); f.options.openExternal = undefined;
  await expect(f.service.openWeb()).rejects.toThrow('COMFY_OPEN_WEB_UNAVAILABLE'); expect(f.openExternal).not.toHaveBeenCalled();
  f.options.openExternal = f.openExternal; f.openExternal.mockRejectedValueOnce(new Error('SYNTHETIC_BROWSER_FAILURE'));
  await expect(f.service.openWeb()).rejects.toThrow('SYNTHETIC_BROWSER_FAILURE'); expect(f.start).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
});
