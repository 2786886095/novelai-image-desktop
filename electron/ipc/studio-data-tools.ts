import {ipcMain,type BrowserWindow,type WebContents} from 'electron';
import {randomUUID} from 'node:crypto';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import type {StudioAgentRequest,StudioAgentReply} from '../../src/studio-agent-contract';
import {validateLocalLibraryImport} from '../../src/studio-library-transfer';
import {validateTaskRequest} from '../../src/agent/task-contract';
import {STUDIO_WRITABLE} from '../../src/studio-agent-contract';
import {agentImageProviderState} from './agent-image-provider';
import type {SettingKey,AppSettings} from '../../src/types';

export const STUDIO_DATA_TOOLS=['langbai_tasks','langbai_read_studio_state','langbai_list_studio_data','langbai_update_studio_config','langbai_save_style_preset','langbai_import_studio_data'] as const;
export function createStudioDataTools(window:()=>BrowserWindow|null,timeoutMs=15000,approve:(request:AgentToolBridgeRequest)=>Promise<boolean>=async()=>false) {
  const pending=new Map<string,{sender:WebContents;action:StudioAgentRequest['action'];committed?:boolean;resolve:(value:StudioAgentReply)=>void;timer?:ReturnType<typeof setTimeout>;cleanup?:()=>void}>();
  ipcMain.handle('studio-agent:commit',async(event,id:string,key:SettingKey,expected:unknown,value:AppSettings[SettingKey])=>{
    const item=pending.get(id);
    if(!item||item.action!=='apply'||item.committed||event.sender!==item.sender||event.sender!==window()?.webContents)throw new Error('Unknown or expired Studio mutation');
    if(!['lastGenerationState','stylePromptPresets'].includes(key)&&!Object.hasOwn(STUDIO_WRITABLE.settings,key))throw new Error('Field is not writable');
    const {getSettings,setSetting}=await import('./store.js');
    // Recheck after module loading: timeout may have expired while awaiting it.
    if(pending.get(id)!==item||item.committed)throw new Error('Expired Studio mutation');
    if(JSON.stringify(getSettings()[key])!==JSON.stringify(expected))throw new Error('Stored setting changed since read');
    setSetting(key,value);item.committed=true;
  });
  ipcMain.handle('studio-agent:reply',(event,id:unknown,reply:StudioAgentReply)=>{
    const item=typeof id==='string'?pending.get(id):undefined;
    if(!item||event.sender!==item.sender||event.sender!==window()?.webContents)throw new Error('Unknown Studio reply sender or request');
    clearTimeout(item.timer);item.cleanup?.();pending.delete(id as string);
    if(!reply||typeof reply.ok!=='boolean')item.resolve({ok:false,error:'Invalid renderer reply'});
    else item.resolve(reply);
  });
  function ask(action:StudioAgentRequest['action'],args:Record<string,unknown>,waitForRun=false) {
    const owner=window();
    if(!owner||owner.isDestroyed()||owner.webContents.isDestroyed())return Promise.reject(new Error('Studio 窗口未就绪'));
    return new Promise<StudioAgentReply>((resolve,reject)=>{
      const id=randomUUID();
      const navigation=(event:{isMainFrame?:boolean;isSameDocument?:boolean})=>{if(event.isMainFrame&&!event.isSameDocument)destroyed();};
      const cleanup=()=>{owner.webContents.removeListener?.('destroyed',destroyed);owner.webContents.removeListener?.('render-process-gone',destroyed);owner.webContents.removeListener?.('did-start-navigation',navigation);};
      const destroyed=()=>{const item=pending.get(id);if(!item)return;clearTimeout(item.timer);pending.delete(id);cleanup();reject(new Error('Studio 窗口已销毁；运行结果未核实，未自动重试。'));};
      const timer=waitForRun?undefined:setTimeout(()=>{pending.delete(id);cleanup();reject(new Error('Studio 响应超时；修改结果待核实，请先回读，不要盲目重试。'));},timeoutMs);
      pending.set(id,{sender:owner.webContents,action,resolve,timer,cleanup});owner.webContents.once?.('destroyed',destroyed);owner.webContents.once?.('render-process-gone',destroyed);owner.webContents.on?.('did-start-navigation',navigation);
      try{owner.webContents.send('studio-agent:request',{id,action,args} satisfies StudioAgentRequest);}
      catch(error){clearTimeout(timer);cleanup();pending.delete(id);reject(error);}
    });
  }
  const response=(reply:StudioAgentReply):AgentToolBridgeResponse=>({ok:reply.ok,title:reply.ok?'Studio 数据':'Studio 数据操作未完成',output:JSON.stringify(reply.ok?reply.data:{error:reply.error}),...(reply.ok?{data:reply.data}:{})});
  let queue:Promise<unknown>=Promise.resolve();
  async function execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse> {
    try {
      if(request.tool==='langbai_tasks') {
        const input=validateTaskRequest(request.args);
        if(['resume','remove','clear'].includes(input.action)&&!await approve({...request,args:{...request.args,说明:input.action==='resume'?'继续执行已排队的生成任务，可能收费':'只移除尚未执行的排队任务，保留已生成图片'}}))throw Error('已取消任务操作');
        return response(await ask('tasks',request.args));
      }
      if(request.tool==='langbai_get_generation_state') {
        const reply=await ask('read',{section:'all'});
        if(!reply.ok)return response(reply);
        const data=reply.data as {generation:Record<string,unknown>&{params:{stylePrompt:string;negativePrompt:string}};settings:Record<string,unknown>;revision:string;capturedAt:string};
        const {getSettings}=await import('./store.js');
        return response({ok:true,data:{...data.generation,revision:data.revision,capturedAt:data.capturedAt,source:'live renderer',modelMode:data.settings.modelMode,generationGroupId:data.settings.generationGroupId,lockedStylePrompt:data.generation.params.stylePrompt,lockedNegativePrompt:data.generation.params.negativePrompt,streamPreviewEnabled:data.settings.streamPreviewEnabled,...agentImageProviderState(getSettings())}});
      }
      if(request.tool==='langbai_import_studio_data') {
        const {collection,items}=validateLocalLibraryImport(request.args,randomUUID);
        const owner=window();if(!owner||owner.isDestroyed())throw Error('Studio 窗口未就绪');
        const store=await import('./store.js');
        let backupPath:string;
        if(collection==='styles'||collection==='positivePresets'){
          const key=collection==='styles'?'stylePromptPresets':'positivePromptPresets';
          const previous=store.getSettings()[key];
          // Preserve original settings before explicit, append-only import.
          const {app}=await import('electron');const fs=await import('node:fs/promises');const path=await import('node:path');
          const dir=path.join(app.getPath('userData'),'TavernAgent','library-import-backups');await fs.mkdir(dir,{recursive:true});
          backupPath=path.join(dir,`${Date.now()}-${randomUUID()}.json`);await fs.writeFile(backupPath,JSON.stringify({collection,items:previous}),{flag:'wx'});
          const fresh=store.getSettings()[key];store.setSetting(key,[...fresh,...items.map(x=>({...x,group:'Default',previewImages:[]}))] as typeof previous);
        }else{
          const store=await import('./agent-store.js');const workspace=store.readAgentWorkspace();
          const merged={...workspace,[collection]:[...workspace[collection],...items]};
          store.writeAgentWorkspace(merged);backupPath=store.agentWorkspacePath()+'.bak';
        }
        return response({ok:true,data:{imported:items.length,collection,mode:'append-new-identities',backupPath}});
      }
      if(request.tool==='langbai_read_studio_state')return response(await ask('read',request.args));
      if(request.tool==='langbai_list_studio_data')return response(await ask('list',request.args));
      if(!['langbai_update_studio_config','langbai_save_style_preset'].includes(request.tool))throw new Error('Unknown Studio data tool');
      const args={...request.args,operation:request.tool==='langbai_save_style_preset'?'style':'config'};
      const prepared=await ask('prepare',args);
      if(!prepared.ok)return response(prepared);
      const owner=window();if(!owner||owner.isDestroyed())throw new Error('Studio 窗口已关闭');
      if(request.tool==='langbai_save_style_preset'&&request.args.id&&!await approve({...request,args:{...request.args,change:(prepared.data as {change:unknown}).change}}))return response({ok:false,error:'Agent 内未确认覆盖，原资料保持不变。'});
      return response(await ask('apply',args));
    }catch(error){return response({ok:false,error:error instanceof Error?error.message:'Studio 数据操作失败'});}
  }
  return {
    batchRunSettled:async(runId:string)=>{const reply=await ask('batch-project',{action:'_batch.generation.wait',runId},true);if(!reply.ok)throw Error(reply.error);return reply.data as Record<string,unknown>;},
    batchProject:async(args:Record<string,unknown>)=>{const reply=await ask('batch-project',args);if(!reply.ok)throw Error(reply.error);return reply.data as Record<string,unknown>;},
    comicRunSettled:async(runId:string)=>{const reply=await ask('comic-project',{action:'_comic.generation.wait',runId},true);if(!reply.ok)throw Error(reply.error);return reply.data as Record<string,unknown>;},
    comicProject:async(args:Record<string,unknown>)=>{const reply=await ask('comic-project',args);if(!reply.ok)throw Error(reply.error);return reply.data as Record<string,unknown>;},
    collections:async(args:Record<string,unknown>)=>{const reply=await ask('collections',args);if(!reply.ok)throw Error(reply.error);return reply.data as Record<string,unknown>;},
    backupWorkspace:async()=>{const r=await ask('backup-capture',{});if(!r.ok)throw Error(r.error);return r.data as {workspaceData:Record<string,string>;revision:string};},
    restoreWorkspace:async(workspaceData:Record<string,string>)=>{const r=await ask('backup-restore',{workspaceData});if(!r.ok)throw Error(r.error);return r.data;},
    handles:(tool:string)=>tool==='langbai_get_generation_state'||(STUDIO_DATA_TOOLS as readonly string[]).includes(tool),
    execute:(request:AgentToolBridgeRequest)=>{
      if(request.tool==='langbai_tasks'&&['list','cancel','pause'].includes(String(request.args.action)))return execute(request);
      if(!['langbai_update_studio_config','langbai_save_style_preset','langbai_import_studio_data','langbai_tasks'].includes(request.tool))return execute(request);
      const task=queue.then(()=>execute(request));queue=task.catch(()=>undefined);return task;
    },
  };
}
