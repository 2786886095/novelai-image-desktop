import type {AppSettings} from '../types';
import type {AgentDiscoveredModel,AgentReasoningEffort} from './types';
export interface SavedAgentModel {
  providerKey:string; id:string; displayName:string; contextWindow:number; maxOutputTokens:number;
  reasoningEffort:AgentReasoningEffort; vision?:boolean;
}
export const agentProviderKey=(settings:Pick<AppSettings,'agentApiProtocol'|'agentApiBaseUrl'>)=>`${settings.agentApiProtocol}|${settings.agentApiBaseUrl.trim().replace(/\/+$/,'')}`;
export const agentEffort=(value:unknown):AgentReasoningEffort=>['low','medium','high'].includes(String(value))?value as AgentReasoningEffort:'auto';
export function normalizeSavedAgentModels(value:unknown):SavedAgentModel[] {
  if(!Array.isArray(value))return [];
  const entries=new Map<string,SavedAgentModel>();
  for(const p of value.slice(0,500)) {
    if(!p||typeof p.id!=='string'||!p.id.trim()||typeof p.providerKey!=='string'||!p.providerKey.includes('|'))continue;
    const contextWindow=Math.max(8192,Math.min(2000000,Math.trunc(Number(p.contextWindow)||128000)));
    const item:SavedAgentModel={providerKey:p.providerKey.slice(0,2048),id:p.id.trim().slice(0,300),displayName:String(p.displayName||p.id).slice(0,300),contextWindow,maxOutputTokens:Math.max(512,Math.min(contextWindow,Math.trunc(Number(p.maxOutputTokens)||8192))),reasoningEffort:agentEffort(p.reasoningEffort)};
    if(typeof p.vision==='boolean')item.vision=p.vision;
    entries.set(`${item.providerKey}\0${item.id}`,item);
  }
  return [...entries.values()];
}
export function newSavedAgentModel(settings:Pick<AppSettings,'agentApiProtocol'|'agentApiBaseUrl'|'agentContextWindow'|'agentMaxOutputTokens'|'agentVisionEnabled'>,model:Pick<AgentDiscoveredModel,'id'|'displayName'|'contextWindow'|'suggestedOutputTokens'|'maxOutputTokens'|'vision'>):SavedAgentModel {
  return normalizeSavedAgentModels([{providerKey:agentProviderKey(settings),id:model.id,displayName:model.displayName,contextWindow:model.contextWindow??settings.agentContextWindow,maxOutputTokens:model.suggestedOutputTokens??model.maxOutputTokens??settings.agentMaxOutputTokens,vision:model.vision??settings.agentVisionEnabled,reasoningEffort:'auto'}])[0];
}
/** Migration retains the current manually configured model, never an entire discovered list. */
export function selectedAgentModels(settings:AppSettings):SavedAgentModel[] {
  const key=agentProviderKey(settings), models=normalizeSavedAgentModels(settings.savedAgentModels).filter(m=>m.providerKey===key);
  if(settings.agentApiModel?.trim()&&!models.some(m=>m.id===settings.agentApiModel.trim()))models.unshift({...newSavedAgentModel(settings,{id:settings.agentApiModel.trim(),displayName:settings.agentApiModel.trim()}),reasoningEffort:agentEffort(settings.agentReasoningEffort)});
  return models;
}
export function selectedAgentModelPatch(model:SavedAgentModel):Partial<AppSettings> {
  return {agentApiModel:model.id,agentContextWindow:model.contextWindow,agentMaxOutputTokens:model.maxOutputTokens,agentReasoningEffort:model.reasoningEffort,...(model.vision!==undefined?{agentVisionEnabled:model.vision}:{})};
}
