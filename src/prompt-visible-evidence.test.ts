import {expect,it} from 'vitest';
import {normalizeMixedEnvelope,promptUnitIdentity} from './prompt-template-audit';
import {reverseTemplateProtocol} from './reverse-template';
import fixture from '../tests/fixtures/prompt-visible-evidence.json';
const envelope=(texts:string[])=>JSON.stringify({segments:[{units:texts.map(text=>({kind:'tag',text}))}]});
const actual=envelope(fixture.actualPrompt.split(',').map(s=>s.trim()));
it('recounts the observed rock/stone overlap, never adds invented facts',()=>expect(JSON.parse(normalizeMixedEnvelope(actual)).segments[0].units).toHaveLength(47));
it('rejects the observed rich reverse when deduplication misses hard50',()=>expect(()=>reverseTemplateProtocol('有效语义单元 50–150','tags',false)!.parse(actual)).toThrow(/有效单元 47/));
it('bare material alternatives share identity',()=>expect(promptUnitIdentity('tag','rock')).toBe(promptUnitIdentity('tag','stone')));
it('qualified material and object facts stay distinct',()=>expect(promptUnitIdentity('tag','stone floor')).not.toBe(promptUnitIdentity('tag','rock')));
it('different weights remain distinct',()=>expect(promptUnitIdentity('tag','1.3::rock ::')).not.toBe(promptUnitIdentity('tag','1.5::stone ::')));
it('never changes natural unit text',()=>expect(promptUnitIdentity('natural','rock')).not.toBe(promptUnitIdentity('natural','stone')));
it('reverse policy distinguishes lighting from a visible source',()=>expect(reverseTemplateProtocol('有效语义单元 50–150','tags',false)!.instruction).toContain(fixture.policy.lighting));
it('reverse policy retains time uncertainty',()=>expect(reverseTemplateProtocol('有效语义单元 50–150','tags',false)!.instruction).toContain(fixture.policy.ambiguousTime));
it('text conversion does not inherit image-only evidence restrictions',()=>expect(reverseTemplateProtocol('有效语义单元 50–150','tags',false,'convert')!.instruction).not.toContain(fixture.policy.ambiguousTime));
it('different character segments retain their separate rocks',()=>{
 const e={segments:[{units:[{kind:'tag',text:'rock'}]},{units:[{kind:'tag',text:'stone'}]}]};
 expect(JSON.parse(normalizeMixedEnvelope(JSON.stringify(e)))).toEqual(e);
});
