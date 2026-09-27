import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import type {DataBackupCategory,DataBackupInspectResult,DataBackupImportResult,DataBackupOperationResult} from '../../src/types';
import {validateBackupRequest,BACKUP_CATEGORIES} from '../../src/agent/backup-contract';

export interface BackupAdapter {
 directory():Promise<string>;
 capture():Promise<{workspaceData:Record<string,string>;revision:string}>;
 inspect(file:string):Promise<DataBackupInspectResult>;
 create(categories:DataBackupCategory[],workspace:Record<string,string>):Promise<DataBackupOperationResult>;
 restore(file:string,categories:DataBackupCategory[],workspace:Record<string,string>):Promise<DataBackupImportResult>;
 refresh(workspace:Record<string,string>):Promise<unknown>;
}
async function digest(file:string) {
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
export function createBackupTools(adapter:BackupAdapter,approve:(request:AgentToolBridgeRequest)=>Promise<boolean>) {
 const inspected=new Map<string,{file:string;backupId:string;digest:string;revision:string;categories:DataBackupCategory[];expires:number;session:string}>();
 const catalog=new Map<string,string>();let tail:Promise<unknown>=Promise.resolve();
 const fingerprint=(capture:{workspaceData:Record<string,string>;revision:string})=>createHash('sha256').update(JSON.stringify(capture)).digest('hex');
 async function resolve(id:string) {
  const file=catalog.get(id);if(!file)throw Error('备份编号已过期，请先列出本机备份');
  const root=await fs.realpath(await adapter.directory()),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||path.dirname(await fs.realpath(file))!==root)throw Error('备份位置已改变，请重新列出备份');
  return file;
 }
 async function execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse> {
  try {
   const args=validateBackupRequest(request.args),session=request.sessionId??'';
   let data:Record<string,unknown>;
   if(args.action==='list') {
    const directory=await adapter.directory();await fs.mkdir(directory,{recursive:true});
    const entries=await fs.readdir(directory,{withFileTypes:true});const items=[];
    for(const entry of entries){
     if(!entry.isFile()||!entry.name.endsWith('.naisbackup'))continue;
     const file=path.join(directory,entry.name),stat=await fs.stat(file),id=createHash('sha256').update(file).digest('hex');catalog.set(id,file);
     items.push({id,name:entry.name,bytes:stat.size,modifiedAt:stat.mtime.toISOString()});
    }
    items.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));
    const offset=args.offset??0,limit=args.limit??20;
    data={directory,items:items.slice(offset,offset+limit),total:items.length,nextOffset:offset+limit<items.length?offset+limit:null,categories:BACKUP_CATEGORIES,restoreInstructions:'选择备份编号检查内容，再确认恢复；原资料会先备份，重名资料保留或重命名，配置仅在选中后覆盖。'};
   } else if(args.action==='create') {
    const categories=args.categories??BACKUP_CATEGORIES.filter(x=>x!=='apiCredentials');
    if(categories.includes('apiCredentials')&&!await approve({...request,args:{action:'create',categories,说明:'备份会包含密钥，只保存到本机，不上传。'}}))throw Error('已取消备份，未导出密钥');
    const captured=await adapter.capture(),result=await adapter.create(categories,captured.workspaceData);
    if(!result.ok||!result.path)throw Error(result.message);
    const checked=await adapter.inspect(result.path);if(!checked.ok)throw Error('备份已写出但检查未通过，请勿用于恢复');
    data={created:true,path:result.path,categories:checked.categories,bytes:(await fs.stat(result.path)).size,restoreInstructions:'在 Agent 中列出备份、检查此备份，再确认恢复；也可在软件「备份与恢复」中选择该文件。'};
   } else if(args.action==='inspect') {
    const file=await resolve(args.backupId!),before=await digest(file),info=await adapter.inspect(file);
    if(!info.ok)throw Error(info.message);
    const available=info.categories.map(x=>x.category),categories=args.categories??available.filter(x=>x!=='apiCredentials');
    if(!categories.length||categories.some(x=>!available.includes(x)))throw Error('所选分类不在此备份中，请按检查结果选择');
    const captured=await adapter.capture();if(await digest(file)!==before)throw Error('检查期间备份已变化，请重新检查');
    for(const [id,item] of inspected)if(item.expires<Date.now())inspected.delete(id);
    if(inspected.size>=50)throw Error('待恢复检查过多，请稍后重试');
    const inspectionId=randomUUID();inspected.set(inspectionId,{file,backupId:args.backupId!,digest:before,revision:fingerprint(captured),categories,expires:Date.now()+600000,session});
    data={inspectionId,name:path.basename(file),createdAt:info.createdAt,sourcePlatform:info.sourcePlatform,categories,availableCategories:info.categories,expiresInSeconds:600,conflictPolicy:'已有素材合并保留，冲突素材重命名；选中的配置覆盖；设备路径保留；运行中的酒馆工作区不覆盖。',next:'调用 restore 并传 inspectionId，由用户在 Agent 内确认。'};
   } else {
    const check=inspected.get(args.inspectionId!);
    if(!check||check.session!==session||check.expires<Date.now())throw Error('恢复检查已过期或不属于当前会话，请重新检查');
    if(!await approve({...request,args:{action:'restore',备份:path.basename(check.file),categories:check.categories,说明:'先保存恢复前备份。所选配置会覆盖，已有素材合并保留。'}}))throw Error('已取消恢复，原资料未改变');
    await resolve(check.backupId);
    const captured=await adapter.capture();
    if(fingerprint(captured)!==check.revision||await digest(check.file)!==check.digest)throw Error('确认期间资料或备份已变化，请重新检查；尚未恢复');
    inspected.delete(args.inspectionId!);request.signal?.throwIfAborted();
    const result=await adapter.restore(check.file,check.categories,captured.workspaceData);
    let refreshed=false;let refreshError='';
    if(result.ok)try{await adapter.refresh(result.workspaceData??{});refreshed=true;}catch{refreshError='资料已恢复，但界面刷新失败；重新打开软件后查看，不要重复恢复。';}
    // Never put portable workspace payload (possibly private settings) in model output.
    const {workspaceData:_,...summary}=result;
    data={...summary,restored:result.ok,refreshed,...(refreshError?{notice:refreshError}:{}),restoreInstructions:'如需撤销本次恢复，在「备份与恢复」中选择 rescueBackupPath 指向的恢复前备份。'};
    return {ok:result.ok,title:result.ok?'备份恢复完成':'恢复未完成',output:JSON.stringify(data),data};
   }
   return {ok:true,title:'本机备份与恢复',output:JSON.stringify(data),data};
  }catch(error){return {ok:false,title:'备份操作未完成',output:error instanceof Error?error.message:String(error)};}
 }
 return {handles:(tool:string)=>tool==='langbai_backup',execute:(request:AgentToolBridgeRequest)=>{const task=tail.then(()=>execute(request));tail=task.catch(()=>{});return task;}};
}
export function desktopBackupAdapter(capture:BackupAdapter['capture'],refresh:BackupAdapter['refresh']):BackupAdapter {
 return {
  directory:async()=>(await(await import('./data-backup.js')).getDataBackupStatus()).directory,
  capture:async()=>{const live=await capture(),store=await import('./store.js'),agent=await import('./agent-store.js'),refs=await import('./reference-presets.js');return {...live,revision:createHash('sha256').update(JSON.stringify([live.revision,store.readStore(),agent.readAgentWorkspace(),await refs.listReferencePresets()])).digest('hex')};},refresh,
  inspect:async file=>(await import('./data-backup.js')).inspectDataBackupFile(file),
  create:async(categories,workspaceData)=>(await import('./data-backup.js')).exportDataBackup({categories,workspaceData,destination:'internal'}),
  restore:async(file,categories,currentWorkspaceData)=>(await import('./data-backup.js')).importDataBackup({path:file,categories,currentWorkspaceData,confirmConfigurationOverwrite:true})
 };
}
