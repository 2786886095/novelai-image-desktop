import {app, dialog, ipcMain, shell, type BrowserWindow} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {HarnessEngine} from './harness-engine';
import {registerPortableBusy, assertPortableIdle} from './portable-projects';
import {startHarnessBridge} from './harness-bridge';
import {downloadCompatibleHarness} from './harness-update';
import {AGENT_TOOL_NAMES, executeAgentTool} from './agent-tools';
import {createStudioDataTools,STUDIO_DATA_TOOLS} from './studio-data-tools';
import {getSetting} from './store';
import {featureText} from '../../src/feature-text';
const ft=(key:string,params?:Record<string,string|number>)=>featureText(getSetting('language'),key,params);

let engine:HarnessEngine | null=null;
let confirming:Promise<boolean> | null=null;
let quitting=false;
export function registerHarnessLauncher(window:()=>BrowserWindow|null) {
  const studioData=createStudioDataTools(window);
  const root=path.join(app.getPath('userData'),'TavernAgent');
  const paid=new Set(['langbai_generate_image','langbai_redraw_image','langbai_inpaint_image','langbai_upscale_image','langbai_director']);
  engine=new HarnessEngine({
    root,
    previewSource:app.isPackaged?path.join(process.resourcesPath,'studio-preview'):path.join(app.getAppPath(),'harness/plugins/studio-preview'),
    seed:app.isPackaged?path.join(process.resourcesPath,'harness-seed'):path.join(app.getAppPath(),'.tmp/harness-component012'),
    workspace:app.isPackaged?path.dirname(app.getPath('exe')):app.getAppPath(),
    openBrowser:url=>shell.openExternal(url),
    updateSource:(signal,log)=>downloadCompatibleHarness(root,signal,log),
    bridge:()=>startHarnessBridge({
      journal:path.join(root,'tool-journal'),tools:[...AGENT_TOOL_NAMES,...STUDIO_DATA_TOOLS],
      execute:async request=>{
        if(studioData.handles(request.tool))return studioData.execute(request);
        if(paid.has(request.tool)) {
          const owner=window();
          const options={type:'question' as const,title:ft('酒馆 Agent · 生图任务'),message:ft('Agent 请求调用 NovelAI 图片工具，可能消耗 Anlas。'),detail:ft('工具：{tool}。确认后执行本次任务。',{tool:request.tool}),buttons:[ft('取消'),ft('执行本次任务')],defaultId:0,cancelId:0,noLink:true};
          const result=await(owner?dialog.showMessageBox(owner,options):dialog.showMessageBox(options));
          if(result.response!==1)return {ok:false,title:ft('已取消'),output:ft('用户取消本次生图任务。')};
        }
        engine?.log(`Studio 工具：${request.tool}`);
        const result=await executeAgentTool(request,event=>{const win=window();if(win && !win.isDestroyed())win.webContents.send('agent:event',event);});
        engine?.log(`${request.tool} · ${result.ok?'完成':'失败'}`,result.ok?'info':'warn');
        return result;
      },
    }),
  });
  const firstCheck=setTimeout(()=>{void engine?.checkUpdates();},15000);firstCheck.unref();
  registerPortableBusy(()=>!!engine?.busy);
  ipcMain.handle('harness:openBackups',async event=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    const directory=path.join(root,'backups');await fs.mkdir(directory,{recursive:true});
    const error=await shell.openPath(directory);if(error)throw Error(error);
  });
  ipcMain.handle('harness:restoreBackup',async event=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    assertPortableIdle();if(engine!.busy)throw Error(ft('请先关闭 Agent，再恢复备份。'));
    const options={title:ft('选择要恢复的 Agent 备份'),buttonLabel:ft('恢复此备份'),defaultPath:path.join(root,'backups'),properties:['openDirectory'] as Array<'openDirectory'>};
    const owner=window();const result=await(owner?dialog.showOpenDialog(owner,options):dialog.showOpenDialog(options));
    if(!result.canceled && result.filePaths[0]){assertPortableIdle();await engine!.restoreBackup(result.filePaths[0]);}
    return engine!.snapshot();
  });
  const periodicCheck=setInterval(()=>{void engine?.checkUpdates();},6*60*60*1000);periodicCheck.unref();
  app.once('will-quit',()=>{clearTimeout(firstCheck);clearInterval(periodicCheck);});
  ipcMain.handle('harness:prepareUpdate',async(event,kind)=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    assertPortableIdle();return engine!.prepareUpdate(kind);
  });
  ipcMain.handle('harness:applyPreparedUpdate',async(event,token)=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    if(typeof token!=='string')throw Error('Invalid confirmation');
    assertPortableIdle();await engine!.applyPreparedUpdate(token);return engine!.snapshot();
  });
  ipcMain.handle('harness:update',()=>{throw Error('请先检查兼容性并确认升级。');});
  for(const action of ['snapshot','start','stop','checkUpdates'] as const) {
    ipcMain.handle(`harness:${action}`,async event=>{
      if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
      if(action!=='snapshot') {
        if(action==='start')assertPortableIdle();
        // Return immediately; continuous progress arrives through the bounded snapshot endpoint.
        void engine![action]().catch(error=>engine?.log(String(error),'error'));
      }
      return engine!.snapshot();
    });
  }
}
export function harnessNeedsExitConfirmation() {return !quitting && !!engine?.busy;}
export async function confirmHarnessExit(window:BrowserWindow|null) {
  if(!harnessNeedsExitConfirmation())return true;
  if(confirming)return confirming;
  confirming=(async()=>{
    const options={type:'question' as const,title:ft('酒馆 Agent 仍在运行'),message:ft('退出软件会同时关闭酒馆 Agent。'),detail:ft('正在执行的 Agent 任务会中断。是否关闭 Agent 并退出？'),buttons:[ft('取消退出'),ft('关闭 Agent 并退出')],defaultId:0,cancelId:0,noLink:true};
    const result=await(window?dialog.showMessageBox(window,options):dialog.showMessageBox(options));
    if(result.response!==1)return false;
    try{await engine!.stop();quitting=true;return true;}
    catch(error){engine?.log(`停止失败：${String(error)}`,'error');return false;}
  })();
  try{return await confirming;}finally{confirming=null;}
}
