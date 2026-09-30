import {it,expect} from 'vitest';
import {reverseTemplateProtocol} from './reverse-template';
import {REVERSE_SYSTEM_PROMPTS} from './data/prompt-templates';
import shared from '../tests/fixtures/reverse-template-contract.json';

it.each(shared.cases)('cross-platform contract: $name',fixture=>{
  const protocol=reverseTemplateProtocol(shared.template,'mixed',fixture.known)!;
  if(fixture.ok)expect(()=>protocol.parse(fixture.raw)).not.toThrow();
  else expect(()=>protocol.parse(fixture.raw)).toThrow();
});

const sample=()=>({segments:[{units:[
  ...Array.from({length:42},(_,i)=>({kind:'tag',text:i===0?'1girl':`fixture tag ${i}`})),
  ...Array.from({length:18},(_,i)=>({kind:'natural',text:`her visible sleeve detail number ${i}`}))
]}]});
it('recognizes the actual built-in V5 mixed template',()=>{
  const protocol=reverseTemplateProtocol(REVERSE_SYSTEM_PROMPTS.mixed,'mixed',false)!;
  expect(protocol).not.toBeNull();
  expect(protocol.parse(JSON.stringify(sample())).prompt.split(',')).toHaveLength(60);
});
it('rejects the reported short tag-only result',()=>{
  const protocol=reverseTemplateProtocol(REVERSE_SYSTEM_PROMPTS.mixed,'mixed',true)!;
  expect(()=>protocol.parse(JSON.stringify({namePrompt:'1girl, solo, cosplay',featurePrompt:'white hair'}))).toThrow();
});
it('checks the character-name version separately, not the combined variant length',()=>{
  const a=sample(),b=sample();a.segments[0].units=a.segments[0].units.slice(0,30);
  expect(()=>reverseTemplateProtocol(REVERSE_SYSTEM_PROMPTS.mixed,'mixed',true)!.parse(JSON.stringify({namePrompt:a,featurePrompt:b}))).toThrow(/有效单元 30/);
});
it('rejects wrong unit ratios and duplicate padding',()=>{
  const a=sample();a.segments[0].units.splice(42);a.segments[0].units.push(...a.segments[0].units.slice(0,18));
  expect(()=>reverseTemplateProtocol(REVERSE_SYSTEM_PROMPTS.mixed,'mixed',false)!.parse(JSON.stringify(a))).toThrow(/有效单元 42/);
});
it('respects templates that forbid artist and quality additions',()=>{
  const a=sample();a.segments[0].units[1].text='masterpiece';
  expect(()=>reverseTemplateProtocol(REVERSE_SYSTEM_PROMPTS.mixed,'mixed',false)!.parse(JSON.stringify(a))).toThrow(/质量词/);
});
it('does not impose the default numeric contract on unrelated custom templates',()=>{
  expect(reverseTemplateProtocol('Write a short visual description','natural',false)).toBeNull();
  expect(reverseTemplateProtocol('Custom mixed caption','mixed',true)).toBeNull();
});
