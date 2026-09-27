import {app, dialog, ipcMain, shell, type BrowserWindow} from 'electron';
import {showCenteredExitConfirmation} from './harness-exit-dialog';
import path from 'node:path';
import fs from 'node:fs/promises';
import {TEMPLATE_GENERATION_TOOL,templateGenerationArgs,runTemplateGeneration} from './harness-generation-workflow';
import {HarnessEngine} from './harness-engine';
import {registerPortableBusy, assertPortableIdle} from './portable-projects';
import {startHarnessBridge} from './harness-bridge';
import {downloadCompatibleHarness} from './harness-update';
import {requiresAgentConfirmation} from '../../src/agent/operation-policy';
import {AGENT_MUTATING_TOOLS,AGENT_TOOL_NAMES, executeAgentTool} from './agent-tools';
import {createStudioDataTools,STUDIO_DATA_TOOLS} from './studio-data-tools';
import {getSetting,getSettings,setSetting,readStore,writeStore,getHistoryReferenceItems} from './store';
import {createFileActions} from './harness-file-actions';
import {createTemplateWorkflow} from './agent-template-tools';
import {createPromptTemplateTools,TEMPLATE_UI_TOOLS} from './harness-prompt-templates';
import {createImageApprovals,IMAGE_APPROVAL_TOOLS} from './harness-image-approval';
import {createApiTools,desktopApiAdapter,API_TOOLS} from './agent-api-tools';
import {createLibraryTools,desktopLibraryAdapter} from './agent-library-tools';
import {createBackupTools,desktopBackupAdapter} from './agent-backup-tools';
import {createSoftwareActions,SOFTWARE_ACTION_TOOLS} from './software-actions';
import {createSessionControls,SESSION_CONTROL_TOOLS,scopedImageTools} from './harness-session-controls';
import {cancelGeneration} from './nai';
import {reconcileStylePromptPreviewImages} from './style-preset-images';
import {featureText} from '../../src/feature-text';
const ft=(key:string,params?:Record<string,string|number>)=>featureText(getSetting('language'),key,params);

