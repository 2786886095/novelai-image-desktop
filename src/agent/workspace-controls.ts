import type {AgentConversation,AgentWorkspaceData} from './types';

export const STUDIO_BUILTIN_PRESETS=[
 {id:'studio-director',name:'presetDirector',body:'Help the user plan and create images. Keep replies brief, preserve explicit image constraints, use actual Studio generation tools and receipts. Do not generate when asked only to discuss or inspect.'},
 {id:'studio-prompts',name:'presetPrompts',body:'Focus on NovelAI prompt composition, subject, action, lighting and framing. Preserve explicit tags and exclusions. Explain edits briefly; never invent an executed image.'},
 {id:'studio-reference',name:'presetReference',body:'Analyze attached reference images and separate observed visual details from uncertainty. Preserve requested identity, clothing and composition in the generation plan. Use app image tools only when requested.'},
] as const;

export type StudioConversationOptions=Pick<AgentConversation,'studioApprovalMode'|'studioWebSearchEnabled'|'studioTemplateEnabled'|'studioPresetId'|'characterIds'|'activeCharacterId'|'lorebookIds'>;
export function studioSessionOptions(chat?: Partial<AgentConversation>){return{
 approvalMode:chat?.studioApprovalMode==='auto'?'auto' as const:'confirm' as const,
 webSearchEnabled:chat?.studioWebSearchEnabled===true,
 templateEnabled:chat?.studioTemplateEnabled!==false,
 presetId:chat?.studioPresetId||'studio-director',
};}
export function studioToolEnabled(name:string,webSearchEnabled:boolean){return name!=='langbai_search_web'||webSearchEnabled;}
export function studioBuiltinPreset(id:string){return STUDIO_BUILTIN_PRESETS.find(p=>p.id===id);}
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
