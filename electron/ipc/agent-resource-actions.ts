import {createHash} from 'node:crypto';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
import type {ResourceDatabaseOverview,ResourceDatabaseId,ResourceDatabaseDownloadResult} from '../../src/types';
import * as db from './resource-databases';

export const resourceActionCatalog={
 'resources.list':{title:'读取资源数据库、来源、下载大小和任务状态',effect:'read'},
 'resources.download':{title:'下载并安装资源数据库（旧库保留）',effect:'confirm',fields:['id'],help:'id: tagCatalog|cooccurrence；返回 started 仅代表开始，用 resources.list 核对任务和实际数据库。'},
 'resources.pause':{title:'暂停资源下载（保留断点）',effect:'write',fields:['id']},
 'resources.restore':{title:'恢复上一版资源数据库',effect:'confirm',fields:['id']},
 'resources.clearCache':{title:'清理资源查询内存缓存（不删除数据库）',effect:'write'},
 'resources.openDirectory':{title:'打开资源数据库目录',effect:'write'},
} as const;
export interface ResourceActionAdapter {
 overview():Promise<ResourceDatabaseOverview>;
 download(id:ResourceDatabaseId):Promise<ResourceDatabaseDownloadResult>;
 pause(id:ResourceDatabaseId):{ok:boolean;message?:string};
 restore(id:ResourceDatabaseId):Promise<ResourceDatabaseDownloadResult>;
 clearCache():{ok:boolean};
 openDirectory():Promise<{ok:boolean;message?:string}>;
}
type Job={id:ResourceDatabaseId;state:'running'|'pausing'|'complete'|'paused'|'error';message?:string};
export function createResourceActions(adapter:ResourceActionAdapter,approve:(request:AgentToolBridgeRequest)=>Promise<boolean>){
 const jobs=new Map<ResourceDatabaseId,Job>(),busy=new Set<ResourceDatabaseId>();
 const revision=(state:ResourceDatabaseOverview)=>createHash('sha256').update(JSON.stringify(state.resources.map(r=>({id:r.id,installed:r.installed,valid:r.valid,version:r.version,hasPrevious:r.hasPrevious})))).digest('hex');
 const snapshot=async()=>{const state=await adapter.overview();return {...state,revision:revision(state),jobs:[...jobs.values()]};};
 const validId=(value:unknown):ResourceDatabaseId=>{if(value!=='tagCatalog'&&value!=='cooccurrence')throw Error('资源 ID 必须来自 resources.list');return value;};
 return {catalog:resourceActionCatalog,handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&Object.hasOwn(resourceActionCatalog,String(r.args.action)),
 async execute(request:AgentToolBridgeRequest){
  const args=request.args,action=String(args.action),spec=resourceActionCatalog[action as keyof typeof resourceActionCatalog];
  try{
   if(!spec)throw Error('未知资源操作');
   for(const key of Object.keys(args))if(!['action','expectedRevision',...('fields' in spec?spec.fields:[])].includes(key))throw Error('未知资源参数：'+key);
   request.signal?.throwIfAborted();const before=await snapshot();
   if(spec.effect==='read')return {ok:true,title:spec.title,output:JSON.stringify(before),data:before};
   if(args.expectedRevision!==before.revision)throw Error('资源数据库已变化，请重新读取');
   const id='fields' in spec?validId(args.id):undefined;
   if(id&&action!=='resources.pause'&&(busy.has(id)||before.resources.find(x=>x.id===id)?.downloading))throw Error('该资源正在处理，请先暂停或等待完成');
   if(spec.effect==='confirm'){
    if(!await approve({...request,args:{...args,title:spec.title,resource:before.resources.find(x=>x.id===id)}}))throw Error('Agent 内已取消，数据库未修改');
    request.signal?.throwIfAborted();const fresh=await snapshot();
    if(fresh.revision!==before.revision)throw Error('确认期间资源数据库已变化，请重新读取');
    if(id&&(busy.has(id)||fresh.resources.find(x=>x.id===id)?.downloading))throw Error('该资源已开始其他操作');
   }
   request.signal?.throwIfAborted();let result:Record<string,unknown>;
   if(action==='resources.download'){
    busy.add(id!);jobs.set(id!,{id:id!,state:'running'});
    void (async()=>{try{const reply=await adapter.download(id!);const after=await adapter.overview();const installed=after.resources.find(x=>x.id===id);
     const complete=reply.ok&&installed?.installed&&installed.valid;
     jobs.set(id!,{id:id!,state:complete?'complete':reply.paused?'paused':'error',message:complete?reply.message:reply.message||'安装回读未通过'});
    }catch(e){jobs.set(id!,{id:id!,state:'error',message:String(e)});}finally{busy.delete(id!);}})();
    result={started:true,id,notice:'下载任务已启动，尚未确认安装完成；请读取 resources.list。'};
   }else if(action==='resources.pause'){
    const reply=adapter.pause(id!);if(!reply.ok)throw Error(reply.message??'当前没有可暂停的下载');
    if(jobs.get(id!)?.state==='running')jobs.set(id!,{id:id!,state:'pausing'});result={pauseRequested:true,id};
   }else if(action==='resources.restore'){
    busy.add(id!);try{const reply=await adapter.restore(id!);if(!reply.ok)throw Error(reply.message);const row=(await adapter.overview()).resources.find(x=>x.id===id);if(!row?.installed||!row.valid)throw Error('恢复后的数据库回读未通过');result={restored:true,id,version:row.version};}finally{busy.delete(id!);}
   }else if(action==='resources.clearCache'){
    if(!adapter.clearCache().ok||(await adapter.overview()).cache.memoryEntries!==0)throw Error('缓存清理回读未通过');result={cleared:true};
   }else {const reply=await adapter.openDirectory();if(!reply.ok)throw Error(reply.message??'目录未打开');result={opened:true};}
   const data={...await snapshot(),result};return {ok:true,title:spec.title,output:JSON.stringify(data),data};
  }catch(e){return {ok:false,title:'资源操作未完成',output:e instanceof Error?e.message:String(e)};}
 }};
}
export function desktopResourceAdapter():ResourceActionAdapter{
 return {overview:db.getResourceDatabaseOverview,download:id=>db.downloadResourceDatabase(id,true),pause:db.pauseResourceDatabaseDownload,restore:id=>db.restorePreviousResourceDatabase(id,true),clearCache:db.clearResourceQueryCache,openDirectory:db.openResourceDatabaseDirectory};
}
