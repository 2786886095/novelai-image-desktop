import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import type {HarnessSnapshot,HarnessUpdateProposal} from '../../src/harness-types';
import type {HarnessDownload} from './harness-update';

export const componentActionCatalog={
 'component.status':{title:'读取 Agent 组件和最近交接结果',effect:'read'},
 'component.check':{title:'查询可安装的兼容组件（仅元数据）',effect:'read'},
 'component.install':{title:'安装兼容组件并保留对话',effect:'confirm'},
 'component.update':{title:'更新兼容组件并保留对话',effect:'confirm'},
 'component.reinstall':{title:'重装兼容组件并保留对话',effect:'confirm'},
 'component.uninstall':{title:'仅卸载组件，保留对话与资料',effect:'confirm'},
} as const;
type Action=keyof typeof componentActionCatalog;
type Operation={id:string;action:Action;state:'queued'|'running'|'completed'|'failed'|'interrupted';version:string|null;createdAt:string;updatedAt:string;message:string};
export interface ComponentAdapter{
 snapshot():HarnessSnapshot;
 query(signal:AbortSignal):Promise<HarnessDownload|null>;
 stop():Promise<void>;
 prepare(asset:HarnessDownload,reinstall:boolean):Promise<HarnessUpdateProposal>;
 apply(token:string):Promise<void>;
 uninstall():Promise<void>;
 log(message:string):void;
}
/** Owned by Studio, not the disposable Agent child. Never replays a job at startup. */
export function createComponentActions(root:string,adapter:ComponentAdapter,approve:(r:AgentToolBridgeRequest)=>Promise<boolean>,handoffMs=30000){
 const file=path.join(root,'component-operation.json');
 let latest:Operation|null=null,initialized:Promise<void>|null=null,locked=false;
 let pending:{request:AgentToolBridgeRequest;operation:Operation;asset:HarnessDownload|null;controller:AbortController;timer?:ReturnType<typeof setTimeout>;work?:Promise<void>}|null=null;
 let approvalController:AbortController|null=null;
 let available:HarnessDownload|null=null,availableAt=0;
 const save=async(operation:Operation)=>{
  await fs.mkdir(root,{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';const fd=await fs.open(temp,'wx');
  try{await fd.writeFile(JSON.stringify(operation));await fd.sync();}finally{await fd.close();}
  await fs.rename(temp,file);latest=operation;
 };
 const init=()=>initialized??=(async()=>{
  try{
   const value=JSON.parse(await fs.readFile(file,'utf8')) as Operation;
   if(!value||typeof value.id!=='string'||!Object.hasOwn(componentActionCatalog,value.action)||!['queued','running','completed','failed','interrupted'].includes(value.state))throw Error('组件交接记录损坏，请检查本地日志；未自动重试');
   latest=value;
   if(['queued','running'].includes(value.state))await save({...value,state:'interrupted',updatedAt:new Date().toISOString(),message:'上次软件关闭时任务未完成，结果待核对；未自动重试或下载。'});
   adapter.log(`上次组件操作：${latest!.state} · ${latest!.message}`);
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 })();
 const revision=()=>createHash('sha256').update(JSON.stringify({version:adapter.snapshot().version,phase:adapter.snapshot().phase,asset:available,availableAt})).digest('hex');
 const data=()=>({component:{version:adapter.snapshot().version,phase:adapter.snapshot().phase},available:available?{version:available.version,bytes:available.bytes,sha256:available.asset.digest}:null,revision:revision(),operation:latest,busy:locked});
 const result=(title:string,value:Record<string,unknown>):AgentToolBridgeResponse=>({ok:true,title,data:value,output:JSON.stringify(value)});
 const finish=async(job:NonNullable<typeof pending>,state:Operation['state'],message:string)=>{
  try{await save({...job.operation,state,message,updatedAt:new Date().toISOString()});adapter.log(`组件操作 ${state}：${message}`);}
  finally{clearTimeout(job.timer);if(pending===job)pending=null;locked=false;}
 };
 const run=async(job:NonNullable<typeof pending>)=>{
  try{
   await save({...job.operation,state:'running',updatedAt:new Date().toISOString(),message:'软件已接管；正在关闭 Agent，随后执行已确认的组件操作。'});
   job.controller.signal.throwIfAborted();
   await adapter.stop();job.controller.signal.throwIfAborted();
   if(adapter.snapshot().phase!=='stopped')throw Error('Agent 尚未完全停止，未改动组件');
   if(job.operation.action==='component.uninstall'){
    await adapter.uninstall();job.controller.signal.throwIfAborted();
    if(adapter.snapshot().phase!=='stopped'||adapter.snapshot().version!==null)throw Error('卸载回读未通过，请核对组件状态，勿重复操作');
   }else{
    const proposal=await adapter.prepare(job.asset!,job.operation.action==='component.reinstall');
    job.controller.signal.throwIfAborted();
    if(proposal.status!=='ready'||!proposal.token)throw Error(proposal.message);
    if(proposal.version!==job.asset!.version)throw Error('候选组件与确认版本不一致，未安装');
    await adapter.apply(proposal.token);job.controller.signal.throwIfAborted();
    if(adapter.snapshot().phase!=='stopped'||adapter.snapshot().version!==job.asset!.version)throw Error('安装结果回读未通过，请核对日志，勿重复操作');
   }
   await finish(job,'completed',job.operation.action==='component.uninstall'?'组件已卸载，对话和资料保留。':'组件安装完成，对话和资料保留；可在软件中启动 Agent。');
  }catch(error){
   await finish(job,job.controller.signal.aborted?'interrupted':'failed',(error instanceof Error?error.message:String(error))+'；未自动重试，详情见软件日志。');
  }
 };
 return {
  catalog:componentActionCatalog,
  get busy(){return locked;},
  get operation(){return latest;},
  initialize:init,
  handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&Object.hasOwn(componentActionCatalog,String(r.args.action)),
  async execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
   let acquired=false;
   try{
    await init();request.signal?.throwIfAborted();
    const action=String(request.args.action) as Action;
    if(!Object.hasOwn(componentActionCatalog,action))throw Error('未知组件操作');
    for(const key of Object.keys(request.args))if(!['action','expectedRevision'].includes(key))throw Error('未知组件参数：'+key);
    if(action==='component.status')return result('组件状态',data());
    if(locked)throw Error('已有组件任务，请读取 component.status；不要重复提交');
    locked=true;acquired=true;
    if(action==='component.check'){
     const asset=await adapter.query(request.signal?AbortSignal.any([request.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000));
     available=asset;availableAt=Date.now();locked=false;acquired=false;
     return result('兼容组件元数据（尚未下载）',data());
    }
    if(request.args.expectedRevision!==revision())throw Error('组件状态已变化，请先读取 component.status/check 并传入 expectedRevision');
    if(!['running','stopped'].includes(adapter.snapshot().phase))throw Error('组件正在处理其他任务，请稍后读取状态');
    if(action!=='component.uninstall'&&(!available||Date.now()-availableAt>600000))throw Error('请先检查兼容组件，检查结果有效期为10分钟');
    if(action==='component.install'&&adapter.snapshot().version)throw Error('组件已安装；请选择更新或重装');
    if(action==='component.uninstall'&&!adapter.snapshot().version)throw Error('没有已安装组件');
    if(action==='component.update'&&adapter.snapshot().version===available!.version)return result('已经是此兼容版本',{...data(),current:true});
    const rev=revision(),asset=available,controller=new AbortController();approvalController=controller;
    const signal=request.signal?AbortSignal.any([controller.signal,request.signal]):controller.signal;
    const approved=await approve({...request,signal,args:{...request.args,title:componentActionCatalog[action].title,version:action==='component.uninstall'?adapter.snapshot().version:asset!.version,downloadBytes:action==='component.uninstall'?0:asset!.bytes,sha256:action==='component.uninstall'?undefined:asset!.asset.digest,keepConversations:true,notice:'确认后软件接管操作，当前 Agent 会断开；结果保留在软件组件日志，不重复确认，不自动重试。'}});
    approvalController=null;signal.throwIfAborted();
    if(!approved)throw Error('已取消，未停止 Agent 或修改组件');
    if(revision()!==rev)throw Error('确认期间组件状态变化，未执行');
    if(action!=='component.uninstall'&&Date.now()-availableAt>600000)throw Error('组件检查已过期，未下载');
    const now=new Date().toISOString();
    const operation:Operation={id:randomUUID(),action,state:'queued',createdAt:now,updatedAt:now,version:action==='component.uninstall'?adapter.snapshot().version:asset!.version,message:'已确认并排队；等待交接回执发送。排队不代表完成。'};
    await save(operation);
    const job:NonNullable<typeof pending>={request,operation,asset,controller};pending=job;acquired=false;
    job.timer=setTimeout(()=>{if(pending===job&&!job.work){job.work=finish(job,'interrupted','交接回执未完成，未停止 Agent、未下载或修改组件。');void job.work.catch(e=>adapter.log(String(e)));}},handoffMs);job.timer.unref?.();
    return result('软件已接收组件任务',{queued:true,operation,notice:operation.message});
   }catch(error){return {ok:false,title:'组件操作未执行',output:error instanceof Error?error.message:String(error)};}
   finally{if(acquired){approvalController=null;locked=false;}}
  },
  afterResponse(request:AgentToolBridgeRequest,response:AgentToolBridgeResponse,delivered:boolean){
   const job=pending;
   if(!job||job.work||!response.ok||request.sessionId!==job.request.sessionId||request.callId!==job.request.callId||request.tool!==job.request.tool)return;
   const operation=(response.data as {operation?:Operation}|undefined)?.operation;
   if(operation?.id!==job.operation.id)return;
   clearTimeout(job.timer);
   // run starts outside the bridge handler; the bridge receipt already exists.
   job.work=delivered?run(job):finish(job,'interrupted','交接回执连接已断开，未停止 Agent、未下载或修改组件。');
   void job.work.catch(e=>adapter.log('组件回执保存失败：'+String(e)));
  },
  async cancel(){
   approvalController?.abort();
   const job=pending;if(!job)return;
   job.controller.abort();clearTimeout(job.timer);
   if(job.work){await adapter.stop();await job.work;}
   else{job.work=finish(job,'interrupted','用户停止组件操作；尚未改动组件。');await job.work;}
  },
  async settled(){await pending?.work;},
 };
}
