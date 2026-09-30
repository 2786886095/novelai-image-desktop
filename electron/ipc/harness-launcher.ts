import {createPluginAutoUpdater} from './harness-plugin-auto';
import {selectPluginChanges,planPluginUpgrades} from './harness-plugin-update';
import {retainedPrompts} from "../../src/retained-prompts.js";
import {createAgentBatchRun} from './agent-batch-run';
import {currentBatchImageBinding} from './batch-image-service';
import {cancelBatchRedraw,waitBatchRedraw} from './nai';
import {batchProjectCatalog,validateBatchAction} from '../../src/agent/batch-project-contract';
import {createAgentComicRun,desktopComicRunAdapter,comicSourceBinding} from './agent-comic-run';
import {desktopComicAssets} from './comic-assets';
import {agentImageProviderState, assertAgentImageProvider, assertAgentImageTool, bindAgentImageProvider, compatibleAgentInput, PAID_IMAGE_TOOLS} from './agent-image-provider';
import {createComicProjectHost} from './agent-comic-project';
import {comicProjectCatalog} from '../../src/agent/comic-project-contract';
import {app, dialog, ipcMain, shell, nativeTheme, type BrowserWindow} from 'electron';
import {showCenteredExitConfirmation} from './harness-exit-dialog';
import path from 'node:path';
import fs from 'node:fs/promises';
import {TEMPLATE_GENERATION_TOOL,templateGenerationArgs,runTemplateGeneration} from './harness-generation-workflow';
import {HarnessEngine} from './harness-engine';
import {planOfficialRuntime,downloadOfficialRuntime,downloadPluginUpdates,type OfficialRuntimeDownload} from './harness-official-runtime';
import {planHarnessDownload} from './harness-download-plan';
import {registerPortableBusy, assertPortableIdle} from './portable-projects';
import {startHarnessBridge} from './harness-bridge';
import {downloadCompatibleHarness,queryCompatibleHarness} from './harness-update';
import {HarnessDownloadConsent} from './harness-download-consent';
import {requiresAgentConfirmation} from '../../src/agent/operation-policy';
import {AGENT_MUTATING_TOOLS,AGENT_TOOL_NAMES, executeAgentTool} from './agent-tools';
import {createStudioDataTools,STUDIO_DATA_TOOLS} from './studio-data-tools';
import {getToken,getSetting,getSettings,setSetting,readStore,writeStore,getHistoryReferenceItems} from './store';
import {createFileActions} from './harness-file-actions';
import {createTemplateWorkflow} from './agent-template-tools';
import {createPromptTemplateTools,TEMPLATE_UI_TOOLS} from './harness-prompt-templates';
import {createImageApprovals,IMAGE_APPROVAL_TOOLS} from './harness-image-approval';
import {createApiTools,desktopApiAdapter,API_TOOLS} from './agent-api-tools';
import {createLibraryTools,desktopLibraryAdapter} from './agent-library-tools';
import {createBackupTools,desktopBackupAdapter} from './agent-backup-tools';
import {createSoftwareActions,SOFTWARE_ACTION_TOOLS} from './software-actions';
import {createCollectionActions,desktopCollectionAdapter} from './agent-collection-actions';
import {collectionActionCatalog} from '../../src/agent/collection-contract';
import {createResourceActions,desktopResourceAdapter} from './agent-resource-actions';
import {createNativeSoftwareActions,desktopNativeAdapter} from './agent-native-actions';
import {createComponentActions,componentActionCatalog} from './agent-component-actions';
import {createAppUpdateActions,appUpdateActionCatalog} from './agent-app-update';
import {desktopAppUpdateAdapter} from './auto-update';
import {createSessionControls,SESSION_CONTROL_TOOLS,scopedImageTools} from './harness-session-controls';
import {cancelGeneration} from './nai';
import {reconcileStylePromptPreviewImages} from './style-preset-images';
import {featureText} from '../../src/feature-text';
const ft=(key:string,params?:Record<string,string|number>)=>featureText(getSetting('language'),key,params);

