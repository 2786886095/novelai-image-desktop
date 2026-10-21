import { beforeEach, expect, it, vi } from 'vitest';
import { COMFY_IPC } from '../src/comfyui/contract';
const bridge = vi.hoisted(() => ({ api: {} as Record<string, (...args: any[]) => any>, invoke: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: (name: string, api: typeof bridge.api) => { if (name === 'naiComfy') bridge.api = api; } }, ipcRenderer: { invoke: bridge.invoke }, webUtils: {} }));
beforeEach(async () => { vi.resetModules(); bridge.invoke.mockReset(); await import('./preload'); });
it('exposes a zero-argument openWeb bridge and never forwards a renderer URL or path', async () => {
  bridge.invoke.mockResolvedValue({ ok: true, data: undefined });
  expect(typeof bridge.api.openWeb).toBe('function');
  await expect(bridge.api.openWeb('https://untrusted.example/?token=NO', 'C:/untrusted')).resolves.toEqual({ ok: true, data: undefined });
  expect(bridge.invoke).toHaveBeenCalledExactlyOnceWith(COMFY_IPC.openWeb);
});
it('keeps the main-process not-ready envelope intact', async () => {
  const response = { ok: false, error: { code: 'not-ready', message: 'COMFY_NOT_READY' } };
  bridge.invoke.mockResolvedValue(response); await expect(bridge.api.openWeb()).resolves.toEqual(response);
});
it('exposes local library save bridges without accepting source paths, graphs or extra confirmations', async () => {
  bridge.invoke.mockResolvedValue({ ok: true, data: { id: 'copy-id' } });
  const values = { 'positive:4:text': 'fixture prompt', 'parameter:3:enabled': true };
  await bridge.api.saveWorkflowValues('own-id', values, 'C:/source.json');
  expect(bridge.invoke).toHaveBeenLastCalledWith(COMFY_IPC.saveWorkflowValues, 'own-id', values);
  await bridge.api.saveWorkflowAs('builtin-local-1-v1', 'My recipe', values, { trusted: true });
  expect(bridge.invoke).toHaveBeenLastCalledWith(COMFY_IPC.saveWorkflowAs, 'builtin-local-1-v1', 'My recipe', values);
});
