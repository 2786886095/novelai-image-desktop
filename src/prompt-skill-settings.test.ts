import {expect,it} from 'vitest';
import {normalizePromptSkillSettings,hasCustomLegacySkill,skillVersionForModel} from './prompt-skill-settings';
import {REVERSE_SYSTEM_PROMPTS,CONVERT_SYSTEM_PROMPTS} from './data/prompt-templates';
import {PROMPT_CUSTOM_TEMPLATE,PROMPT_OPTIMIZE_TEMPLATE} from './data/prompt-edit-templates';
it('defaults a new profile to V5 skill 2.0.0 independently for all four tasks',()=>{
 expect(normalizePromptSkillSettings({})).toEqual({reversePromptSkillVersion:'2.0.0',convertPromptSkillVersion:'2.0.0',promptAssistantSkillVersion:'2.0.0',promptAssistantTemplateVersion:'v5'});
});
it('recognizes exact shipped defaults rather than calling them user edits',()=>{
 expect(hasCustomLegacySkill(REVERSE_SYSTEM_PROMPTS,'reverse')).toBe(false);
 expect(hasCustomLegacySkill(CONVERT_SYSTEM_PROMPTS,'convert')).toBe(false);
 expect(normalizePromptSkillSettings({reversePromptTemplates:REVERSE_SYSTEM_PROMPTS,convertPromptTemplates:CONVERT_SYSTEM_PROMPTS,promptOptimizeTemplate:PROMPT_OPTIMIZE_TEMPLATE,promptAssistantTemplate:PROMPT_CUSTOM_TEMPLATE}).convertPromptSkillVersion).toBe('2.0.0');
});
it('preserves real old mode and editing overrides, selecting 1.0.0 without rewriting them',()=>{
 const raw={reversePromptTemplates:{tags:'用户完整旧Tag\r\n$&',mixed:'',natural:''},convertPromptTemplates:{tags:'',mixed:'USER MIXED',natural:''},promptAssistantTemplate:'USER OVERLAY'};
 const before=JSON.stringify(raw),migrated=normalizePromptSkillSettings(raw);
 expect(migrated).toMatchObject({reversePromptSkillVersion:'1.0.0',convertPromptSkillVersion:'1.0.0',promptAssistantSkillVersion:'1.0.0'});
 expect(JSON.stringify(raw)).toBe(before);
});
it('honors an explicit new-edition selection without deleting old overrides',()=>{
 expect(normalizePromptSkillSettings({convertPromptTemplates:{tags:'CUSTOM',mixed:'',natural:''},convertPromptSkillVersion:'2.0.0'}).convertPromptSkillVersion).toBe('2.0.0');
});
it('V4.5 is always 1.0.0 and assistant target model has an independent selection',()=>{
 expect(normalizePromptSkillSettings({reversePromptTemplateVersion:'v4.5',reversePromptSkillVersion:'2.0.0',convertPromptTemplateVersion:'v4.5',promptAssistantTemplateVersion:'v5',promptAssistantSkillVersion:'2.0.0'})).toEqual({reversePromptSkillVersion:'1.0.0',convertPromptSkillVersion:'1.0.0',promptAssistantSkillVersion:'2.0.0',promptAssistantTemplateVersion:'v5'});
 expect(skillVersionForModel('2.0.0','v4.5')).toBe('1.0.0');
 expect(skillVersionForModel('bad','v5')).toBe('2.0.0');
});
