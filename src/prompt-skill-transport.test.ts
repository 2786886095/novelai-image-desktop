import {describe,it,expect} from 'vitest';
import fixtures from './data/prompt-skill-audit-fixtures.json';
import {auditPromptSkillV2,parsePromptSkillV2Response} from './prompt-skill-audit';

describe('V2 ordinary response transport, not a validation bypass',()=>{
 for(const mode of ['tags','natural','mixed'] as const){
  const prompt=fixtures.find(x=>x.mode===mode&&x.name==='still_life')!.prompt;
  for(const language of ['','text','txt','plaintext','TEXT'])for(const eol of ['\n','\r\n']){
   it(`${mode}/${language||'unlabelled'}/${JSON.stringify(eol)} unwraps one complete fence without rewriting content`,()=>{
    const wrapped=' \n```'+language+eol+prompt+eol+'```\n ';
    expect(parsePromptSkillV2Response(wrapped,mode)).toEqual(parsePromptSkillV2Response(prompt,mode));
    // Direct auditing remains strict; only the model-response boundary unwraps.
    expect(()=>auditPromptSkillV2(wrapped,mode)).toThrow();
   });
  }
 }
 const tags=Array.from({length:50},(_,i)=>`object ${i}`).join(', ');
 const fence=(text:string)=>'```text\n'+text+'\n```';
 for(const [label,raw] of Object.entries({
  incomplete:'```text\n'+tags,inline:'```text '+tags+'```',prefix:'Here is the prompt: '+fence(tags),
  suffix:fence(tags)+'\nExplanation',json:'```json\n'+JSON.stringify({prompt:tags})+'\n```',
  multiline:fence(tags+'\nmore facts'),multiple:fence(tags)+'\n'+fence(tags),
  short:fence('red cup'),unclosedWeight:fence(tags+', 1.2::unclosed'),duplicate:fence(tags+', object 0'),
  unpairedAnchor:fence(tags+', source#giving'),chineseBody:fence(tags+', 一个杯子'),
  incompleteQuote:fence(tags+', Text: "unclosed'),artist:fence(tags+', artist:test'),quality:fence(tags+', best quality')
 }))it(`rejects ${label} after transport processing`,()=>expect(()=>parsePromptSkillV2Response(raw,'tags')).toThrow());
 for(const refusal of ['信息不足：请补充事实','模式能力不足：请改用混合模式'])it('preserves the controlled failure inside a fence: '+refusal.slice(0,4),()=>{
  expect(()=>parsePromptSkillV2Response(fence(refusal),'tags')).toThrow(refusal);
 });
 it('preserves quoted Chinese text, commas, pipes and weights literally',()=>{
  const prompt=tags+', 1.2::red cup ::, text, chinese text, Text: "你好, 世界 | 再见"';
  expect(parsePromptSkillV2Response(fence(prompt),'tags').prompt).toBe(prompt);
 });
 it('does not coerce ordinary replies into known-character variants',()=>{
  expect(()=>parsePromptSkillV2Response(fence(tags),'tags',true)).toThrow();
  const dual=JSON.stringify({namePrompt:tags,featurePrompt:tags});
  expect(parsePromptSkillV2Response('```json\n'+dual+'\n```','tags',true).variants).toEqual({namePrompt:tags,featurePrompt:tags});
 });
 for(const [mode,prompt] of [['tags','red cup'],['mixed',tags],['natural','A cat sleeps.']] as const){
  it(`conversion advisory ${mode} returns validation failure unchanged with warning`,()=>{
   expect(()=>parsePromptSkillV2Response(prompt,mode)).toThrow();
   const result=parsePromptSkillV2Response(prompt,mode,false,true);
   expect(result.prompt).toBe(prompt);expect(result.warnings.join('')).toContain('检查未通过');
  });
 }
 it('advisory known-character output retains both actual variants, never pads or invents',()=>{
  const result=parsePromptSkillV2Response(JSON.stringify({namePrompt:'1girl, blue hair',featurePrompt:'girl, blue hair'}),'tags',true,true);
  expect(result.variants).toEqual({namePrompt:'1girl, blue hair',featurePrompt:'girl, blue hair'});
  expect(result.warnings.join('')).toContain('检查未通过');
 });
 for(const bad of ['', ' '.repeat(3),'a'.repeat(60001),'信息不足：请补充','模式能力不足：不能表达','抱歉，无法完成','I am sorry, I cannot assist with this request.',"I can't help with that.",'```text\nred cup','{"prompt":"red cup"}']){
  it(`advisory does not turn unusable response into success (${bad.slice(0,12)})`,()=>expect(()=>parsePromptSkillV2Response(bad,'tags',false,true)).toThrow());
 }
});
