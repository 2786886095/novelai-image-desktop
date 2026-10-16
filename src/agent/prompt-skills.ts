import type {AgentSkill} from './types';
/** Optional dispatch cards, not six mutually exclusive system prompt bodies. */
export function defaultPromptSkills(createdAt='2026-10-17T00:00:00.000Z'):AgentSkill[] {
 return (['reverse','convert'] as const).flatMap(task=>(['tags','natural','mixed'] as const).map(mode=>({
  id:`builtin-prompt-v2-${task}-${mode}`,
  name:`${task==='reverse'?'图片反推':'文字转换'} · ${{tags:'纯 Tag',natural:'纯自然语言',mixed:'混合'}[mode]} · 2.0.0`,
  description:'NovelAI V5 Full · 可选默认技能。仅在当前任务明确匹配时读取对应版本正文；不会改变生图模型或自动启动生图。',
  instructions:`Use this skill only when the user requests ${task==='reverse'?'image reverse-prompting':'text-to-prompt conversion'} in ${mode} mode targeting NovelAI V5 Full. Read exactly one registered template using studio_prompt_template with ${JSON.stringify({kind:task,mode,templateVersion:'v5',skillVersion:'2.0.0'})}. Then use ${task==='reverse'?'langbai_reverse_prompt':'langbai_convert_prompt'} with the same mode, templateVersion and skillVersion and the actual user input${task==='reverse'?' plus the actual attachmentId':''}. Other task/mode/model requests do not match this skill. Never concatenate the other five template bodies, silently change image models, invent tool results, apply a failed prompt, or start paid image generation. The application tool permissions and the latest explicit user request remain authoritative.`,
  enabled:false,builtIn:true,createdAt,updatedAt:createdAt,
 })));
}