let engine:HarnessEngine | null=null;
let confirming:Promise<boolean> | null=null;
let quitting=false;
export function registerHarnessLauncher(window:()=>BrowserWindow|null) {
  const files=createFileActions(()=>getHistoryReferenceItems(),file=>shell.showItemInFolder(file));
  const approvals=createImageApprovals();
  const software=createSoftwareActions(request=>approvals.wait(request));
  const studioData=createStudioDataTools(window,15000,request=>approvals.wait(request));
  const api=createApiTools(desktopApiAdapter(),request=>approvals.wait(request));
  const libraries=createLibraryTools(desktopLibraryAdapter(),request=>approvals.wait(request));
  const backups=createBackupTools(desktopBackupAdapter(studioData.backupWorkspace,studioData.restoreWorkspace),request=>approvals.wait(request));
  const templates=createPromptTemplateTools(getSettings,setSetting,patch=>{const current=readStore();writeStore({...current,settings:{...current.settings,...patch}});});
  const templateWorkflow=createTemplateWorkflow(templates,request=>approvals.wait(request),async()=>{const result=await(await import('./data-backup.js')).exportDataBackup({categories:['configuration'],destination:'internal'});if(!result.ok||!result.path)throw Error('模板修改前备份失败：'+result.message);return result.path;});
  const root=path.join(app.getPath('userData'),'TavernAgent');
  const sessions=createSessionControls(path.join(root,'session-generation'),()=>getSetting('stylePromptPresets'),cancelGeneration,preset=>reconcileStylePromptPreviewImages(preset.id,preset.previewImages));
  const paid=new Set(['langbai_generate_image','langbai_redraw_image','langbai_inpaint_image','langbai_upscale_image','langbai_director']);
  engine=new HarnessEngine({
    root,
    previewSource:app.isPackaged?path.join(process.resourcesPath,'studio-preview'):path.join(app.getAppPath(),'harness/plugins/studio-preview'),
    librarySource:app.isPackaged?path.join(process.resourcesPath,'studio-library'):path.join(app.getAppPath(),'harness/plugins/studio-library'),
    toolsSource:app.isPackaged?path.join(process.resourcesPath,'studio-tools'):path.join(app.getAppPath(),'harness/plugins/studio-tools'),
    responsiveSource:app.isPackaged?path.join(process.resourcesPath,'studio-responsive'):path.join(app.getAppPath(),'harness/plugins/studio-responsive'),
    seed:app.isPackaged?path.join(process.resourcesPath,'harness-seed'):path.join(app.getAppPath(),'.tmp/harness-component016'),
    workspace:app.isPackaged?path.dirname(app.getPath('exe')):app.getAppPath(),
    openBrowser:url=>shell.openExternal(url),
    updateSource:(signal,log)=>downloadCompatibleHarness(root,signal,log),
    bridge:async()=>{const bridge=await startHarnessBridge({
      journal:path.join(root,'tool-journal'),tools:[TEMPLATE_GENERATION_TOOL,...AGENT_TOOL_NAMES,...STUDIO_DATA_TOOLS,...SESSION_CONTROL_TOOLS,...TEMPLATE_UI_TOOLS,...IMAGE_APPROVAL_TOOLS,...SOFTWARE_ACTION_TOOLS,...API_TOOLS,'langbai_templates','langbai_backup','langbai_library','studio_material_source','studio_material_confirm','studio_reveal_image'],
      execute:async request=>{
        if(request.tool==='studio_reveal_image')return {...await files(request),title:'打开图片所在文件夹'};
        if(api.handles(request.tool)){const result=await api.execute(request);if(result.ok&&result.data&&(result.data as Record<string,unknown>).saved){const refresh=await studioData.execute({...request,tool:'langbai_read_studio_state',args:{refreshApi:true}});const data={...(result.data as object),rendererRefreshRequested:refresh.ok};return {...result,data,output:JSON.stringify(data)};}return result;}
        if(request.tool==='langbai_tasks'&&request.args.action==='cancel')approvals.cancelGeneration(request.sessionId??'');
        if(libraries.handles(request.tool)){const result=await libraries.execute(request);if(result.ok&&request.tool==='langbai_library'&&request.args.action!=='read'){const refreshed=await studioData.execute({...request,tool:'langbai_read_studio_state',args:{refreshLibrary:true}});const data={...result.data,rendererRefreshRequested:refreshed.ok,...(!refreshed.ok?{notice:'资料已保存，页面刷新未完成；重新打开资料页查看，不要重复修改。'}:{})};return {...result,data,output:JSON.stringify(data)};}return result;}
        if(backups.handles(request.tool))return backups.execute(request);
        if(software.handles(request.tool)){
          const result=await software.execute(request);
          if(result.ok&&result.data&&'executed' in result.data&&result.data.executed){
            const action=String(request.args.action),category=action.startsWith('history.')?'history':action.startsWith('references.')?'references':action.startsWith('text.convert.')?'text.convert':'text.reverse';
            const refreshed=await studioData.execute({...request,tool:'langbai_read_studio_state',args:{refreshCollections:category}});
            const data={...result.data,rendererRefreshRequested:refreshed.ok,...(!refreshed.ok?{notice:'资料已保存，但页面刷新未完成；重新打开该页面即可，不要重复修改。'}:{})};
            return {...result,data,output:JSON.stringify(data)};
          }
          return result;
        }
        if(approvals.handles(request.tool))return approvals.execute(request);
        if(templateWorkflow.handles(request.tool)){const result=await templateWorkflow.execute(request);if(result.ok&&request.args.action!=='read')await studioData.execute({...request,tool:'langbai_read_studio_state',args:{refreshTemplates:true}});return result;}
        if(templates.handles(request.tool)){
          const result=templates.execute(request);
          if(result.ok&&request.tool==='studio_save_prompt_template'){
            // Refresh only template settings in the renderer, never its generation drafts.
            await studioData.execute({...request,tool:'langbai_read_studio_state',args:{refreshTemplates:true}});
          }
          return result;
        }
      if(sessions.handles(request.tool))return sessions.execute(request);
        const templateInput=request.tool===TEMPLATE_GENERATION_TOOL?request.args:null;
        if(templateInput)request={...request,tool:'langbai_generate_image',args:templateGenerationArgs(templateInput)};
        const id=request.sessionId??'';
        const needsStyle=scopedImageTools.has(request.tool)||request.tool==='langbai_get_generation_state';
        const state=needsStyle?await sessions.read(id):null;
        if(state?.style)request={...request,promptLocks:{stylePrompt:state.style.prompt,...(getSetting('lockNegativePrompt')?{negativePrompt:getSetting('savedNegativePrompt')}:{})}};
        if(studioData.handles(request.tool)){
          const result=await studioData.execute(request);
          if(request.tool==='langbai_get_generation_state'&&state?.style&&result.ok){
            const data=result.data as Record<string,unknown>;
            result.data={...data,params:{...(data.params as object),stylePrompt:state.style.prompt},lockedStylePrompt:state.style.prompt,sessionStyle:state.style};
            return {...result,data,output:JSON.stringify(data)};
          }return result;
        }
        const relevant=()=>{const s=getSettings();return JSON.stringify([s.lastGenerationState,s.lockStylePrompt,s.savedStylePrompt,s.lockNegativePrompt,s.savedNegativePrompt,s.modelMode,s.convertPromptTemplates,s.convertPromptTemplatesV45,s.convertPromptTemplateVersion,s.agentPromptTemplateMode,s.reversePromptTemplates,s.reversePromptTemplatesV45,s.reversePromptTemplateVersion]);};
        const workflowRevision=relevant();
        let started=false;
        try {
        if(paid.has(request.tool)){request={...request,signal:sessions.begin(id)};started=true;}
        if(paid.has(request.tool)&&!await sessions.authorize(request)) {
          const revision=relevant(),settings=getSettings();
          const approved=await approvals.wait({...request,args:{...settings.lastGenerationState?.params,...request.args,...(templateInput?{templateWorkflow:true,description:templateInput.text??'参考图反推生图'}:{})}});
          if(!approved)return {ok:false,title:ft('已取消'),output:'Agent 内已取消或确认超时，未执行生图。'};
          if(relevant()!==revision)return {ok:false,title:'参数已变化',output:'确认期间工作台参数发生变化，未执行生图；请重新发起并确认新参数。'};
        }
        if(!paid.has(request.tool)&&(AGENT_MUTATING_TOOLS as readonly string[]).includes(request.tool)&&requiresAgentConfirmation(request.tool,request.args)&&!await approvals.wait(request))return {ok:false,title:'已取消',output:'Agent 内未确认，操作未执行。'};
        engine?.log(`Studio 工具：${request.tool}`);
        request.signal?.throwIfAborted();
        const execute=(r:typeof request)=>executeAgentTool(r,event=>{const win=window();if(win && !win.isDestroyed())win.webContents.send('agent:event',event);});
        const result=templateInput?await runTemplateGeneration(request,templateInput,execute,()=>relevant()===workflowRevision):await execute(request);
        engine?.log(`${request.tool} · ${result.ok?'完成':'失败'}`,result.ok?'info':'warn');
        return result;
        }catch(error){return {ok:false,title:'软件操作未完成',output:error instanceof Error?error.message:String(error)};}
        finally{if(started)sessions.end(id);}
      },
    });return {...bridge,close:async()=>{approvals.close();api.close();await bridge.close();}};},
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
        if(action==='stop')approvals.close();
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
    const result=await showCenteredExitConfirmation(window,options,getSetting('theme')==='dark');
    if(result.response!==1)return false;
    try{await engine!.stop();quitting=true;return true;}
    catch(error){engine?.log(`停止失败：${String(error)}`,'error');return false;}
  })();
  try{return await confirming;}finally{confirming=null;}
}
