import {expect,it} from 'vitest';
import {defaultPromptSkills} from './prompt-skills';
import {studioSelectedSystemPrompt} from './workspace-controls';
import type {AgentWorkspaceData,AgentConversation} from './types';
it('registers six stable independent optional dispatch skills, disabled by default',()=>{
 const skills=defaultPromptSkills();expect(skills).toHaveLength(6);expect(new Set(skills.map(s=>s.id)).size).toBe(6);
 for(const skill of skills){expect(skill.enabled).toBe(false);expect(skill.builtIn).toBe(true);expect(skill.name).toContain('2.0.0');expect(skill.instructions).toContain('studio_prompt_template');expect(skill.instructions).toContain('"templateVersion":"v5","skillVersion":"2.0.0"');expect(skill.instructions).not.toContain('{{image}}');expect(skill.instructions.length).toBeLessThan(1100);}
});
it('injects only explicitly enabled dispatch cards, not six full system templates',()=>{
 const skills=defaultPromptSkills(),workspace={skills,samplerPresets:[]} as unknown as AgentWorkspaceData,chat={studioTemplateEnabled:true,studioPresetId:'dsh-infinite-gen-5'} as AgentConversation;
 const baseline=studioSelectedSystemPrompt(workspace,chat);expect(baseline).not.toContain('User-enabled optional prompt skill');
 skills[0].enabled=true;const enabled=studioSelectedSystemPrompt(workspace,chat);
 expect(enabled).toContain(skills[0].instructions);expect(enabled).not.toContain(skills[1].instructions);
 chat.studioTemplateEnabled=false;expect(studioSelectedSystemPrompt(workspace,chat)).toBe('');
});
