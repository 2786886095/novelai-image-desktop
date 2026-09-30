import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {NOVELAI_ONLY_MESSAGE} from '../../src/novelai-only-settings';
import {getSettings} from './store';
import { onImageSettingsChanged } from './image-settings-events';

let unsubscribe: (() => void) | undefined;
export function registerCompatibleImageIpc(getWindow: () => BrowserWindow | null) {
  // Only the local main renderer owns these settings. Remote Agent pages use the authenticated bridge.
  const trusted = (event: IpcMainInvokeEvent) => {
    const win = getWindow();
    return !!win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  };
  const hasRevision = (revision: unknown): revision is string => typeof revision === 'string' && revision.length > 0;
  const stale = () => ({ ok: false, code: 'stale', message: '请重新读取图片服务配置后重试。' });
  // Keep explicit retired-channel replies for old renderers; no paid fallback.
  const retired=()=>({ok:false,code:'novelai-only',message:NOVELAI_ONLY_MESSAGE});
  ipcMain.handle('images:saveCompatibleSettings', event => trusted(event)?retired():stale());
  ipcMain.handle('images:setCompatibleProvider', (event, provider, revision) =>
    trusted(event) && hasRevision(revision) && revision===getSettings().imageServiceRevision
      ? provider==='novelai'?{ok:true,message:NOVELAI_ONLY_MESSAGE,revision}:retired() : stale());
  ipcMain.handle('images:generateCompatible', event => ({...(trusted(event)?retired():stale()),items:[]}));
  unsubscribe?.();
  unsubscribe = onImageSettingsChanged((notice) => {
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('images:settingsChanged', notice);
  });
}
