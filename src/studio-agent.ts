import {getBatchGenerationQueue,getBatchProjectStore} from './batch/use-batch-generation';
import {createBatchProjectActions} from './agent/batch-project-actions';
import {getComicGenerationQueue} from './comic/use-comic-generation';
import {mergeFullSettings} from "./compatible-image-settings-sync";
import {getComicProjectStore} from './comic/use-comic-project';
import {createComicProjectActions} from './agent/comic-project-actions';
import {collectPortableWorkspaceData,mergePortableWorkspaceData} from './features/settings/data-backup-workspace';
import {flushArtistFavoritePersistence,hydrateArtistFavoriteLibrary} from './artist-favorite-library';
import {validateTaskRequest} from './agent/task-contract';
import {useAppStore} from './store';
import {createRendererCollections} from './agent/renderer-collections';
import {normalizeGenerateParams, type AppSettings, type LastGenerationState, type SettingKey, type StylePromptPreset} from './types';
import {projectStudioData,STUDIO_WRITABLE,validateStudioPatch,validateStyleInput,type StudioAgentRequest,type StudioAgentReply} from './studio-agent-contract';

type State=ReturnType<typeof useAppStore.getState>;
const generationKeys=['params','charCaptions','batchCount','batchIntervalSeconds','i2iParams','inpaintModel','inpaintStrength','inpaintNoise','inpaintPositivePrompt','brushSize','brushOpacity','brushColor','brushShape','upscaleScale','directorTool','augmentOptions'] as const;
function generation(state:State):LastGenerationState {
  return {...Object.fromEntries(generationKeys.map(k=>[k,state[k]])),brushSizeUnit:'grid8'} as unknown as LastGenerationState;
}
export interface StudioAgentDependencies {
  getState:()=>State;
  setState:(patch:Partial<State>)=>void;
  api:Pick<Window['naiDesktop'],'getSettings'|'commitStudioSetting'|'getHistory'|'getHistoryGroups'|'listReferencePresets'|'getAgentWorkspace'>;
  uuid:()=>string;
  notifyReferenceChange?:()=>void;
}
export function createStudioAgentService(deps:StudioAgentDependencies) {
  let rendererCollections:ReturnType<typeof createRendererCollections>|undefined;
  const collections=()=>rendererCollections??=createRendererCollections({storage:localStorage,getTab:()=>deps.getState().activeTab,setTab:activeTab=>deps.setState({activeTab}),changed:group=>window.dispatchEvent(new CustomEvent('studio:collections-changed',{detail:group}))});
  let fingerprint='',sequence=0,taskFingerprint='',taskSequence=0;
  function tasks(){const s=deps.getState();const fp=JSON.stringify([s.isGenerating,s.isGenerateQueueRunning,s.queuePaused,s.generationQueue?.map(x=>x.id)]);if(fp!==taskFingerprint){taskFingerprint=fp;taskSequence++;}return {revision:`${instance}:tasks:${taskSequence}`,running:s.isGenerating,queueRunning:s.isGenerateQueueRunning,paused:s.queuePaused,progress:s.queueProgress,items:projectStudioData(s.generationQueue??[]),status:s.statusText,error:s.lastError,scope:'软件生成队列；暂停在当前图片结束后生效，取消不能撤销已完成的收费调用。'};}
  const instance=deps.uuid();
  async function current() {
    const settings=await deps.api.getSettings();
    const state=deps.getState();
    if(!state.bootDone || !state.settings)throw new Error('软件尚未初始化完成，请稍后重试。');
    // This is an opaque local revision, not a credential hash exposed to the model.
    const next=JSON.stringify([generation(state),settings]);
    if(next!==fingerprint){fingerprint=next;sequence++;}
    return {settings,state,revision:`${instance}:${sequence}`};
  }
  async function list(args:Record<string,unknown>) {
    const collection=String(args.collection??'styles');
    let rows:unknown[];
    const {settings}=await current();
    switch(collection) {
      case 'styles':rows=settings.stylePromptPresets;break;
      case 'positivePresets':rows=settings.positivePromptPresets;break;
      case 'characterPresets':rows=settings.characterPromptPresets??[];break;
      case 'promptChunks':rows=settings.promptChunks;break;
      case 'styleGroups':rows=settings.stylePromptPresetGroups;break;
      case 'history':rows=await deps.api.getHistory(typeof args.date==='string'?args.date:undefined,typeof args.groupId==='string'?args.groupId:undefined);break;
      case 'historyGroups':rows=await deps.api.getHistoryGroups();break;
      case 'references':rows=(await deps.api.listReferencePresets()).presets;break;
      case 'characters':case 'personas':case 'lorebooks':case 'samplerPresets':case 'memories':case 'conversations': {
        const workspace=await deps.api.getAgentWorkspace();rows=workspace[collection];break;
      }
      default:throw new Error('未知数据集合');
    }
    const offset=args.offset??0,limit=args.limit??20;
    if(typeof offset!=='number'||!Number.isSafeInteger(offset)||offset<0||typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error('offset 必须是非负整数，limit 为 1–50。');
    const query=typeof args.query==='string'?args.query.toLocaleLowerCase():'';
    const filtered=(rows??[]).filter(row=>!query||JSON.stringify(projectStudioData(row)).toLocaleLowerCase().includes(query));
    // Constrain by both item count and bytes. A single very large object is
    // explicitly truncated by the projection, never returned as a binary body.
    const items:unknown[]=[];let bytes=0;
    for(const row of filtered.slice(offset,offset+limit)) {
      const projected=projectStudioData(row);const size=JSON.stringify(projected).length;
      if(items.length && bytes+size>150000)break;
      items.push(projected);bytes+=size;
    }
    return {collection,total:filtered.length,offset,items,nextOffset:offset+items.length<filtered.length?offset+items.length:null};
  }
  async function handle(request:StudioAgentRequest):Promise<StudioAgentReply> {
    try {
      const args=request.args;
      if(request.action==='batch-project'){
        const action=String(args.action),project=createBatchProjectActions(getBatchProjectStore());
        if(action==='_batch.snapshot')return {ok:true,data:project.snapshot(args.expectedRevision)};
        if(action==='_batch.generation.preview')return {ok:true,data:await getBatchGenerationQueue().preview(args.tasks as import('./batch/generation-queue').BatchTask[],String(args.expectedRevision))};
        if(action==='_batch.generation.launch')return {ok:true,data:getBatchGenerationQueue().launch(args.tasks as import('./batch/generation-queue').BatchTask[],{runId:String(args.runId),expectedRevision:String(args.expectedRevision)})};
        if(action==='_batch.generation.wait')return {ok:true,data:await getBatchGenerationQueue().wait(String(args.runId))};
        if(action==='_batch.generation.status'||action==='_batch.generation.stop'){const queue=getBatchGenerationQueue();const stopped=action==='_batch.generation.stop'?await queue.stop(String(args.runId)):null;return {ok:true,data:{...queue.getSnapshot(),active:queue.active,...(stopped?{cancellationRequested:stopped.requested}:{})}};}
        return {ok:true,data:project.execute(args)};
      }
      if(request.action==='comic-project'){
        if(args.action==='_comic.generation.preview')return {ok:true,data:await getComicGenerationQueue().preview(args.tasks as import('./comic/generation-queue').ComicQueueTask[],String(args.expectedRevision))};
        if(args.action==='_comic.generation.launch')return {ok:true,data:getComicGenerationQueue().launch(args.tasks as import('./comic/generation-queue').ComicQueueTask[],{runId:String(args.runId),expectedRevision:String(args.expectedRevision),confirm:async()=>true})};
        if(args.action==='_comic.generation.wait')return {ok:true,data:await getComicGenerationQueue().wait(String(args.runId))};

        if(args.action==='_comic.generation.status'||args.action==='_comic.generation.stop'){
          const queue=getComicGenerationQueue();const stopped=args.action==='_comic.generation.stop'?await queue.stop(String(args.runId)):null;
          return {ok:true,data:{...queue.getSnapshot(),active:queue.active,...(stopped?{cancellationRequested:stopped.requested}:{}),scope:'漫画生成队列；保留已完成图片，不自动重试未核实请求'}};
        }
        const comic=createComicProjectActions(getComicProjectStore(),()=>deps.getState().params);return {ok:true,data:String(args.action).startsWith('_comic.')?comic.internal(args):comic.execute(args)};}
      if(request.action==='collections'){
        if(args.operation==='read')return {ok:true,data:collections().read(String(args.group))};
        if(args.operation==='apply'){const {operation:_,...input}=args;return {ok:true,data:collections().apply(input)};}
        throw Error('未知收藏或导航请求');
      }
      if(request.action==='tasks') {
        const input=validateTaskRequest(args),before=tasks(),s=deps.getState();
        if(input.action==='list')return {ok:true,data:before};
        if(input.action!=='cancel'&&input.expectedRevision!==before.revision)throw Error('任务队列已变化，请重新读取');
        if(['pause','resume'].includes(input.action)) {
          if(!s.isGenerating||!s.isGenerateQueueRunning)throw Error('当前没有可暂停或继续的生成队列');
          if(s.queuePaused!==(input.action==='pause'))s.togglePause();
        }else if(input.action==='cancel')await s.cancel();
        else if(input.action==='clear')s.clearQueue();
        else {if(!s.generationQueue.some(x=>x.id===input.id))throw Error('排队任务已开始或不存在，请重新读取');s.removeQueueJob(input.id!);}
        const after=tasks();
        if(input.action==='remove'&&deps.getState().generationQueue.some(x=>x.id===input.id))throw Error('任务未移除，请回读状态');
        if(input.action==='clear'&&deps.getState().generationQueue.length)throw Error('队列未清空，请回读状态');
        return {ok:true,data:{...after,action:input.action,executed:true,...(input.action==='cancel'?{cancellationRequested:true}:{})}};
      }
      if(request.action==='backup-capture') {
        const state=deps.getState();
        if(state.isGenerating||state.isGenerateQueueRunning||state.batchRunning||state.showSettings)throw Error('请先结束生成任务并保存设置，再执行备份恢复');
        await flushArtistFavoritePersistence();
        const fresh=await current();
        return {ok:true,data:{workspaceData:collectPortableWorkspaceData(),revision:fresh.revision}};
      }
      if(request.action==='backup-restore') {
        const merged=mergePortableWorkspaceData((args.workspaceData??{}) as Record<string,string>);
        await deps.getState().load();
        await hydrateArtistFavoriteLibrary();
        deps.notifyReferenceChange?.();
        globalThis.window?.dispatchEvent(new Event('langbai:workspace-imported'));
        return {ok:true,data:{refreshed:true,...merged}};
      }
      if(request.action==='read'&&args.refreshApi===true){const saved=await deps.api.getSettings(),state=deps.getState();const keys=['apiBaseUrl','imageBaseUrl','allowCustomEndpoint','allowCustomEndpointFallback','visionApiUrl','visionApiModel','visionApiKey','convertApiUrl','convertApiModel','convertApiKey','agentApiBaseUrl','agentApiModel','agentApiProtocol','agentProviderName','agentApiKey','tagServerUrl','tagServerType','tagServerTool','tagServerEnabled','tagServerApiKey','translateAiApiUrl','translateAiModel','translateAiApiKey'];deps.setState({settings:{...(state.settings??saved),...Object.fromEntries(keys.map(k=>[k,saved[k as SettingKey]]))}});return {ok:true,data:{refreshed:true}};}
      if(request.action==='read'&&args.refreshLibrary===true){const saved=await deps.api.getSettings(),state=deps.getState();deps.setState({settings:{...(state.settings??saved),stylePromptPresets:saved.stylePromptPresets,positivePromptPresets:saved.positivePromptPresets}});return {ok:true,data:{refreshed:true}};}
      if(request.action==='read'&&args.refreshCollections!==undefined) {
        const category=args.refreshCollections;
        if(!['history','references','text.convert','text.reverse'].includes(String(category)))throw Error('未知资料刷新类别');
        if(category==='history') {
          const groups=await deps.api.getHistoryGroups(),state=deps.getState();
          const exists=(id:string)=>!id||groups.some(group=>group.id===id);
          const selectedGroupId=exists(state.selectedGroupId)?state.selectedGroupId:'';
          const generationGroupId=exists(state.generationGroupId)?state.generationGroupId:'';
          deps.setState({historyGroups:groups,selectedGroupId,generationGroupId});
          await deps.getState().refreshHistory();
        } else if(category==='references')deps.notifyReferenceChange?.();
        else if(category==='text.convert')await deps.getState().loadConvertHistory();
        else await deps.getState().loadReverseHistory();
        return {ok:true,data:{refreshed:category}};
      }
      if(request.action==='list')return {ok:true,data:await list(args)};
      const {settings,state,revision}=await current();
      if(request.action==='read') {
        if(args.refreshTemplates===true){
          const keys=['agentPromptTemplateMode','convertPromptTemplates','convertPromptTemplatesV45','reversePromptTemplates','reversePromptTemplatesV45','convertPromptTemplateVersion','reversePromptTemplateVersion'] as const;
          deps.setState({settings:{...state.settings,...Object.fromEntries(keys.map(key=>[key,settings[key]]))} as AppSettings});
        }
        const libraryKeys=new Set(['stylePromptPresets','positivePromptPresets','characterPromptPresets','promptChunks','lastGenerationState']);
        const config=Object.fromEntries(Object.entries(settings).map(([k,v])=>[k,libraryKeys.has(k)?{source:k==='lastGenerationState'?'persisted; use generation for live values':'list_studio_data',count:Array.isArray(v)?v.length:undefined}:v]));
        const sections:Record<string,unknown>={
          generation:generation(state),settings:config,
          references:{vibeImages:state.vibeImages,preciseReferences:state.preciseReferences},
          runtime:{activeTab:state.activeTab,isGenerating:state.isGenerating,isGenerateQueueRunning:state.isGenerateQueueRunning,batchRunning:state.batchRunning,batchProgress:state.batchProgress,account:state.account,generationGroupId:state.generationGroupId,selectedGroupId:state.selectedGroupId,selectedDate:state.selectedDate,currentImage:state.currentImage,workbenchImage:state.workbenchImage,i2iOriginalImage:state.i2iOriginalImage,i2iSourceMode:state.i2iSourceMode,inpaintSourceMode:state.inpaintSourceMode,i2iSizeMode:state.i2iSizeMode,brushMode:state.brushMode,maskRevision:state.maskRevision,hasMask:!!state.inpaintMask},
          textTools:{reversePromptText:state.reversePromptText,reversePromptMode:state.reversePromptMode,reversePromptScope:state.reversePromptScope,reversePromptHint:state.reversePromptHint,convertInput:state.convertInput,convertResult:state.convertResult,convertMode:state.convertMode},
        };
        const section=String(args.section??'all');
        if(section!=='all'&&!Object.hasOwn(sections,section))throw new Error('未知 section');
        return {ok:true,data:{revision,capturedAt:new Date().toISOString(),source:'live renderer + freshly persisted settings; excludes unsaved settings-dialog drafts',...(section==='all'?projectStudioData(sections) as object:{[section]:projectStudioData(sections[section])}),writableSchema:STUDIO_WRITABLE,collections:['styles','styleGroups','positivePresets','characterPresets','promptChunks','references','history','historyGroups','characters','personas','lorebooks','samplerPresets','memories','conversations']}};
      }
      if(request.action!=='prepare'&&request.action!=='apply')throw new Error('未知操作');
      if(typeof args.expectedRevision!=='string'||args.expectedRevision!==revision)throw new Error('配置已变化。请重新读取软件状态，再提交修改。');
      if(state.showSettings)throw new Error('请先保存或关闭正在编辑的设置窗口，再修改配置。');
      let settingKey:SettingKey,settingValue:AppSettings[SettingKey],patch:Partial<State>={},detail:unknown;
      if(args.operation==='style') {
        const input=validateStyleInput(args);
        const old=input.id?settings.stylePromptPresets.find(p=>p.id===input.id):undefined;
        if(input.id&&!old)throw new Error('要编辑的风格不存在；省略 id 才会新建。');
        if(input.group!=='Default'&&!settings.stylePromptPresetGroups.includes(input.group)&&!settings.stylePromptPresets.some(p=>p.group===input.group))throw new Error('分类不存在，请选择已有分类（默认 Default）。');
        const preset:StylePromptPreset={...old,...input,id:old?.id??deps.uuid(),createdAt:old?.createdAt??new Date().toISOString()};
        settingKey='stylePromptPresets';
        settingValue=old?settings.stylePromptPresets.map(p=>p.id===old.id?preset:p):[...settings.stylePromptPresets,preset];
        detail={action:old?'更新风格':'新增风格',preset};
      } else {
        const {target,key,value}=validateStudioPatch(args);
        if(target==='settings') {
          if(key==='agentMaxOutputTokens'&&Number(value)>settings.agentContextWindow)throw new Error('输出 token 上限应小于或等于上下文窗口。');
          if(key==='agentContextWindow'&&Number(value)<settings.agentMaxOutputTokens)throw new Error('上下文窗口应大于或等于输出 token 上限。');
          settingKey=key as SettingKey;settingValue=value as AppSettings[SettingKey];
          detail={target,key,before:projectStudioData(settings[settingKey],key),after:projectStudioData(value,key)};
        } else {
          if(state.isGenerating||state.isGenerateQueueRunning||state.batchRunning)throw new Error('图片任务正在运行；请等待完成后修改生成参数。');
          if(target==='params') {
            const candidate={...state.params,[key]:value};
            if(key==='qualityToggle')candidate.qualityPreset=value?(state.params.qualityPreset==='none'?'standard':state.params.qualityPreset):'none';
            patch={params:normalizeGenerateParams(candidate)};
            if(patch.params![key as keyof typeof candidate]!==value)throw new Error('参数组合不兼容或尺寸超过限制，请调整后重试。');
          } else if(target==='workbench')patch={[key]:value};
          else if(target==='i2iParams')patch={i2iParams:{...state.i2iParams,[key]:value}};
          else patch={augmentOptions:{...state.augmentOptions,[key]:value}};
          settingKey='lastGenerationState';settingValue=generation({...state,...patch});
          detail={target,key,before:projectStudioData(generation(state)),after:projectStudioData(settingValue)};
        }
      }
      if(request.action==='prepare')return {ok:true,data:{revision,change:detail}};
      // Set the live value synchronously before IPC, so a later user edit queues
      // its own persistence *after* ours. Never reset the entire live state.
      const oldPatch=Object.fromEntries(Object.keys(patch).map(k=>[k,state[k as keyof State]]));
      deps.setState(patch);
      try {
        await deps.api.commitStudioSetting(request.id,settingKey,settings[settingKey],settingValue);
      } catch {
        const now=deps.getState();
        const restore=Object.fromEntries(Object.keys(patch).filter(k=>now[k as keyof State]===patch[k as keyof State]).map(k=>[k,oldPatch[k]]));
        deps.setState(restore);
        throw new Error('保存失败；未被后续编辑改变的界面字段已恢复。请重新读取状态。');
      }
      const saved=await deps.api.getSettings();
      deps.setState({settings:mergeFullSettings(deps.getState().settings,saved)});
      if(JSON.stringify(saved[settingKey])!==JSON.stringify(settingValue))throw new Error('保存后回读发生冲突，请重新读取状态；未宣称写入成功。');
      const live=deps.getState();
      if(Object.keys(patch).some(k=>JSON.stringify(live[k as keyof State])!==JSON.stringify(patch[k as keyof State])))throw new Error('写入期间用户修改了界面，已保留用户最新输入；请重新读取。');
      const fresh=await current();
      return {ok:true,data:{persisted:true,revision:fresh.revision,change:detail,readback:projectStudioData(args.operation==='style'?(settingValue as StylePromptPreset[]).find(p=>p.id===(detail as {preset:StylePromptPreset}).preset.id):saved[settingKey],settingKey)}};
    } catch(error) {return {ok:false,error:error instanceof Error?error.message:'读取/修改失败'};}
  }
  return {handle};
}

export function installStudioAgent() {
  if(!window.naiDesktop?.onStudioAgentRequest)return;
  const service=createStudioAgentService({getState:useAppStore.getState,setState:patch=>useAppStore.setState(patch),api:window.naiDesktop,uuid:()=>crypto.randomUUID(),notifyReferenceChange:()=>window.dispatchEvent(new Event('langbai:reference-presets-changed'))});
  return window.naiDesktop.onStudioAgentRequest(request=>{
    void service.handle(request).then(reply=>window.naiDesktop.replyStudioAgent(request.id,reply)).catch(()=>{/* Main may have timed out or closed; do not retry mutations. */});
  });
}
