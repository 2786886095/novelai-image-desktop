import {describe,it,expect} from 'vitest';
import fixtures from './data/prompt-skill-audit-fixtures.json';
import {preparePromptAssistance} from './prompt-assistant';
import {PROMPT_CUSTOM_TEMPLATE,PROMPT_CUSTOM_TEMPLATE_V2} from './data/prompt-edit-templates';
import {auditPromptSkillV2,parsePromptSkillV2Response,promptSkillControlledFailure,type SkillPromptMode} from './prompt-skill-audit';
describe('v2 skill bounded audit (no model or generation)',()=>{
 for(const f of fixtures)it(`preserves supplied ${f.mode}/${f.name} without comma/word-count confusion`,()=>{
  const r=auditPromptSkillV2(f.prompt,f.mode as SkillPromptMode);expect(r.prompt).toBe(f.prompt);
  if(f.mode==='natural'){expect(r.stats).toEqual({scope:'format-only'});expect(r.warnings.join('')).toContain('人工复核');}
  else{expect(r.stats.effectiveUnits).toBe(f.declaredUnits);expect(r.stats.tagWords).toBe(f.tagWords);expect(r.stats.naturalWords).toBe(f.naturalWords);}
 });
 const tags=(n:number)=>Array.from({length:n},(_,i)=>`object ${i}`).join(', ');
 it('hard minimum 50 and no inherited 150 maximum',()=>{
  expect(()=>auditPromptSkillV2(tags(49),'tags')).toThrow(/49/);expect(auditPromptSkillV2(tags(50),'tags').stats.effectiveUnits).toBe(50);expect(auditPromptSkillV2(tags(151),'tags').stats.effectiveUnits).toBe(151);
 });
 it('does not count person/dataset/anchor/text/exclusion metadata',()=>{
  const p='1girl, fur dataset, text, english text, -1::hat ::, '+tags(49)+', Text: "字, a | b"';
  expect(()=>auditPromptSkillV2(p,'tags')).toThrow(/49/);
 });
 it('allows quoted Chinese lettering without splitting commas or pipes',()=>expect(auditPromptSkillV2(tags(50)+', text, chinese text, Text: "你好, 世界 | 再见"','tags').stats.effectiveUnits).toBe(50));
 it('fails closed on controlled failures before cleanup and inside either known-character variant',()=>{
  for(const failure of ['信息不足：当前证据无法支持约50个有效单元，请补充目标细节。','模式能力不足：无法表达关系']){
   expect(promptSkillControlledFailure(failure)).toBe(failure);
   for(const mode of ['tags','natural','mixed'] as const){expect(()=>parsePromptSkillV2Response(failure,mode)).toThrow(failure);expect(()=>parsePromptSkillV2Response(JSON.stringify({namePrompt:tags(50),featurePrompt:failure}),mode,true)).toThrow(failure);}
  }
 });
 it('requires exact dual string JSON, never a guessed object from prose',()=>{
  const raw=JSON.stringify({namePrompt:tags(50),featurePrompt:tags(51)});expect(parsePromptSkillV2Response('```json\n'+raw+'\n```','tags',true).variants?.featurePrompt).toBe(tags(51));
  expect(()=>parsePromptSkillV2Response('here '+raw,'tags',true)).toThrow();expect(()=>parsePromptSkillV2Response(JSON.stringify({segments:[]}),'tags',true)).toThrow();
 });
 it('does not treat malformed syntax or a refusal as a valid prompt',()=>{
  for(const p of ['```text\n'+tags(50)+'\n```',tags(50)+', 1.2::unclosed',tags(50)+', Text: "unclosed',tags(50)+', artist:test',tags(50)+', best quality'])expect(()=>auditPromptSkillV2(p,'tags')).toThrow();
 });
 it('does not inflate natural fact count from sentences/commas',()=>{const r=auditPromptSkillV2('The woman holds a red book, and her left hand rests on the table.','natural');expect(r.stats.effectiveUnits).toBeUndefined();});
 it('requires Text payload at the end of base',()=>{expect(()=>auditPromptSkillV2('text, Text: \"字\", '+tags(50),'tags')).toThrow(/base最后/);});
 it('rejects unpaired interactive anchors',()=>expect(()=>auditPromptSkillV2(tags(50)+', source#giving','tags')).toThrow(/配对/));
 it('keeps editing overlays and user customizations independent by edition',()=>{
  const request={kind:'custom' as const,instruction:'edit'};
  expect(preparePromptAssistance('source',request).systemSuffix).toBe(PROMPT_CUSTOM_TEMPLATE);
  expect(preparePromptAssistance('source',request,{},'2.0.0').systemSuffix).toBe(PROMPT_CUSTOM_TEMPLATE_V2);
  const settings={promptAssistantTemplate:'OLD_USER',promptAssistantTemplateV2:'NEW_USER'};
  expect(preparePromptAssistance('source',request,settings,'1.0.0').systemSuffix).toBe('OLD_USER');
  expect(preparePromptAssistance('source',request,settings,'2.0.0').systemSuffix).toBe('NEW_USER');
  expect(settings).toEqual({promptAssistantTemplate:'OLD_USER',promptAssistantTemplateV2:'NEW_USER'});
 });
 const ratioPrompt=(tagWords:number,naturalWords:number)=>{
  const units=Array.from({length:50},(_,i)=>`object ${i}`);for(let n=100;n<tagWords;n++)units[(n-100)%50]+=' extra';
  const one=Math.floor(naturalWords/2),two=naturalWords-one;
  return units.join(', ')+', '+[one,two].map((n,i)=>'The object '+(i?'rests':'is')+' '+Array.from({length:n-3},(_,j)=>`detail${j}`).join(' ')+'.').join(' ');
 };
 for(const ratio of [65,75])it(`accepts inclusive mixed English-word ratio ${ratio}%`,()=>expect(auditPromptSkillV2(ratioPrompt(ratio*2,200-ratio*2),'mixed').stats.tagPercent).toBe(ratio));
 for(const ratio of [64,76])it(`rejects mixed word ratio ${ratio}% rather than unit ratio`,()=>expect(()=>auditPromptSkillV2(ratioPrompt(ratio*2,200-ratio*2),'mixed')).toThrow(/英文词占比/));
 it('retains 22 characters but rejects a 23rd role',()=>{
  const roles=Array.from({length:22},(_,i)=>'girl, long hair, object '+i+', blue eyes');
  expect(auditPromptSkillV2('22girls | '+roles.join(' | '),'tags').stats.effectiveUnits).toBe(66);
  expect(()=>auditPromptSkillV2('23girls | '+[...roles,'girl, long hair, object 22, blue eyes'].join(' | '),'tags')).toThrow(/22人/);
 });

});
