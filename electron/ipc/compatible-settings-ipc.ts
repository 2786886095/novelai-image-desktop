import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {getSettings} from './store';
import { onImageSettingsChanged } from './image-settings-events';
import {saveCompatibleImageSettings,switchCompatibleImageProvider,generateConfiguredImages} from './compatible-generation';
import {verifyNovelAiImageEnvelope} from './novelai-image-envelope';

let unsubscribe: (() => void) | undefined;
export function registerCompatibleImageIpc(getWindow: () => BrowserWindow | null) {
  // Only the local main renderer owns these settings. Remote Agent pages use the authenticated bridge.
  const trusted = (event: IpcMainInvokeEvent) => {
    const win = getWindow();
    return !!win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  };
  const hasRevision = (revision: unknown): revision is string => typeof revision === 'string' && revision.length > 0;
  const stale = () => ({ ok: false, code: 'stale', message: '请重新读取图片服务配置后重试。' });
  ipcMain.handle('images:saveCompatibleSettings', async (event,config,key,provider,revision) => {
    if(!trusted(event)||!hasRevision(revision)||revision!==getSettings().imageServiceRevision) return stale();
    if(provider!=='openai-images') return {ok:false,message:'仅通过此入口保存 NovelAI 兼容中转。'};
    let candidate; try { candidate=structuredClone(config); await verifyNovelAiImageEnvelope(candidate,key); }
    catch { return {ok:false,message:'验证未通过：请检查接口、独立 Token 和 NovelAI 模型；未保存配置。'}; }
    if(!trusted(event)) return stale();
    return saveCompatibleImageSettings(candidate,key,provider,revision);
  });
  ipcMain.handle('images:setCompatibleProvider', (event, provider, revision) =>
    trusted(event) && hasRevision(revision) && revision===getSettings().imageServiceRevision
      ? switchCompatibleImageProvider(provider,revision) : stale());
  ipcMain.handle('images:generateCompatible', (event,request) => trusted(event)&&hasRevision(request?.expectedImageServiceRevision)
    ? generateConfiguredImages(request) : {...stale(),items:[]});
  unsubscribe?.();
  unsubscribe = onImageSettingsChanged((notice) => {
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('images:settingsChanged', notice);
  });
}
