import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { COMFY_SETUP_IPC } from '../../src/comfyui/setup-contract';
import type { ComfyResponse } from '../../src/comfyui/contract';
import type { ComfySetupController } from './comfyui-setup';
import { comfyErrorEnvelope, type ComfyIpcRegistration } from './comfyui-ipc';

/** Reuses the isolated Comfy sender boundary, never account-bound generic IPC. */
export function bindComfySetupIpc(registration: ComfyIpcRegistration, getWindow: () => BrowserWindow | null, setup: ComfySetupController): () => void {
  type Method = Exclude<keyof typeof COMFY_SETUP_IPC, 'event'>;
  const routes: Record<Method, { count: number; run: (...args: any[]) => unknown }> = {
    getState: { count: 0, run: () => setup.getState() },
    discover: { count: 0, run: () => setup.discover() },
    chooseDiscoveryRoot: { count: 0, run: () => setup.chooseDiscoveryRoot() },
    adoptCandidate: { count: 2, run: (id, confirmed) => setup.adoptCandidate(id, confirmed) },
    openOfficialPage: { count: 0, run: () => setup.openOfficialPage() },
    chooseTargetDirectory: { count: 0, run: () => setup.chooseTargetDirectory() },
    chooseArchive: { count: 0, run: () => setup.chooseArchive() },
    install: { count: 1, run: request => setup.install(request) },
    cancel: { count: 0, run: () => setup.cancel() },
    createShortcut: { count: 1, run: id => setup.createShortcut(id) },
  };
  const channels: string[] = [];
  for (const [key, route] of Object.entries(routes) as Array<[Method, typeof routes[Method]]>) {
    const channel = COMFY_SETUP_IPC[key];
    registration.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<ComfyResponse<unknown>> => {
      try {
        const win = getWindow();
        if (!win || win.isDestroyed() || win.webContents.isDestroyed() || event.sender !== win.webContents
          || !event.senderFrame || event.senderFrame !== win.webContents.mainFrame) throw new Error('COMFY_SETUP_SENDER_DENIED');
        if (args.length !== route.count) throw new Error('COMFY_SETUP_IPC_ARGUMENT_COUNT');
        return { ok: true, data: await route.run(...args) };
      } catch (error) { return comfyErrorEnvelope(error); }
    });
    channels.push(channel);
  }
  const unsubscribe = setup.onEvent(state => {
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      try { win.webContents.send(COMFY_SETUP_IPC.event, state); } catch { /* window closed */ }
    }
  });
  return () => { unsubscribe(); for (const channel of channels) registration.removeHandler(channel); };
}
