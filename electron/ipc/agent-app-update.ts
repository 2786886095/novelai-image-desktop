import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';

export const appUpdateActionCatalog={
 'app.update.status':{title:'读取软件版本、自更新进度和最近安装交接结果',effect:'read'},
 'app.update.check':{title:'检查软件更新（仅元数据，不下载）',effect:'read'},
 'app.update.install':{title:'下载、验证并自动安装已确认的软件版本',effect:'confirm',help:'先 check，再传 expectedRevision；一次确认包括下载和重启。queued/installer_started 不代表安装完成，用重启后的 status 验证。'},
 'app.update.cancel':{title:'取消尚未启动安装程序的软件更新',effect:'write'},
} as const;
export interface AppUpdatePlan {version:string;bytes:number;sha512:string;sourceUrl:string}
export interface AppUpdateAdapter {
 currentVersion():string;supported():boolean;busy():boolean;
 plan(signal:AbortSignal):Promise<AppUpdatePlan|null>;
 reserve():void;release():void;
 download(plan:AppUpdatePlan,signal:AbortSignal,progress:(percent:number)=>void):Promise<void>;
 install(plan:AppUpdatePlan,signal:AbortSignal,onStarted:()=>Promise<void>):Promise<void>;
 log(message:string):void;
}
type State='queued'|'downloading'|'installing'|'installer_started'|'completed'|'failed'|'interrupted';
type Operation={id:string;version:string;state:State;message:string;updatedAt:string};
/** Host-owned job; transport replay never restarts it, and startup only reads back. */
export function createAppUpdateActions(root:string,adapter:AppUpdateAdapter,approve:(r:AgentToolBridgeRequest)=>Promise<boolean>,handoffMs=30000){
 const file=path.join(root,'app-update-operation.json');
 let operation:Operation|null=null,initializing:Promise<void>|null=null,plan:AppUpdatePlan|null=null,checkedAt=0;
 let busy=false,percent=0,approvalAbort:AbortController|null=null;
 let job:{request:AgentToolBridgeRequest;operation:Operation;plan:AppUpdatePlan;controller:AbortController;timer?:ReturnType<typeof setTimeout>;work?:Promise<void>}|null=null;
 let lastWork:Promise<void>|undefined;
 const save=async(value:Operation)=>{
  await fs.mkdir(root,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
  const fd=await fs.open(temp,'wx');try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}
  try{await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}operation=value;
 };
 const initialize=()=>initializing??=(async()=>{
  try{
   const value=JSON.parse(await fs.readFile(file,'utf8')) as Operation;
   if(!value||typeof value.id!=='string'||typeof value.version!=='string'||!['queued','downloading','installing','installer_started','completed','failed','interrupted'].includes(value.state))throw Error('软件更新交接记录损坏，未自动重试');
   operation=value;
   if(['queued','downloading','installing','installer_started'].includes(value.state)){
    const installed=['installing','installer_started'].includes(value.state)&&adapter.currentVersion()===value.version;
    await save({...value,state:installed?'completed':'interrupted',updatedAt:new Date().toISOString(),message:installed?'重启后版本回读一致，软件更新完成。':'上次软件更新未核实完成，未自动下载或重新安装。'});
   }
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 })();
 const revision=()=>createHash('sha256').update(JSON.stringify({current:adapter.currentVersion(),plan,checkedAt})).digest('hex');
 const data=()=>({currentVersion:adapter.currentVersion(),supported:adapter.supported(),available:plan,revision:revision(),operation,busy:busy||adapter.busy(),percent});
 const response=(value:Record<string,unknown>):AgentToolBridgeResponse=>({ok:true,title:'软件自更新',data:value,output:JSON.stringify(value)});
 const transition=async(state:State,message:string)=>{await save({...operation!,state,message,updatedAt:new Date().toISOString()});adapter.log(message);};
 const finish=async(state:State,message:string)=>{try{await transition(state,message);}finally{if(job)clearTimeout(job.timer);job=null;busy=false;adapter.release();}};
 const own=(work:Promise<void>)=>{lastWork=work.catch(error=>{adapter.log('软件更新回执保存失败：'+String(error));busy=false;adapter.release();job=null;});return lastWork;};
 const cancel=async()=>{
  approvalAbort?.abort(Error('用户已停止更新'));
  if(operation?.state==='installer_started')throw Error('安装程序已启动，请等待重启；未终止安装程序');
  if(!job)return;
  const current=job;current.controller.abort(Error('用户已停止更新'));clearTimeout(current.timer);
  if(current.work)await current.work;else{current.work=own(finish('interrupted','用户取消，尚未开始下载或安装。'));await current.work;}
 };
 const run=async(current:NonNullable<typeof job>)=>{
  const signal=current.controller.signal;
  try{
   signal.throwIfAborted();await transition('downloading','已交接，正在下载并校验已确认版本。');
   await adapter.download(current.plan,signal,value=>{percent=Math.max(0,Math.min(100,value));});signal.throwIfAborted();
   await transition('installing','安装包已验证，正在停止运行任务并启动安装程序。');
   await adapter.install(current.plan,signal,()=>transition('installer_started','安装程序已启动，等待软件重启后回读版本；尚不代表安装完成。'));
   if(operation?.state!=='installer_started')throw Error('安装程序未返回启动确认');
   busy=false;adapter.release();job=null;
  }catch(error){await finish(signal.aborted?'interrupted':'failed',(error instanceof Error?error.message:String(error))+'；未自动重试。');}
 };
 return {
  catalog:appUpdateActionCatalog,initialize,cancel,
  get busy(){return busy;},get operation(){return operation;},
  handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&Object.hasOwn(appUpdateActionCatalog,String(r.args.action)),
  async execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
   let acquired=false,reserved=false;
   try{
    await initialize();request.signal?.throwIfAborted();
    const action=String(request.args.action);
    if(!Object.hasOwn(appUpdateActionCatalog,action))throw Error('未知软件更新操作');
    for(const key of Object.keys(request.args))if(!['action','expectedRevision'].includes(key))throw Error('未知软件更新参数：'+key);
    if(action==='app.update.status')return response(data());
    if(action==='app.update.cancel'){await cancel();return response({...data(),cancelled:true});}
    if(!adapter.supported())throw Error('此平台暂未接通软件安装，请查看当前平台功能清单');
    if(busy||adapter.busy())throw Error('软件更新正在处理，请读取状态，勿重复提交');
    busy=true;acquired=true;
    if(action==='app.update.check'){
     plan=await adapter.plan(request.signal?AbortSignal.any([request.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000));checkedAt=Date.now();busy=false;return response(data());
    }
    if(request.args.expectedRevision!==revision())throw Error('软件版本或更新信息已变化，请先 check 并传入 expectedRevision');
    if(!plan||Date.now()-checkedAt>=600000)throw Error('请先检查可用更新，结果有效期10分钟');
    if(adapter.currentVersion()===plan.version)throw Error('当前已是目标版本，未重复安装');
    const before=revision(),chosen=plan,controller=new AbortController();approvalAbort=controller;
    const signal=request.signal?AbortSignal.any([request.signal,controller.signal]):controller.signal;
    const approved=await approve({...request,signal,args:{...request.args,title:'更新软件并自动重启',version:chosen.version,currentVersion:adapter.currentVersion(),downloadBytes:chosen.bytes,sha512:chosen.sha512,sourceUrl:chosen.sourceUrl,notice:'一次确认包括下载、校验、停止当前任务及重启安装；保留对话和图片。'}});
    approvalAbort=null;signal.throwIfAborted();if(!approved)throw Error('已取消，未下载或安装');
    if(before!==revision()||Date.now()-checkedAt>=600000)throw Error('确认期间版本发生变化或检查过期，未执行');
    adapter.reserve();reserved=true;percent=0;
    const value:Operation={id:randomUUID(),version:chosen.version,state:'queued',updatedAt:new Date().toISOString(),message:'已确认，等待回执发送；尚未下载或安装。'};
    await save(value);signal.throwIfAborted();
    const current:NonNullable<typeof job>={request,operation:value,plan:chosen,controller};job=current;acquired=false;reserved=false;
    current.timer=setTimeout(()=>{if(job===current&&!current.work)current.work=own(finish('interrupted','交接回执未完成，未下载或安装。'));},handoffMs);current.timer.unref?.();
    return response({queued:true,operation:value});
   }catch(error){return {ok:false,title:'软件更新未执行',output:error instanceof Error?error.message:String(error)};}
   finally{if(acquired){busy=false;approvalAbort=null;}if(reserved)adapter.release();}
  },
  afterResponse(request:AgentToolBridgeRequest,result:AgentToolBridgeResponse,delivered:boolean){
   const current=job;if(!current||current.work||!result.ok||request.sessionId!==current.request.sessionId||request.callId!==current.request.callId||request.tool!==current.request.tool||(result.data as {operation?:Operation}|undefined)?.operation?.id!==current.operation.id)return;
   clearTimeout(current.timer);current.work=own(delivered?run(current):finish('interrupted','回执连接断开，未下载或安装。'));
  },
  async settled(){await lastWork;},
 };
}