let engine:HarnessEngine | null=null;
let pluginAuto:ReturnType<typeof createPluginAutoUpdater>|null=null;
let batchRun:ReturnType<typeof createAgentBatchRun>|null=null;
let comicRun:ReturnType<typeof createAgentComicRun>|null=null;
let component:ReturnType<typeof createComponentActions>|null=null;
let appUpdate:ReturnType<typeof createAppUpdateActions>|null=null;
let confirming:Promise<boolean> | null=null;
let quitting=false;
type AssistantExitLifecycle={isBusy:()=>boolean;stop:()=>unknown};
let assistantExit:AssistantExitLifecycle={isBusy:()=>false,stop:()=>undefined};
export function registerHarnessLauncher(window:()=>BrowserWindow|null,assistant?:AssistantExitLifecycle) {
  if(assistant)assistantExit=assistant;
  const files=createFileActions(()=>getHistoryReferenceItems(),file=>shell.showItemInFolder(file));
  const approvals=createImageApprovals();
  const native=createNativeSoftwareActions(desktopNativeAdapter(window),request=>approvals.wait(request));
  const resources=createResourceActions(desktopResourceAdapter(),request=>approvals.wait(request));
  const software=createSoftwareActions(request=>approvals.wait(request),{...native.catalog,...componentActionCatalog,...resources.catalog,...appUpdateActionCatalog,...collectionActionCatalog,...comicProjectCatalog,...batchProjectCatalog});
  const studioData=createStudioDataTools(window,15000,request=>approvals.wait(request));
  const comicProject=createComicProjectHost(studioData.comicProject,request=>approvals.wait(request),()=>path.join(app.getPath('userData'),'TavernAgent','comic-exports'),{...desktopComicAssets(),outputRoot:()=>getSettings().outputDir});
  const collections=createCollectionActions(desktopCollectionAdapter(studioData.collections,window),request=>approvals.wait(request));
  const api=createApiTools(desktopApiAdapter(),request=>approvals.wait(request));
  const libraries=createLibraryTools(desktopLibraryAdapter(),request=>approvals.wait(request));
  const backups=createBackupTools(desktopBackupAdapter(studioData.backupWorkspace,studioData.restoreWorkspace),request=>approvals.wait(request));
  const templates=createPromptTemplateTools(getSettings,setSetting,patch=>{const current=readStore();writeStore({...current,settings:{...current.settings,...patch}});});
  const templateWorkflow=createTemplateWorkflow(templates,request=>approvals.wait(request),async()=>{const result=await(await import('./data-backup.js')).exportDataBackup({categories:['configuration'],destination:'internal'});if(!result.ok||!result.path)throw Error('模板修改前备份失败：'+result.message);return result.path;});
  const root=path.join(app.getPath('userData'),'TavernAgent');
  const updater=desktopAppUpdateAdapter(message=>engine?.log(message));
  appUpdate=createAppUpdateActions(root,{...updater,reserve:()=>{assertPortableIdle();if(component?.busy||pluginAuto?.snapshot().phase==='updating')throw Error('组件操作尚未完成，请稍后更新软件');updater.reserve();}},request=>approvals.wait(request));
  component=createComponentActions(root,{
    snapshot:()=>engine!.snapshot(),query:queryCompatibleHarness,
    stop:()=>engine!.stop(),
    prepare:(asset,reinstall)=>engine!.prepareUpdate('component',signal=>downloadCompatibleHarness(root,signal,text=>engine!.log(text),asset),reinstall),
    apply:token=>engine!.applyPreparedUpdate(token),uninstall:()=>engine!.uninstallComponent(),
    log:message=>engine!.log(message),
  },request=>approvals.wait(request));
  const sessions=createSessionControls(path.join(root,'session-generation'),()=>getSetting('stylePromptPresets'),cancelGeneration,preset=>reconcileStylePromptPreviewImages(preset.id,preset.previewImages));
  comicRun=createAgentComicRun(root,{...desktopComicRunAdapter(studioData.comicProject,studioData.comicRunSettled),source:()=>{const settings=getSettings();return comicSourceBinding(settings,settings.imageProvider==='openai-images'?'':getToken()??'');}},sessions,request=>approvals.wait(request));
  batchRun=createAgentBatchRun(root,{ask:studioData.batchProject,wait:studioData.batchRunSettled,source:currentBatchImageBinding,cancelNative:async id=>cancelBatchRedraw(id),waitNative:async id=>waitBatchRedraw(id)},sessions,request=>approvals.wait(request));
  void batchRun.initialize.catch(error=>engine?.log(String(error),'error'));
  void comicRun.initialize.catch(error=>engine?.log(String(error),'error'));
  const paid=PAID_IMAGE_TOOLS;
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
        if(batchRun!.handles(request))return batchRun!.execute(request);
        if(request.tool==='langbai_software_action'&&Object.hasOwn(batchProjectCatalog,String(request.args.action))){validateBatchAction(request.args);const data=await studioData.batchProject(request.args);return {ok:true,title:'批量重绘工程',data,output:JSON.stringify(data)};}
        if(comicRun!.handles(request))return comicRun!.execute(request);
        if(comicProject.handles(request))return comicProject.execute(request);
        if(collections.handles(request))return collections.execute(request);
        if(appUpdate!.handles(request)){if(request.args.action==='app.update.install')assertPortableIdle();return appUpdate!.execute(request);}
        if(component!.handles(request)){assertPortableIdle();if(pluginAuto?.snapshot().phase==='updating')throw Error('插件更新正在进行，请稍后重试。');if(appUpdate!.busy&&request.args.action!=='component.status')throw Error('软件更新已交接，请等待完成');return component!.execute(request);}
        if(native.handles(request))return native.execute(request);
        if(resources.handles(request))return resources.execute(request);
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
        // Capture before session I/O or approval. Raw bridge JSON cannot set this field.
        if(paid.has(request.tool)){
          try {
          const settings=getSettings();
          request={...request,imageProviderBinding:bindAgentImageProvider(settings)};
          assertAgentImageTool(request.tool,settings);
          if(settings.imageProvider==='openai-images')compatibleAgentInput(request.args,settings,!templateInput);
          } catch(error) {return {ok:false,title:'生图未提交',output:error instanceof Error?error.message:'图片服务配置无效'};}
        }
        const compatible=getSettings().imageProvider==='openai-images';
        const id=request.sessionId??'';
        const needsStyle=scopedImageTools.has(request.tool)||request.tool==='langbai_get_generation_state';
        const state=needsStyle?await sessions.read(id):null;
        if(state?.style&&!compatible)request={...request,promptLocks:{stylePrompt:state.style.prompt,negativePrompt:retainedPrompts(getSettings()).negativePrompt}};
        if(studioData.handles(request.tool)){
          const result=await studioData.execute(request);
          if(request.tool==='langbai_get_generation_state'&&state?.style&&result.ok&&(result.data as Record<string,unknown>)?.imageProvider!=='openai-images'){
            const current=result.data as Record<string,unknown>;
            const data={...current,params:{...(current.params as object),stylePrompt:state.style.prompt},lockedStylePrompt:state.style.prompt,sessionStyle:state.style};
            return {...result,data,output:JSON.stringify(data)};
          }return result;
        }
        const relevant=()=>{const s=getSettings();return JSON.stringify([s.lastGenerationState,s.lockStylePrompt,s.savedStylePrompt,s.lockNegativePrompt,s.savedNegativePrompt,s.modelMode,s.convertPromptTemplates,s.convertPromptTemplatesV45,s.convertPromptTemplateVersion,s.agentPromptTemplateMode,s.reversePromptTemplates,s.reversePromptTemplatesV45,s.reversePromptTemplateVersion,bindAgentImageProvider(s).revision]);};
        const workflowRevision=relevant();
        let started=false;
        try {
        if(paid.has(request.tool)){request={...request,signal:sessions.begin(id)};started=true;}
        if(paid.has(request.tool)&&!await sessions.authorize(request)) {
          const revision=relevant(),settings=getSettings();
          const approved=await approvals.wait({...request,args:{...(compatible?{imageService:agentImageProviderState(settings).imageService}:settings.lastGenerationState?.params),...request.args,...(templateInput?{templateWorkflow:true,description:templateInput.text??'参考图反推生图'}:{})}});
          if(!approved)return {ok:false,title:ft('已取消'),output:'Agent 内已取消或确认超时，未执行生图。'};
          if(relevant()!==revision)return {ok:false,title:'参数已变化',output:'确认期间工作台参数发生变化，未执行生图；请重新发起并确认新参数。'};
        }
        if(!paid.has(request.tool)&&(AGENT_MUTATING_TOOLS as readonly string[]).includes(request.tool)&&requiresAgentConfirmation(request.tool,request.args)&&!await approvals.wait(request))return {ok:false,title:'已取消',output:'Agent 内未确认，操作未执行。'};
        if(paid.has(request.tool))assertAgentImageProvider(getSettings(),request.imageProviderBinding);
        engine?.log(`Studio 工具：${request.tool}`);
        request.signal?.throwIfAborted();
        const execute=(r:typeof request)=>executeAgentTool(r,event=>{const win=window();if(win && !win.isDestroyed())win.webContents.send('agent:event',event);});
        const result=templateInput?await runTemplateGeneration(request,templateInput,execute,()=>relevant()===workflowRevision):await execute(request);
        engine?.log(`${request.tool} · ${result.ok?'完成':'失败'}`,result.ok?'info':'warn');
        return result;
        }catch(error){return {ok:false,title:'软件操作未完成',output:error instanceof Error?error.message:String(error)};}
        finally{if(started)sessions.end(id);}
      },
      afterResponse:(request,result,delivered)=>{component!.afterResponse(request,result,delivered);appUpdate!.afterResponse(request,result,delivered);comicRun!.afterResponse(request,result,delivered);batchRun!.afterResponse(request,result,delivered);},
    });return {...bridge,close:async()=>{approvals.close();api.close();await comicRun?.close();await batchRun?.close();await bridge.close();}};},
  });
  void component.initialize().catch(error=>engine!.log(String(error),'error'));
  void appUpdate.initialize().catch(error=>engine!.log(String(error),'error'));
  const assertComponentIdle=()=>{if(component?.busy||appUpdate?.busy||pluginAuto?.snapshot().phase==='updating')throw Error('更新操作已交接，请等待完成或点击停止；勿重复安装。');};
  const externalBusy=()=>{try{assertPortableIdle();}catch{return true;}return !!engine?.busy||!!component?.busy||!!appUpdate?.busy||!!comicRun?.busy||!!batchRun?.busy||quitting;};
  pluginAuto=createPluginAutoUpdater({
    enabled:()=>getSetting('harnessAutoUpdatePlugins')!==false,
    busy:externalBusy,
    plan:async signal=>{
      const snapshot=await engine!.refreshInstalledState();
      if(!snapshot.installedUpstream)throw Error('请先安装 Agent 组件，再检查插件。');
      return planPluginUpgrades(root,snapshot.installedUpstream,AbortSignal.any([signal,AbortSignal.timeout(120000)]),true);
    },
    apply:async(changes,signal)=>{
      assertPortableIdle();if(externalBusy())throw Error('其他操作正在进行，稍后重试插件更新。');
      await engine!.updatePlugins(s=>downloadPluginUpdates(root,changes,s,text=>engine!.log(text)),signal);
    },
  });
  const autoCheck=()=>{void engine!.refreshInstalledState().then(s=>{if(s.version)void pluginAuto?.request();}).catch(error=>engine?.log(String(error),'warn'));};
  const firstCheck=setTimeout(()=>{void engine?.checkUpdates();autoCheck();},15000);firstCheck.unref();
  const pluginQueue=setInterval(()=>{void pluginAuto?.tick();},15000);pluginQueue.unref();
  ipcMain.handle('harness:setAutoPluginUpdates',async(event,enabled)=>{
    if(event.sender!==window()?.webContents)throw Error('Unknown launcher sender');
    if(typeof enabled!=='boolean')throw Error('Invalid setting');
    setSetting('harnessAutoUpdatePlugins',enabled);
    if(enabled)autoCheck();else pluginAuto!.cancel();
    return pluginAuto!.snapshot();
  });
  ipcMain.handle('harness:checkPluginUpdates',async event=>{
    if(event.sender!==window()?.webContents)throw Error('Unknown launcher sender');
    void pluginAuto!.request(true);return pluginAuto!.snapshot();
  });
  registerPortableBusy(()=>!!engine?.busy||!!component?.busy||!!appUpdate?.busy||!!comicRun?.busy||!!batchRun?.busy);
  ipcMain.handle('harness:openBackups',async event=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    const directory=path.join(root,'backups');await fs.mkdir(directory,{recursive:true});
    const error=await shell.openPath(directory);if(error)throw Error(error);
  });
  ipcMain.handle('harness:restoreBackup',async event=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    assertPortableIdle();assertComponentIdle();if(engine!.busy)throw Error(ft('请先关闭 Agent，再恢复备份。'));
    const options={title:ft('选择要恢复的 Agent 备份'),buttonLabel:ft('恢复此备份'),defaultPath:path.join(root,'backups'),properties:['openDirectory'] as Array<'openDirectory'>};
    const owner=window();const result=await(owner?dialog.showOpenDialog(owner,options):dialog.showOpenDialog(options));
    if(!result.canceled && result.filePaths[0]){assertPortableIdle();await engine!.restoreBackup(result.filePaths[0]);}
    return engine!.snapshot();
  });
  const periodicCheck=setInterval(()=>{void engine?.checkUpdates();autoCheck();},6*60*60*1000);periodicCheck.unref();
  app.once('will-quit',()=>{clearTimeout(firstCheck);clearInterval(periodicCheck);clearInterval(pluginQueue);void pluginAuto?.dispose();});
  const downloadConsent=new HarnessDownloadConsent();
  const officialConsent=new HarnessDownloadConsent<OfficialRuntimeDownload>();
  ipcMain.handle('harness:planDownload',async(event,kind,reinstall=false)=>{
    if(event.sender!==window()?.webContents)throw Error('Unknown launcher sender');
    if(!['component','official'].includes(kind)||typeof reinstall!=='boolean')throw Error('Invalid request');
    assertPortableIdle();assertComponentIdle();if(engine!.busy)throw Error('请先关闭 Agent。');
    downloadConsent.clear();officialConsent.clear();const installed=await engine!.refreshInstalledState();
    return planHarnessDownload({kind,reinstall,installed,consent:downloadConsent,
      checkOfficial:async()=>{await engine!.checkUpdates();return engine!.snapshot().updateInfo;},
      query:()=>queryCompatibleHarness(AbortSignal.timeout(30000)),
      queryOfficial:async version=>{const asset=await planOfficialRuntime(root,version,AbortSignal.timeout(60000));return {...officialConsent.issue(asset,'official',false),official:true,pluginUpdates:asset.pluginUpdates.map(({name,fromVersion,version,description,reason,canDisable})=>({name,fromVersion,version,description,reason,canDisable}))};},
    });
  });
  ipcMain.handle('harness:uninstall',async(event,confirmed)=>{
    if(event.sender!==window()?.webContents)throw Error('Unknown launcher sender');
    if(confirmed!==true)throw Error('请先确认卸载。');assertPortableIdle();assertComponentIdle();downloadConsent.clear();officialConsent.clear();
    void engine!.uninstallComponent().catch(error=>engine?.log(String(error),'error'));return engine!.snapshot();
  });
  ipcMain.handle('harness:prepareUpdate',async(event,kind,token,disablePlugins:unknown=[])=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    assertPortableIdle();assertComponentIdle();
    if(kind==='official'){const consent=officialConsent.consume(token,kind);consent.asset.pluginUpdates=selectPluginChanges(consent.asset.pluginUpdates,disablePlugins as string[]);return engine!.prepareUpdate(kind,signal=>downloadOfficialRuntime(root,consent.asset,signal,text=>engine!.log(text)));}
    const consent=downloadConsent.consume(token,kind);
    return engine!.prepareUpdate(kind,signal=>downloadCompatibleHarness(root,signal,text=>engine!.log(text),consent.asset),consent.reinstall);
  });
  ipcMain.handle('harness:applyPreparedUpdate',async(event,token)=>{
    if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
    if(typeof token!=='string')throw Error('Invalid confirmation');
    assertPortableIdle();assertComponentIdle();await engine!.applyPreparedUpdate(token);return engine!.snapshot();
  });
  ipcMain.handle('harness:update',()=>{throw Error('请先检查兼容性并确认升级。');});
  for(const action of ['snapshot','start','stop','checkUpdates'] as const) {
    ipcMain.handle(`harness:${action}`,async event=>{
      if(event.sender!==window()?.webContents)throw new Error('Unknown launcher sender');
      if(action==='snapshot')await engine!.refreshInstalledState();
      if(action==='checkUpdates'){await engine!.checkUpdates();await engine!.refreshInstalledState();}
      else if(action!=='snapshot') {
        if(action==='start'){assertPortableIdle();assertComponentIdle();}
        if(action==='stop')approvals.close();
        // Return immediately; continuous progress arrives through the bounded snapshot endpoint.
        void (action==='stop'?(async()=>{await appUpdate?.cancel();await component?.cancel();await engine!.stop();})():engine![action]()).catch(error=>engine?.log(String(error),'error'));
      }
      return {...engine!.snapshot(),pluginAuto:pluginAuto?.snapshot(),componentOperation:component?.operation??null,appUpdateOperation:appUpdate?.operation??null};
    });
  }
}
export function harnessNeedsExitConfirmation() {return !quitting && (assistantExit.isBusy()||!!engine?.busy||!!component?.busy||!!appUpdate?.busy||!!comicRun?.busy||!!batchRun?.busy);}
export async function confirmHarnessExit(window:BrowserWindow|null) {
  if(!harnessNeedsExitConfirmation())return true;
  if(confirming)return confirming;
  confirming=(async()=>{
    const options={type:'question' as const,title:ft('退出软件确认'),message:ft('退出软件？'),detail:ft('仍有任务正在运行。退出会停止助手和本地任务，已保存的聊天与图片不会删除。已提交的生图请求可能继续计费，重新打开后请先查看历史。'),buttons:[ft('取消退出'),ft('停止任务并退出')],defaultId:0,cancelId:0,noLink:true};
    const theme=getSetting('theme');
    const result=await showCenteredExitConfirmation(window,options,theme==='dark'||(theme==='system'&&nativeTheme.shouldUseDarkColors));
    if(result.response!==1)return false;
    try{quitting=true;await assistantExit.stop();await pluginAuto?.dispose();await appUpdate?.cancel();await component?.cancel();await engine?.stop();return true;}
    catch(error){quitting=false;engine?.log(`停止失败：${String(error)}`,'error');return false;}
  })();
  try{return await confirming;}finally{confirming=null;}
}

/** The update button already authorizes restart; do not open a second exit dialog. */
export async function stopHarnessForUpdate() {
  await pluginAuto?.cancelAndWait();
  await component?.cancel();
  if(engine?.busy) await engine.stop();
  quitting=true;
}
export function resetHarnessExitAfterUpdateFailure(){quitting=false;}
