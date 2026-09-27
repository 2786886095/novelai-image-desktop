import {it,expect} from 'vitest';
import {createPromptTemplateTools,templateSelection} from './harness-prompt-templates';
import type {AppSettings} from '../../src/types';
const settings=()=>({convertMode:'tags',reversePromptMode:'natural',convertPromptTemplateVersion:'v5',reversePromptTemplateVersion:'v4.5',convertPromptTemplates:{mixed:'live mixed',tags:'live tags',natural:'live prose'},reversePromptTemplatesV45:{mixed:'image mixed'},savedStylePrompt:'fixed style',savedNegativePrompt:'fixed negative'} as AppSettings);
it('defaults Agent to mixed; resolves live software template by kind/version without legacy fallback',()=>{
 const s=settings();expect(templateSelection(s).body).toBe('live mixed');
 expect(templateSelection(s,{kind:'reverse'}).body).toBe('image mixed');
 s.convertPromptTemplates.mixed='edited in software';expect(templateSelection(s).body).toBe('edited in software');
 s.convertPromptTemplates.mixed='';s.convertSystemPrompt='hidden legacy';expect(templateSelection(s).body).not.toContain('hidden legacy');
 expect(templateSelection(s).source).toBe('builtin');
 expect(()=>templateSelection(s,{kind:'bad'})).toThrow();expect(()=>templateSelection(s,{mode:'bad'})).toThrow();
});
it('import/switch/reset uses software settings, rejects stale writes, and preserves other modes, style and negatives',()=>{
 let s=settings();const writes:string[]=[];
 const service=createPromptTemplateTools(()=>s,(key,value)=>{writes.push(key);s={...s,[key]:value}});
 const read=(args={})=>service.execute({tool:'studio_prompt_template',args}).data!;
 let old=read();
 expect(service.execute({tool:'studio_save_prompt_template',args:{expectedRevision:'old',body:'bad'}}).ok).toBe(false);expect(writes).toHaveLength(0);
 expect(service.execute({tool:'studio_save_prompt_template',args:{expectedRevision:old.revision,body:'imported text'}}).ok).toBe(true);
 expect(s.convertPromptTemplates.mixed).toBe('imported text');expect(s.convertPromptTemplates.tags).toBe('live tags');
 expect(service.execute({tool:'studio_save_prompt_template',args:{expectedRevision:old.revision,body:'stale'}}).ok).toBe(false);
 old=read({mode:'natural'});expect(service.execute({tool:'studio_save_prompt_template',args:{mode:'natural',expectedRevision:old.revision}}).ok).toBe(true);
 expect(templateSelection(s).mode).toBe('natural');expect(templateSelection(s).body).toBe('live prose');
 old=read();expect(service.execute({tool:'studio_save_prompt_template',args:{expectedRevision:old.revision,body:''}}).ok).toBe(false);
 expect(service.execute({tool:'studio_save_prompt_template',args:{expectedRevision:old.revision,body:'',restoreDefault:true}}).ok).toBe(true);
 expect(templateSelection(s).source).toBe('builtin');expect(s.savedStylePrompt).toBe('fixed style');expect(s.savedNegativePrompt).toBe('fixed negative');
});
it('production batch commit saves template, mode and version together; a failed commit leaves state unchanged',()=>{
 let s=settings(),commits=0,fail=true;
 const service=createPromptTemplateTools(()=>s,()=>{throw Error('No individual writes expected');},patch=>{commits++;if(fail)throw Error('disk full');s={...s,...patch};});
 const before=templateSelection(s,{mode:'natural'}),args={mode:'natural',body:'new natural',expectedRevision:before.revision};
 expect(service.execute({tool:'studio_save_prompt_template',args}).ok).toBe(false);expect(s.convertPromptTemplates.natural).toBe('live prose');expect(s.agentPromptTemplateMode).toBeUndefined();
 fail=false;expect(service.execute({tool:'studio_save_prompt_template',args}).ok).toBe(true);expect(s.agentPromptTemplateMode).toBe('natural');expect(s.convertPromptTemplates.natural).toBe('new natural');expect(commits).toBe(2);
 expect(service.execute({tool:'studio_prompt_template',args:{approved:true}}).ok).toBe(false);
});
