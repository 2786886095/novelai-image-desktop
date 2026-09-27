import {dialog,ipcMain,type BrowserWindow,type WebContents} from 'electron';
import {randomUUID} from 'node:crypto';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import type {StudioAgentRequest,StudioAgentReply} from '../../src/studio-agent-contract';
import {STUDIO_WRITABLE} from '../../src/studio-agent-contract';
import type {SettingKey,AppSettings} from '../../src/types';

export const STUDIO_DATA_TOOLS=['langbai_read_studio_state','langbai_list_studio_data','langbai_update_studio_config','langbai_save_style_preset'] as const;
export function createStudioDataTools(window:()=>BrowserWindow|null,timeoutMs=15000) {
  const pending=new Map<string,{sender:WebContents;action:StudioAgentRequest['action'];committed?:boolean;resolve:(value:StudioAgentReply)=>void;timer:ReturnType<typeof setTimeout>}>();
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
    clearTimeout(item.timer);pending.delete(id as string);
    if(!reply||typeof reply.ok!=='boolean')item.resolve({ok:false,error:'Invalid renderer reply'});
    else item.resolve(reply);
  });
  function ask(action:StudioAgentRequest['action'],args:Record<string,unknown>) {
    const owner=window();
    if(!owner||owner.isDestroyed()||owner.webContents.isDestroyed())return Promise.reject(new Error('Studio 窗口未就绪'));
    return new Promise<StudioAgentReply>((resolve,reject)=>{
      const id=randomUUID();
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Studio 响应超时；修改结果待核实，请先回读，不要盲目重试。'));},timeoutMs);
      pending.set(id,{sender:owner.webContents,action,resolve,timer});
      try{owner.webContents.send('studio-agent:request',{id,action,args} satisfies StudioAgentRequest);}
      catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
    });
  }
  const response=(reply:StudioAgentReply):AgentToolBridgeResponse=>({ok:reply.ok,title:reply.ok?'Studio 数据':'Studio 数据操作未完成',output:JSON.stringify(reply.ok?reply.data:{error:reply.error}),...(reply.ok?{data:reply.data}:{})});
  let queue:Promise<unknown>=Promise.resolve();
  async function execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse> {
    try {
      if(request.tool==='langbai_get_generation_state') {
        const reply=await ask('read',{section:'all'});
        if(!reply.ok)return response(reply);
        const data=reply.data as {generation:Record<string,unknown>;settings:Record<string,unknown>;revision:string;capturedAt:string};
        return response({ok:true,data:{...data.generation,revision:data.revision,capturedAt:data.capturedAt,source:'live renderer',modelMode:data.settings.modelMode,generationGroupId:data.settings.generationGroupId,lockedStylePrompt:data.settings.lockStylePrompt?data.settings.savedStylePrompt:'',lockedNegativePrompt:data.settings.lockNegativePrompt?data.settings.savedNegativePrompt:'',streamPreviewEnabled:data.settings.streamPreviewEnabled}});
      }
      if(request.tool==='langbai_read_studio_state')return response(await ask('read',request.args));
      if(request.tool==='langbai_list_studio_data')return response(await ask('list',request.args));
      if(!['langbai_update_studio_config','langbai_save_style_preset'].includes(request.tool))throw new Error('Unknown Studio data tool');
      const args={...request.args,operation:request.tool==='langbai_save_style_preset'?'style':'config'};
      const prepared=await ask('prepare',args);
      if(!prepared.ok)return response(prepared);
      const owner=window();if(!owner||owner.isDestroyed())throw new Error('Studio 窗口已关闭');
      const description=JSON.stringify((prepared.data as {change:unknown}).change,null,2);
      // The native dialog shows the exact proposed change; tool input cannot
      // impersonate approval. The renderer checks the revision again afterwards.
      const decision=await dialog.showMessageBox(owner,{type:'question',title:'酒馆 Agent · 修改软件配置',message:'是否应用 Agent 提出的配置修改？',detail:description,buttons:['取消','应用修改'],defaultId:0,cancelId:0,noLink:true});
      if(decision.response!==1)return response({ok:false,error:'用户取消；未修改配置。'});
      return response(await ask('apply',args));
    }catch(error){return response({ok:false,error:error instanceof Error?error.message:'Studio 数据操作失败'});}
  }
  return {
    handles:(tool:string)=>tool==='langbai_get_generation_state'||(STUDIO_DATA_TOOLS as readonly string[]).includes(tool),
    execute:(request:AgentToolBridgeRequest)=>{
      if(!['langbai_update_studio_config','langbai_save_style_preset'].includes(request.tool))return execute(request);
      const task=queue.then(()=>execute(request));queue=task.catch(()=>undefined);return task;
    },
  };
}
