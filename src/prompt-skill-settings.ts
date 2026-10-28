import type {AppSettings,ModePromptTemplates,PromptSkillVersion,ReversePromptTemplateVersion} from './types';
import {isShippedModePrompt} from './prompt-mode';
import {REVERSE_SYSTEM_PROMPTS,CONVERT_SYSTEM_PROMPTS} from './data/prompt-templates';
import {PROMPT_OPTIMIZE_TEMPLATE,PROMPT_CUSTOM_TEMPLATE} from './data/prompt-edit-templates';

const modes=['tags','natural','mixed'] as const;
const same=(a:string,b:string)=>a.trim().replace(/\r\n/g,'\n')===b.trim().replace(/\r\n/g,'\n');
export function hasCustomLegacySkill(value:unknown,task:'reverse'|'convert') {
 if(!value||typeof value!=='object')return false;
 const defaults=task==='reverse'?REVERSE_SYSTEM_PROMPTS:CONVERT_SYSTEM_PROMPTS;
 return modes.some(mode=>{const text=(value as Partial<ModePromptTemplates>)[mode];return typeof text==='string'&&!!text.trim()&&!same(text,defaults[mode])&&!isShippedModePrompt(text,mode);});
}
export function skillVersionForModel(edition:unknown,model:ReversePromptTemplateVersion,fallback:PromptSkillVersion='2.0.0'):PromptSkillVersion {
 return model==='v4.5'?'1.0.0':edition==='1.0.0'||edition==='2.0.0'?edition:fallback;
}
/** Read legacy selections before defaults merge; keep genuine user edits in their
 * original 1.0.0 slots. New edition slots never consume or erase those edits. */
export function normalizePromptSkillSettings(raw:Partial<AppSettings>) {
 const reverseModel=raw.reversePromptTemplateVersion==='v4.5'?'v4.5':'v5';
 const convertModel=raw.convertPromptTemplateVersion==='v4.5'?'v4.5':'v5';
 const assistantModel=raw.promptAssistantTemplateVersion==='v4.5'?'v4.5':raw.promptAssistantTemplateVersion==='v5'?'v5':convertModel;
 const reverseCustom=hasCustomLegacySkill(raw.reversePromptTemplates,'reverse');
 const convertCustom=hasCustomLegacySkill(raw.convertPromptTemplates,'convert');
 const overlayCustom=!!((raw.promptOptimizeTemplate?.trim()&&!same(raw.promptOptimizeTemplate,PROMPT_OPTIMIZE_TEMPLATE))||(raw.promptAssistantTemplate?.trim()&&!same(raw.promptAssistantTemplate,PROMPT_CUSTOM_TEMPLATE)));
 return {
  reversePromptSkillVersion:skillVersionForModel(raw.reversePromptSkillVersion,reverseModel,reverseCustom?'1.0.0':'2.0.0'),
  convertPromptSkillVersion:skillVersionForModel(raw.convertPromptSkillVersion,convertModel,convertCustom?'1.0.0':'2.0.0'),
  promptAssistantSkillVersion:skillVersionForModel(raw.promptAssistantSkillVersion,assistantModel,overlayCustom||convertCustom?'1.0.0':'2.0.0'),
  promptAssistantTemplateVersion:assistantModel,
 };
}
/** Stable request context, deliberately excludes credentials and image bytes. */
export function promptSkillRequestContext(settings:Partial<AppSettings>|null|undefined,task:'reverse'|'convert') {
 const keys: (keyof AppSettings)[]=task==='reverse'
  ? ['reversePromptSkillVersion','reversePromptTemplateVersion','reversePromptTemplates','reversePromptTemplatesV45','reversePromptTemplatesV2','visionApiModel','visionApiUrl','reverseSystemPromptPresetId']
  : ['convertPromptSkillVersion','convertPromptTemplateVersion','convertPromptTemplates','convertPromptTemplatesV45','convertPromptTemplatesV2','convertApiModel','convertApiUrl','convertSystemPromptPresetId'];
 keys.push('reverseConvertDshEnabled','reverseConvertDshMode','reverseConvertPromptPresets','reverseConvertPromptPresetId');
 return JSON.stringify(keys.map(key=>settings?.[key]));
}
export function promptSkillStaleText(language:unknown) {
 const messages={
  'zh-CN':'设置或输入已变化；旧结果仅保留在任务列表，未覆盖当前提示词。',
 };
 return messages[language as keyof typeof messages]??messages['zh-CN'];
}
