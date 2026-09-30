import type {BatchRedrawProject,BatchRedrawRequest,GenerateResult,ComicImageService} from '../types';
import {buildBatchRedrawRequest,normalizeBatchRedrawCandidateCount,appendBatchRedrawCandidates,batchRedrawCandidates} from '../batch-redraw-queue';
import {parseBatchSizeImport} from './size-import';
import type {BatchProjectStore} from './project-store';
export type BatchTask={itemId:string;ordinal:number};
export const BATCH_RUN_KEY='langbai.novelai.batch-redraw-run.v1';
export function selectBatchTasks(project:BatchRedrawProject,mode:string,itemIds:string[]):BatchTask[]{
 if(!['all','pending','failed','additional'].includes(mode)||!Array.isArray(itemIds)||new Set(itemIds).size!==itemIds.length||itemIds.some(id=>!project.items.some(p=>p.id===id)))throw Error('批量重绘模式或图片选择无效');
 const selected=project.items.filter(item=>(!itemIds.length||itemIds.includes(item.id))&&(mode!=='pending'||item.status!=='done')&&(mode!=='failed'||item.status==='failed'));
 if(selected.some(item=>!item.prompt.trim()))throw Error('所选图片缺少提示词，请先补齐');
 return selected.flatMap(item=>Array.from({length:mode==='additional'?1:normalizeBatchRedrawCandidateCount(project.candidateCount)},(_,ordinal)=>({itemId:item.id,ordinal})));
}
export function prepareBatchTasks(input:BatchRedrawProject,tasks:BatchTask[]){
 const project=structuredClone(input);if(!project.groupName.trim()||!tasks.length)throw Error('请填写分组名称并选择需要重绘的图片');
 if(project.sizeMode==='perImage'){const sizes=parseBatchSizeImport(project.sizeBulk??'',project.items.length);project.items=project.items.map((item,i)=>({...item,outputWidth:sizes[i].width,outputHeight:sizes[i].height}));}
 const seen=new Set<string>();return tasks.map(task=>{const key=JSON.stringify([task.itemId,task.ordinal]);if(!Number.isSafeInteger(task.ordinal)||task.ordinal<0||task.ordinal>=8||seen.has(key))throw Error('批量任务重复或序号无效');seen.add(key);
  const item=project.items.find(p=>p.id===task.itemId);if(!item||!item.base64||!item.prompt.trim())throw Error('图片已移除或提示词为空');
  return {...task,request:structuredClone(buildBatchRedrawRequest(project,item,project.groupName))};
 });
}
export type BatchRunState={id:string|null;phase:'idle'|'preparing'|'running'|'stopping'|'completed'|'cancelled'|'failed'|'interrupted';total:number;done:number;images:number;inFlightItemId:string|null;error:string|null};
const active=(phase:BatchRunState['phase'])=>['preparing','running','stopping'].includes(phase);
export function createBatchGenerationQueue(deps:{store:BatchProjectStore;storage:Pick<Storage,'getItem'|'setItem'>;prepare:(requests:BatchRedrawRequest[])=>Promise<ComicImageService>;generate:(r:BatchRedrawRequest)=>Promise<GenerateResult>;cancel:(runId:string)=>Promise<unknown>;changed?:(s:BatchRunState)=>void;afterSaved?:()=>Promise<void>}){
 let state:BatchRunState={id:null,phase:'idle',total:0,done:0,images:0,inFlightItemId:null,error:null},work=Promise.resolve(),cancelled=false,inFlight=false,readError:string|null=null;
 let stopSignal=new AbortController();
 function publish(patch:Partial<BatchRunState>){const next={...state,...patch};deps.storage.setItem(BATCH_RUN_KEY,JSON.stringify(next));state=next;deps.changed?.(state);}
 function failure(e:unknown){const error=e instanceof Error?e.message:String(e);try{publish({phase:'failed',error,inFlightItemId:null});}catch{state={...state,phase:'failed',error,inFlightItemId:null};deps.changed?.(state);}}
 try{const raw=deps.storage.getItem(BATCH_RUN_KEY);if(raw){const s=JSON.parse(raw);if(!s||typeof s.id!=='string'||!['preparing','running','stopping','completed','cancelled','failed','interrupted'].includes(s.phase)||!Number.isSafeInteger(s.total)||s.total<1||!Number.isSafeInteger(s.done)||s.done<0||s.done>s.total||!Number.isSafeInteger(s.images)||s.images<0)throw Error('批量任务记录损坏，原记录已保留');state=s;if(active(state.phase))publish({phase:'interrupted',inFlightItemId:null,error:'上次批量重绘未核实完成；图片保留在历史中，未自动重试。'});}}
 catch(e){readError=String(e);state={...state,phase:'failed',error:readError};}
 function cancellable<T>(pending:Promise<T>):Promise<T>{const signal=stopSignal.signal;return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));if(signal.aborted)abort();});}
 async function execute(tasks:ReturnType<typeof prepareBatchTasks>,revision:string){
  try{
   const service=await cancellable(deps.prepare(tasks.map(t=>t.request)));if(cancelled)return;
   if(deps.store.read().revision!==revision)throw Error('准备期间批量工程已变化，请重新发起');
   publish({phase:'running'});
   for(const task of tasks){
    if(cancelled)break;
    const request={...task.request,runId:state.id!,imageServiceBinding:service.binding};
    deps.store.update(p=>{if(!p.items.some(x=>x.id===task.itemId))throw Error('重绘图片已移除，未继续提交');return {...p,items:p.items.map(x=>x.id===task.itemId?{...x,status:'generating',error:undefined}:x)};});
    publish({inFlightItemId:task.itemId});inFlight=true;let result:GenerateResult;
    try{result=await deps.generate(request);}catch(e){result={ok:false,items:[],message:e instanceof Error?e.message:String(e)};}finally{inFlight=false;}
    if(result.failureKind==='cancelled')cancelled=true;
    // Attach every durable output before interpreting cancellation or partial failure.
    deps.store.update(p=>{if(!p.items.some(x=>x.id===task.itemId))throw Error('工程已变化，图片仍保留在历史记录');return {...p,items:p.items.map(item=>{
     if(item.id!==task.itemId)return item;const next=appendBatchRedrawCandidates(item,result.items.map(out=>({id:out.id,historyItemId:out.id,resultUrl:out.fileUrl,resultPath:out.filePath,createdAt:out.createdAt,actualSeed:out.actualSeed})));
     const has=batchRedrawCandidates(next).length>0;return {...next,status:cancelled?(has?'done':'pending'):!result.ok||!result.items.length?'failed':'done',error:cancelled?undefined:!result.ok||!result.items.length?result.message||'没有返回图片':undefined};
    })};});
    publish({done:state.done+1,images:state.images+result.items.length,inFlightItemId:null});
    if(result.items.length)await deps.afterSaved?.();
    if(cancelled)break;
    if(!result.ok||!result.items.length)throw Error(result.message||'没有返回图片');
   }
  }catch(e){if(!cancelled)failure(e);}
  finally{inFlight=false;try{deps.store.update(p=>({...p,items:p.items.map(x=>x.status==='generating'?{...x,status:batchRedrawCandidates(x).length?'done':'pending',error:undefined}:x)}));if(state.phase!=='failed')publish({phase:cancelled?'cancelled':'completed',inFlightItemId:null});}catch(e){failure(e);}deps.store.setBusy(false);}
 }
 return {getSnapshot:()=>state,get active(){return active(state.phase);},
  async preview(tasks:BatchTask[],expectedRevision:string){const s=deps.store.read();if(s.busy||s.revision!==expectedRevision)throw Error('批量工程已变化或正在运行');const prepared=prepareBatchTasks(s.project,tasks),service=await deps.prepare(prepared.map(t=>t.request));if(deps.store.read().revision!==expectedRevision)throw Error('准备期间批量工程已变化');return {count:prepared.length,quote:null,imageProvider:service.provider,model:service.model};},
  launch(tasks:BatchTask[],options:{runId?:string;expectedRevision:string}){
   if(readError)throw Error(readError);const s=deps.store.read();if(s.busy||active(state.phase)||s.revision!==options.expectedRevision)throw Error('批量工程已变化或队列正忙，请重新读取');
   const prepared=prepareBatchTasks(s.project,tasks),id=options.runId??crypto.randomUUID();if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id)||id===state.id)throw Error('批量运行标识无效或已使用');
   publish({id,phase:'preparing',total:prepared.length,done:0,images:0,inFlightItemId:null,error:null});cancelled=false;stopSignal=new AbortController();deps.store.setBusy(true);work=execute(prepared,deps.store.read().revision);return {id,queued:true,total:prepared.length};
  },
  async wait(id:string){if(id!==state.id)throw Error('批量任务已变化');await work;if(id!==state.id)throw Error('批量任务已被下一轮替换');return state;},
  async stop(id?:string){if(id!==undefined&&id!==state.id)throw Error('批量任务已变化，请读取runId');if(!active(state.phase))return {requested:false,id:state.id};const first=!cancelled;cancelled=true;stopSignal.abort(Error('批量重绘已停止'));try{publish({phase:'stopping'});}catch(e){failure(e);}if(first&&inFlight)await deps.cancel(state.id!);return {requested:true,id:state.id};},
  settled:async()=>{await work;return state;},
 };
}
