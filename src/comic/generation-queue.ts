import type {ComicImageService,GenerateResult,TagComicGenerateRequest,TagComicProject} from '../types';
import {supportsNAIPreciseReference} from '../types';
import type {ComicProjectStore} from './project-store';
import {buildTagComicGenerateRequest} from './tag-comic';
import {commitComicCandidateResult} from './candidate-result';

export const COMIC_RUN_KEY='langbai.novelai.tag-comic-run.v1';
export type ComicQueueTask={panelId:string;ordinal:number};
export type PreparedComicTask=ComicQueueTask&{request:TagComicGenerateRequest};
export type ComicRunPhase='idle'|'preparing'|'confirming'|'running'|'stopping'|'completed'|'cancelled'|'failed'|'interrupted';
export type ComicRunState={id:string|null;projectId:string|null;phase:ComicRunPhase;total:number;done:number;inFlightPanelId:string|null;error:string|null;updatedAt:string};
const active=(phase:ComicRunPhase)=>['preparing','confirming','running','stopping'].includes(phase);
export function prepareComicTasks(project:TagComicProject,tasks:ComicQueueTask[]):PreparedComicTask[]{
 if(!tasks.length)throw Error('没有需要生成的分镜');
 const keys=new Set<string>();
 return tasks.map(task=>{
  if(!Number.isSafeInteger(task.ordinal)||task.ordinal<0)throw Error('漫画候选序号无效');
  const key=JSON.stringify([task.panelId,task.ordinal]);if(keys.has(key))throw Error('重复的漫画生成任务');keys.add(key);
  const panel=project.panels.find(p=>p.id===task.panelId);if(!panel)throw Error('漫画分镜已不存在，请重新读取');
  if(project.sizeMode==='perPanel'&&!panel.imageSize)throw Error('请先补全逐格尺寸');
  const request=buildTagComicGenerateRequest(project,panel);
  if(!request.panelPrompt.trim())throw Error(`第${panel.index}格提示词为空`);
  if(request.preciseReferences.length&&!supportsNAIPreciseReference(request.params.model))throw Error('当前分镜模型不支持精确参考图');
  return {...task,request:structuredClone(request)};
 });
}
export function selectComicTasks(project:TagComicProject,mode:string,panelIds:string[]):ComicQueueTask[]{
 if(!['initial','regenerate','additional'].includes(mode)||!Array.isArray(panelIds)||new Set(panelIds).size!==panelIds.length||panelIds.some(id=>!project.panels.some(p=>p.id===id)))throw Error('生成模式或分镜选择无效');
 const panels=[...project.panels].sort((a,b)=>a.index-b.index).filter(p=>!panelIds.length||panelIds.includes(p.id));
 return panels.flatMap(panel=>Array.from({length:mode==='additional'?1:mode==='initial'?Math.max(0,project.initialGenerationCount-panel.candidates.length):project.initialGenerationCount},(_,ordinal)=>({panelId:panel.id,ordinal})));
}
export type ComicQueueDependencies={
 store:ComicProjectStore;storage:Pick<Storage,'getItem'|'setItem'>;
 hasToken:()=>Promise<boolean>;
 prepareService?:(requests:TagComicGenerateRequest[])=>Promise<ComicImageService>;
 quote:(tasks:PreparedComicTask[],service?:ComicImageService)=>Promise<number|null>;
 generate:(request:TagComicGenerateRequest)=>Promise<GenerateResult>;
 cancel:(runId:string)=>Promise<unknown>;
 afterSaved?:(request:TagComicGenerateRequest,result:GenerateResult)=>Promise<void>;
};
/** One application-owned queue; subscribing/unsubscribing a page never starts/stops work. */
export function createComicGenerationQueue(deps:ComicQueueDependencies){
 const listeners=new Set<()=>void>();let work:Promise<void>=Promise.resolve(),cancelled=false,inFlight=false;let stopSignal=new AbortController();
 let state:ComicRunState={id:null,projectId:null,phase:'idle',total:0,done:0,inFlightPanelId:null,error:null,updatedAt:new Date().toISOString()};
 let readError:string|null=null;
 function emit(next:ComicRunState){state=next;for(const listener of listeners)listener();}
 function publish(patch:Partial<ComicRunState>){const next={...state,...patch,updatedAt:new Date().toISOString()};deps.storage.setItem(COMIC_RUN_KEY,JSON.stringify(next));emit(next);}
 try{
  const raw=deps.storage.getItem(COMIC_RUN_KEY);
  if(raw){const saved=JSON.parse(raw);if(!saved||typeof saved.id!=='string'||typeof saved.projectId!=='string'||!['preparing','confirming','running','stopping','completed','cancelled','failed','interrupted'].includes(saved.phase)||!Number.isSafeInteger(saved.total)||!Number.isSafeInteger(saved.done)||saved.total<1||saved.done<0||saved.done>saved.total)throw Error('漫画任务记录无效，原始记录保留');
   state={id:saved.id,projectId:saved.projectId,phase:saved.phase,total:saved.total,done:saved.done,inFlightPanelId:typeof saved.inFlightPanelId==='string'?saved.inFlightPanelId:null,error:typeof saved.error==='string'?saved.error:null,updatedAt:String(saved.updatedAt??'')};
   if(active(state.phase))publish({phase:'interrupted',inFlightPanelId:null,error:'上次漫画任务未核实完成；已保存图片保留，未自动重试。'});
  }
 }catch(e){readError=e instanceof Error?e.message:String(e);emit({...state,phase:'failed',error:readError});}
 function cancellable<T>(pending:Promise<T>):Promise<T>{
  const signal=stopSignal.signal;
  return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));if(signal.aborted)abort();});
 }
 async function execute(tasks:PreparedComicTask[],revision:string,confirm:(summary:{count:number;quote:number|null;signal:AbortSignal;imageProvider?:ComicImageService["provider"];model?:string;size?:string})=>Promise<boolean>){
  try{
   const service=deps.prepareService?await cancellable(deps.prepareService(tasks.map(t=>t.request))):undefined;
   if(!service&&!await cancellable(deps.hasToken()))throw Error('请先配置 NovelAI Token');if(cancelled)return;
   if(service)for(const task of tasks)task.request.imageServiceBinding=service.binding;
   const quote=await cancellable(deps.quote(tasks,service));if(cancelled)return;
   if(quote!==null&&(!Number.isFinite(quote)||quote<0))throw Error('漫画费用估算无效');
   publish({phase:'confirming'});const approved=await cancellable(confirm({count:tasks.length,quote,signal:stopSignal.signal,...(service?{imageProvider:service.provider,model:service.model,size:service.size}:{})}));if(!approved){cancelled=true;return;}if(cancelled)return;
   if(deps.store.read().revision!==revision)throw Error('确认期间漫画工程已变化，未开始生成；请重新发起');
   publish({phase:'running'});let historyGroupId=tasks[0].request.historyGroupId;
   for(const task of tasks){
    if(cancelled)break;
    const request={...task.request,historyGroupId,runId:state.id!};
    deps.store.update(p=>{if(p.id!==request.projectId||!p.panels.some(x=>x.id===request.panelId))throw Error('漫画工程或分镜已变化，后续任务未提交');return {...p,panels:p.panels.map(x=>x.id===request.panelId?{...x,status:'generating',error:undefined}:x)};});
    publish({inFlightPanelId:request.panelId});inFlight=true;
    let result:GenerateResult;
    try{result=await deps.generate(request);}
    catch(e){result={ok:false,items:[],message:e instanceof Error?e.message:String(e)};}
    finally{inFlight=false;}
    // Backend images are retained in native history even if project persistence fails.
    const group=commitComicCandidateResult(deps.store,request.projectId,request.panelId,result,cancelled);historyGroupId=group??historyGroupId;
    publish({done:state.done+1,inFlightPanelId:null});
    if(deps.afterSaved&&result.items.length){await deps.afterSaved(request,result);}
   }
  }catch(e){
   if(e!==stopSignal.signal.reason||!cancelled){
    const panelId=state.inFlightPanelId;
    if(panelId){try{commitComicCandidateResult(deps.store,state.projectId!,panelId,{ok:false,items:[],message:e instanceof Error?e.message:String(e)},cancelled);}catch{/* Original error remains; saved outputs still belong to native history. */}}
    publishFailure(e);
   }
   return;
  }
  finally{
   inFlight=false;
   try{if(state.phase!=='failed')publish({phase:cancelled?'cancelled':'completed',inFlightPanelId:null});}
   catch(e){publishFailure(e);}
   deps.store.setBusy(false);
  }
 }
 function publishFailure(e:unknown){const error=e instanceof Error?e.message:String(e);try{publish({phase:'failed',inFlightPanelId:null,error});}catch{emit({...state,phase:'failed',inFlightPanelId:null,error});}}
 return {
  getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  get active(){return active(state.phase);},
  async preview(tasks:ComicQueueTask[],expectedRevision:string){
   const before=deps.store.read();if(before.busy||active(state.phase)||before.revision!==expectedRevision)throw Error('漫画工程已变化或队列正忙，请重新读取');
   const prepared=prepareComicTasks(before.project,tasks);
   const service=deps.prepareService?await deps.prepareService(prepared.map(t=>t.request)):undefined;
   if(!service&&!await deps.hasToken())throw Error('请先配置 NovelAI Token');
   const quote=await deps.quote(prepared,service);if(deps.store.read().revision!==expectedRevision)throw Error('估算期间漫画工程已变化');
   if(quote!==null&&(!Number.isFinite(quote)||quote<0))throw Error('漫画费用估算无效');
   return {count:prepared.length,quote,...(service?{imageProvider:service.provider,model:service.model,size:service.size}:{})};
  },
  async wait(runId:string){if(runId!==state.id)throw Error('漫画任务已变化，请重新读取');const current=work;await current;if(runId!==state.id)throw Error('漫画任务已被下一轮替换，请检查历史');return state;},
  launch(tasks:ComicQueueTask[],options:{runId?:string;expectedRevision:string;confirm:(summary:{count:number;quote:number|null;signal:AbortSignal;imageProvider?:ComicImageService["provider"];model?:string;size?:string})=>Promise<boolean>}){
   if(readError)throw Error(readError);
   const before=deps.store.read();if(active(state.phase)||before.busy)throw Error('漫画队列正在运行，请先停止并等待读回');
   if(before.revision!==options.expectedRevision)throw Error('漫画工程已变化，请重新读取');
   const prepared=prepareComicTasks(before.project,tasks),id=options.runId??crypto.randomUUID();
   if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id)||id===state.id)throw Error('漫画任务标识无效或已经使用');
   publish({id,projectId:before.project.id,phase:'preparing',total:prepared.length,done:0,error:null,inFlightPanelId:null});
   cancelled=false;stopSignal=new AbortController();deps.store.setBusy(true);const revision=deps.store.read().revision;
   work=execute(prepared,revision,options.confirm);return {id,queued:true,total:prepared.length};
  },
  async stop(runId?:string){
   if(runId!==undefined&&runId!==state.id)throw Error('漫画任务已变化，请读取当前 runId');
   if(!active(state.phase))return {requested:false,id:state.id};
   const first=!cancelled;cancelled=true;stopSignal.abort(Error('漫画任务已停止'));
   try{publish({phase:'stopping'});}catch(e){publishFailure(e);}
   // Do not cancel an unrelated request while this queue is only quoting/confirming.
   if(first&&inFlight)await deps.cancel(state.id!);
   return {requested:true,id:state.id};
  },
  async settled(){await work;return state;},
 };
}
export type ComicGenerationQueue=ReturnType<typeof createComicGenerationQueue>;
