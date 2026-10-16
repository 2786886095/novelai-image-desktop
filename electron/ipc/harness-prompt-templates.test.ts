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
it('V2 Agent selection returns exactly one registered body and isolated custom slot',()=>{
 const s={...settings(),reversePromptTemplateVersion:'v5',reversePromptSkillVersion:'2.0.0',reversePromptTemplatesV2:{tags:'V2 TAG OVERRIDE',natural:'',mixed:''}} as AppSettings;
 expect(templateSelection(s,{kind:'reverse',mode:'tags'})).toMatchObject({key:'reversePromptTemplatesV2',skillVersion:'2.0.0',body:'V2 TAG OVERRIDE',source:'custom'});
 const natural=templateSelection(s,{kind:'reverse',mode:'natural'});
 expect(natural.body).toContain('纯自然语言');expect(natural.body).not.toContain('V2 TAG OVERRIDE');
 expect(()=>templateSelection(s,{kind:'reverse',templateVersion:'v4.5'})).toThrow('仅适用于');
 expect(templateSelection(s,{kind:'reverse',templateVersion:'v4.5',skillVersion:'1.0.0'}).key).toBe('reversePromptTemplatesV45');
});
it('V2 save/restore affects only selected edition and mode, preserving prior overrides and other modes',()=>{
 let s={...settings(),convertPromptSkillVersion:'2.0.0',convertPromptTemplatesV2:{tags:'V2 tags',natural:'V2 prose',mixed:'V2 mixed'}} as AppSettings;
 const original=structuredClone(s),service=createPromptTemplateTools(()=>s,(key,value)=>{s={...s,[key]:value};});
 const fields={kind:'convert',mode:'tags',templateVersion:'v5',skillVersion:'2.0.0'};
 const before=templateSelection(s,fields);
 expect(service.execute({tool:'studio_save_prompt_template',args:{...fields,expectedRevision:before.revision,body:'changed tags'}}).ok).toBe(true);
 expect(s.convertPromptTemplates).toEqual(original.convertPromptTemplates);expect(s.convertPromptTemplatesV2).toEqual({tags:'changed tags',natural:'V2 prose',mixed:'V2 mixed'});
 const current=templateSelection(s,fields);expect(service.execute({tool:'studio_save_prompt_template',args:{...fields,expectedRevision:current.revision,body:'',restoreDefault:true}}).ok).toBe(true);
 expect(s.convertPromptTemplatesV2).toEqual({tags:'',natural:'V2 prose',mixed:'V2 mixed'});expect(templateSelection(s,fields).source).toBe('builtin');
 expect(service.execute({tool:'studio_save_prompt_template',args:{...fields,expectedRevision:before.revision,body:'stale'}}).ok).toBe(false);
});
it('assistant model and edition are independent of conversion, including overlay restore',()=>{
 let s={...settings(),convertPromptTemplateVersion:'v4.5',convertPromptSkillVersion:'1.0.0',promptAssistantTemplateVersion:'v5',promptAssistantSkillVersion:'2.0.0',promptOptimizeTemplate:'OLD USER OVERLAY',promptOptimizeTemplateV2:'NEW USER OVERLAY'} as AppSettings;
 const selected=templateSelection(s,{kind:'optimize'});expect(selected).toMatchObject({templateVersion:'v5',skillVersion:'2.0.0',key:'promptOptimizeTemplateV2',body:'NEW USER OVERLAY'});
 const service=createPromptTemplateTools(()=>s,(key,value)=>{s={...s,[key]:value};});
 expect(service.execute({tool:'studio_save_prompt_template',args:{kind:'optimize',expectedRevision:selected.revision,body:'',restoreDefault:true}}).ok).toBe(true);
 expect(s.promptOptimizeTemplate).toBe('OLD USER OVERLAY');expect(s.promptOptimizeTemplateV2).toBe('');expect(s.convertPromptTemplateVersion).toBe('v4.5');
});
