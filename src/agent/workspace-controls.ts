import type {AgentConversation,AgentWorkspaceData} from './types';
import infinitePreset from '../../shared/agent-infinite-preset.json';
import {LYRA_PRESET_SYSTEM_PROMPT,LYRA_PRESET_JAILBREAK_PROMPT} from '../tavern/lyra-preset-data';

export const STUDIO_DEFAULT_PRESET_ID='dsh-infinite-gen-4';
export const STUDIO_MERGED_PRESET_ID='studio-complete';
export const STUDIO_LYRA_PRESET_ID='builtin-lyra-beta-3-8-sampler';
const oldPresetIds=new Set(['studio-director','studio-prompts','studio-reference','tavern:'+STUDIO_LYRA_PRESET_ID]);
export function studioPresetId(id?:string){return !id||oldPresetIds.has(id)?STUDIO_DEFAULT_PRESET_ID:id;}

export const STUDIO_BUILTIN_PRESETS=[
 {id:STUDIO_DEFAULT_PRESET_ID,name:'presetInfinite',body:infinitePreset.adaptedPrompt},
 {id:STUDIO_MERGED_PRESET_ID,name:'presetComplete',body:[
  'Help the user plan and create images. Keep replies brief, preserve explicit image constraints, use actual Studio generation tools and receipts. Do not generate when asked only to discuss or inspect.',
  'Focus on NovelAI prompt composition, subject, action, lighting and framing. Preserve explicit tags and exclusions. Explain edits briefly; never invent an executed image.',
  'Analyze attached reference images and separate observed visual details from uncertainty. Preserve requested identity, clothing and composition in the generation plan. Use app image tools only when requested.',
  LYRA_PRESET_SYSTEM_PROMPT,LYRA_PRESET_JAILBREAK_PROMPT,
 ].join('\n\n')},
] as const;

export type StudioConversationOptions=Pick<AgentConversation,'studioApprovalMode'|'studioWebSearchEnabled'|'studioTemplateEnabled'|'studioPresetId'|'characterIds'|'activeCharacterId'|'lorebookIds'>;
export function studioSessionOptions(chat?: Partial<AgentConversation>){return{
 approvalMode:chat?.studioApprovalMode==='confirm'?'confirm' as const:'auto' as const,
 webSearchEnabled:chat?.studioWebSearchEnabled!==false,
 templateEnabled:chat?.studioTemplateEnabled!==false,
 presetId:studioPresetId(chat?.studioPresetId),
};}
export function studioToolEnabled(name:string,webSearchEnabled:boolean){return name!=='langbai_search_web'||webSearchEnabled;}
export function studioBuiltinPreset(id:string){return STUDIO_BUILTIN_PRESETS.find(p=>p.id===studioPresetId(id));}
/** User-selected creative references are data, never execution permissions. */
export function studioCreativeReferenceData(workspace:AgentWorkspaceData,chat:AgentConversation,lore:Array<{book:{name:string};entry:{content:string;comment?:string}}>){
 const options=studioSessionOptions(chat);
 const preset=studioBuiltinPreset(options.presetId);
 const tavern=options.presetId.startsWith('tavern:')?workspace.samplerPresets.find(p=>p.id===options.presetId.slice(7)):undefined;
 return JSON.stringify({
  preset:options.templateEnabled?(preset?{name:preset.name,body:preset.body}:tavern?{name:tavern.name,body:tavern.systemPrompt,postscript:tavern.jailbreakPrompt}:null):null,
  characters:workspace.characters.filter(c=>chat.characterIds.includes(c.id)).map(c=>({name:c.nickname||c.name,description:c.description,personality:c.personality,scenario:c.scenario,creativeInstructions:c.systemPrompt,postscript:c.postHistoryInstructions})),
  worldbooks:lore.map(item=>({book:item.book.name,title:item.entry.comment,content:item.entry.content})),
 });
}
