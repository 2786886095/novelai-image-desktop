import fs from 'node:fs/promises';
import path from 'node:path';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import type {TagComicGenerateRequest,TagComicProject} from '../../src/types';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import {validateComicAction} from '../../src/agent/comic-project-contract';
import {prepareComicTasks,selectComicTasks} from '../../src/comic/generation-queue';
import type {createSessionControls} from './harness-session-controls';
import {bindAgentImageProvider} from './agent-image-provider';
import {imageGenerationEndpoint,buildCompatibleImageRequest} from '../../src/image-provider-contract';
import {registerAgentComicRun} from './comic-run-authorization';

type Sessions=Pick<ReturnType<typeof createSessionControls>,'begin'|'end'|'read'|'authorize'>;
export interface ComicRunHostAdapter{
 ask:(args:Record<string,unknown>)=>Promise<Record<string,unknown>>;
 wait:(runId:string)=>Promise<Record<string,unknown>>;
 source:()=>string; // Host-only credential/configuration binding, never returned to the model.
 cancelNative:(runId:string)=>void|Promise<unknown>;
 waitNative?:(runId:string)=>Promise<void>;
}
type Operation={id:string;sessionId:string;phase:string;total:number;submitted:number;done:number;error:string|null;updatedAt:string};
function readOperation(raw:string):Operation{
 const value=JSON.parse(raw);
 if(!value||typeof value.id!=='string'||!/^agent-comic-[a-zA-Z0-9_-]+$/.test(value.id)||typeof value.sessionId!=='string'||!value.sessionId||!['preparing','queued','starting','running','stopping','completed','cancelled','failed','interrupted'].includes(value.phase)||!['total','submitted','done'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)||value.submitted>value.total||value.done>value.total||typeof value.updatedAt!=='string'||!(value.error===null||typeof value.error==='string'))throw Error('漫画运行回执损坏，原始记录已保留，请先检查历史');
 return value;
}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value);}
const requestCore=(request:TagComicGenerateRequest)=>{const {runId:_,historyGroupId:__,imageServiceBinding:___,...core}=request;return stable(core);};
export function createAgentComicRun(root:string,adapter:ComicRunHostAdapter,sessions:Sessions,approve:(request:AgentToolBridgeRequest)=>Promise<boolean>,handoffMs=30000){
 const file=path.join(root,'comic-run.json');let operation:Operation|null=null,writes=Promise.resolve();
 type Job={id:string;request:AgentToolBridgeRequest;sessionSignal:AbortSignal;abort:AbortController;signal:AbortSignal;source:string;tasks:ReturnType<typeof selectComicTasks>;prepared:ReturnType<typeof prepareComicTasks>;automatic:boolean;started:boolean;dispose?:()=>void;timer?:ReturnType<typeof setTimeout>;done:Promise<void>;resolve:()=>void;finishing?:Promise<void>};
 let job:Job|null=null;
 async function save(patch:Partial<Operation>){
  operation={...operation!,...patch,updatedAt:new Date().toISOString()};const body=JSON.stringify(operation),temp=file+'.'+randomUUID()+'.tmp';
  const task=writes.catch(()=>{}).then(async()=>{await fs.mkdir(root,{recursive:true});const handle=await fs.open(temp,'wx');try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}try{await fs.rename(temp,file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}});writes=task;await task;
 }
 const initialize=(async()=>{try{operation=readOperation(await fs.readFile(file,'utf8'));if(operation&&['preparing','queued','starting','running','stopping'].includes(operation.phase))await save({phase:'interrupted',error:'上次漫画交接未核实完成；未自动重试，请先检查漫画工程和历史。'});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}})();
 const response=(data:Record<string,unknown>):AgentToolBridgeResponse=>({ok:true,title:'漫画生成队列',data,output:JSON.stringify(data)});
 async function stopOwned(current:Job){
  current.abort.abort(Error('漫画任务已停止'));await adapter.cancelNative(current.id);
  if(current.started)await adapter.ask({action:'_comic.generation.stop',runId:current.id}).catch(()=>{});
 }
 function finish(current:Job,phase:string,error:string|null=null,done=operation?.done??0):Promise<void>{
  if(current.finishing)return current.finishing;
  current.finishing=(async()=>{try{if(job===current)await save({phase,error,done});}catch(e){if(operation?.id===current.id)operation={...operation,phase:'failed',error:'运行回执保存失败：'+String(e)};}finally{clearTimeout(current.timer);current.dispose?.();sessions.end(current.request.sessionId!,current.sessionSignal);if(job===current)job=null;current.resolve();}})();return current.finishing;
 }
 async function launch(current:Job){
  try{
   current.signal.throwIfAborted();if(adapter.source()!==current.source)throw Error('漫画图片服务配置已变化，未开始生成');
   await save({phase:'starting'});current.signal.throwIfAborted();
   const receipt=await adapter.ask({action:'_comic.generation.launch',tasks:current.tasks,expectedRevision:current.request.args.expectedRevision,runId:current.id});
   if(receipt.id!==current.id||receipt.queued!==true)throw Error('漫画队列交接回执不匹配，请检查当前状态');
   await save({phase:'running'});
   const result=await adapter.wait(current.id);await adapter.waitNative?.(current.id);
   if(result.id!==current.id||result.total!==current.tasks.length||!Number.isSafeInteger(result.done)||Number(result.done)<0||Number(result.done)>current.tasks.length)throw Error('漫画终态回执与本次任务不匹配');
   const phase=String(result.phase);if(!['completed','cancelled','failed','interrupted'].includes(phase))throw Error('漫画队列未返回终态');
   if(phase==='completed'&&(operation?.submitted!==current.prepared.length||result.done!==current.prepared.length))throw Error('漫画完成回执与实际提交数量不符');
   await finish(current,phase,typeof result.error==='string'?result.error:null,Number(result.done??0));
  }catch(e){const cancelled=current.signal.aborted;await stopOwned(current).catch(()=>{});await adapter.waitNative?.(current.id).catch(()=>{});await finish(current,cancelled?'cancelled':'failed',e instanceof Error?e.message:String(e));}
 }
 async function execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
  let acquired:Job|undefined;
  try{
   await initialize;validateComicAction(request.args);request.signal?.throwIfAborted();
   if(request.args.action==='comic.generation.status')return response({...await adapter.ask({action:'_comic.generation.status'}),operation,handoffPending:Boolean(job&&!job.started)});
   if(request.args.action==='comic.generation.stop'){
    if(job&&job.id===request.args.runId){if(job.request.sessionId!==request.sessionId)throw Error('该漫画运行属于其他会话；请在原会话或软件页面停止');const current=job;await stopOwned(current);if(!current.started)await finish(current,'cancelled','已停止，未开始图片生成');return response({id:current.id,cancellationRequested:true,operation});}
    const live=await adapter.ask({action:'_comic.generation.status'});
    if(operation&&operation.id===request.args.runId&&operation.sessionId!==request.sessionId)throw Error('该漫画运行属于其他会话');
    if(live.id!==request.args.runId)throw Error('漫画任务已变化，请读取当前 runId');
    return response(await adapter.ask({action:'_comic.generation.stop',runId:request.args.runId}));
   }
   if(request.args.action!=='comic.generation.start')throw Error('未知漫画生成动作');
   if(job)throw Error('漫画启动或生成正在进行，请读取状态');
   if(!request.callId)throw Error('启动漫画须使用带 callId 的持久化请求');
   const id='agent-comic-'+randomUUID(),abort=new AbortController();let current!:Job;
   const sessionSignal=sessions.begin(request.sessionId??'',()=>stopOwned(current));
   let resolve!:()=>void;const done=new Promise<void>(r=>resolve=r);
   current={id,request,abort,sessionSignal,signal:AbortSignal.any([sessionSignal,abort.signal]),source:'',tasks:[],prepared:[],automatic:false,started:false,done,resolve};job=current;acquired=current;
   operation={id,sessionId:request.sessionId!,phase:'preparing',total:0,submitted:0,done:0,error:null,updatedAt:new Date().toISOString()};await save({});current.signal.throwIfAborted();
   current.source=adapter.source();
   const snapshot=await adapter.ask({action:'_comic.snapshot',expectedRevision:request.args.expectedRevision});current.signal.throwIfAborted();
   current.tasks=selectComicTasks(snapshot.project as TagComicProject,String(request.args.mode),request.args.panelIds as string[]);current.prepared=prepareComicTasks(snapshot.project as TagComicProject,current.tasks);await save({total:current.tasks.length});
   const preview=await adapter.ask({action:'_comic.generation.preview',tasks:current.tasks,expectedRevision:request.args.expectedRevision});
   current.signal.throwIfAborted();if(preview.count!==current.tasks.length)throw Error('漫画预估数量不一致');
   const policy=await sessions.read(request.sessionId!);current.automatic=policy.mode==='auto';
   if(current.automatic&&policy.limit!==0&&policy.remaining<current.tasks.length)throw Error('本次自动生成额度不足，请调整会话上限或改为确认生成');
   if(!current.automatic){const signal=request.signal?AbortSignal.any([current.signal,request.signal]):current.signal;const approved=await approve({...request,signal,args:{...request.args,title:'生成漫画队列',plannedImages:current.tasks.length,estimatedAnlas:preview.quote,imageProvider:preview.imageProvider,model:preview.model,size:preview.size,projectTitle:(snapshot.project as TagComicProject).title,notice:'本次确认覆盖所列整批；不再弹软件确认。停止保留已生成图片。'}});if(!approved)throw Error('已取消漫画生成');}
   current.signal.throwIfAborted();request.signal?.throwIfAborted();if(adapter.source()!==current.source)throw Error('确认期间漫画图片服务配置已变化');
   await adapter.ask({action:'_comic.snapshot',expectedRevision:request.args.expectedRevision});current.signal.throwIfAborted();
   current.dispose=registerAgentComicRun(id,async submitted=>{
    current.signal.throwIfAborted();if(job!==current||!current.started||current.finishing)throw Error('漫画运行授权已结束');
    if(adapter.source()!==current.source)throw Error('图片服务配置已变化，后续漫画图片未提交');
    const index=operation!.submitted,expected=current.prepared[index];if(!expected||requestCore(submitted)!==requestCore(expected.request))throw Error('漫画请求与已授权任务不一致，未提交');
    if(current.automatic&&!await sessions.authorize({tool:'langbai_generate_image',sessionId:request.sessionId,args:{count:1}}))throw Error('自动授权已撤回，后续图片未提交');
    current.signal.throwIfAborted();await save({submitted:index+1});current.signal.throwIfAborted();
    return()=>{current.signal.throwIfAborted();if(job!==current||current.finishing||adapter.source()!==current.source)throw Error('漫画图片服务或运行授权已变化，未提交请求');};
   });
   await save({phase:'queued',total:current.tasks.length});current.signal.throwIfAborted();
   current.timer=setTimeout(()=>{void stopOwned(current).finally(()=>finish(current,'interrupted','交接回执未完成，未开始图片生成')).catch(()=>{});},handoffMs);current.timer.unref?.();acquired=undefined;
   return response({id,queued:true,total:current.tasks.length,operation});
  }catch(e){if(acquired)await finish(acquired,acquired.signal.aborted?'cancelled':'failed',e instanceof Error?e.message:String(e));return {ok:false,title:'漫画生成未启动',output:e instanceof Error?e.message:String(e)};}
 }
 return {initialize,get busy(){return Boolean(job);},handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&['comic.generation.start','comic.generation.status','comic.generation.stop'].includes(String(r.args.action)),execute,
  afterResponse(request:AgentToolBridgeRequest,result:AgentToolBridgeResponse,delivered:boolean){const current=job;if(!current||current.started||current.finishing||!result.ok||request.tool!==current.request.tool||request.callId!==current.request.callId||request.sessionId!==current.request.sessionId||(result.data as {id?:string}|undefined)?.id!==current.id)return;clearTimeout(current.timer);current.started=true;if(delivered)void launch(current);else void stopOwned(current).finally(()=>finish(current,'interrupted','回执连接断开，未开始生成')).catch(()=>{});},
  async settled(){await job?.done;await writes.catch(()=>{});},
  async close(){const current=job;if(!current)return;await stopOwned(current).catch(()=>{});if(!current.started)await finish(current,'cancelled','Agent 已关闭，未启动生成');await current.done;},
 };
}
const sourceKey=randomBytes(32);
export function desktopComicRunAdapter(ask:ComicRunHostAdapter['ask'],wait:ComicRunHostAdapter['wait']):ComicRunHostAdapter{
 return {ask,wait,source:()=>{throw Error('Use configured source binding');},cancelNative:async id=>(await import('./nai.js')).cancelTagComicGeneration(id),waitNative:async id=>(await import('./nai.js')).waitTagComicGeneration(id)};
}
export function comicSourceBinding(settings:import('../../src/types').AppSettings,token:string){
 if(settings.imageProvider==='openai-images'){
  const config=settings.compatibleImage;
  if(!config||!settings.imageApiKey?.trim()||/[\r\n]/.test(settings.imageApiKey))throw Error('请先保存兼容图片服务配置与独立 API Key；未自动切换服务');
  imageGenerationEndpoint(config.baseUrl);
  buildCompatibleImageRequest(config,{prompt:'configuration validation',size:config.size,n:1,extensions:config.extensions});
  return bindAgentImageProvider(settings).revision;
 }
 if(!token)throw Error('请先配置 NovelAI Token');
 return createHmac('sha256',sourceKey).update(JSON.stringify([token,settings.imageProvider,settings.apiBaseUrl,settings.imageBaseUrl,settings.allowCustomEndpoint,settings.outputDir,settings.proxyMode,settings.proxyUrl,settings.proxyForAi])).digest('hex');
}
