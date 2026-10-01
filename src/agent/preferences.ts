import type {StudioConversationOptions} from './workspace-controls';
export interface AgentUiPreferences {
 sidebarOpen?:boolean; resourcesOpen?:boolean; archivedView?:boolean;
 resourceTab?:'presets'|'worldbooks'|'characters'; composerHeight?:number;
}
/** Durable UI choices only. Never serialize modal state, permissions or secrets. */
export function normalizeAgentUiPreferences(raw:unknown):AgentUiPreferences {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const v=raw as Record<string,unknown>,out:AgentUiPreferences={};
 for(const key of ['sidebarOpen','resourcesOpen','archivedView'] as const)if(typeof v[key]==='boolean')out[key]=v[key];
 if(['presets','worldbooks','characters'].includes(String(v.resourceTab)))out.resourceTab=v.resourceTab as AgentUiPreferences['resourceTab'];
 if(typeof v.composerHeight==='number'&&Number.isFinite(v.composerHeight))out.composerHeight=Math.round(Math.max(108,Math.min(420,v.composerHeight)));
 return out;
}
/** New chats inherit explicit user choices; existing chats keep their own options. */
export function normalizeStudioDefaults(raw:unknown):Partial<StudioConversationOptions> {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const v=raw as Record<string,unknown>,out:Partial<StudioConversationOptions>={};
 if(v.studioApprovalMode==='confirm'||v.studioApprovalMode==='auto')out.studioApprovalMode=v.studioApprovalMode;
 for(const key of ['studioWebSearchEnabled','studioTemplateEnabled'] as const)if(typeof v[key]==='boolean')out[key]=v[key];
 for(const key of ['studioPresetId','activeCharacterId'] as const)if(typeof v[key]==='string'&&v[key].length<=200)out[key]=v[key];
 for(const key of ['characterIds','lorebookIds'] as const)if(Array.isArray(v[key]))out[key]=[...new Set(v[key].filter((id):id is string=>typeof id==='string'&&id.length<=200))].slice(0,256);
 return out;
}
/** Display the recorded path, not an invented URL-to-path conversion. */
export function historyPathText(raw:unknown){return typeof raw==='string'&&(/^[a-z]:[\\/]/i.test(raw)||raw.startsWith('\\\\')||raw.startsWith('/'))&&!/[\u0000-\u001f]/.test(raw)?raw:'';}
