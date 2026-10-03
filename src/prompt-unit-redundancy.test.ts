import {expect,it} from 'vitest';
import {normalizeMixedEnvelope,promptUnitIdentity} from './prompt-template-audit';
import {reverseTemplateProtocol} from './reverse-template';
import fixture from '../tests/fixtures/prompt-unit-redundancy.json';
it.each(fixture.cases)('whole-unit redundancy: $name',sample=>{
 const raw=JSON.stringify({segments:sample.segments});
 expect(JSON.parse(normalizeMixedEnvelope(raw)).segments.map((s:{units:{text:string}[]})=>s.units.map(u=>u.text))).toEqual(sample.expected);
 expect(reverseTemplateProtocol('有效语义单元 1–150','tags',false)!.parse(raw).prompt).toBe(sample.expected.map(s=>s.join(', ')).join(' | '));
});
it('does not reinterpret natural units',()=>expect(promptUnitIdentity('natural','mist')).not.toBe(promptUnitIdentity('natural','misty')));
it('rejects an all-label segment after cleanup',()=>expect(()=>reverseTemplateProtocol('有效语义单元 1–150','tags',false)!.parse(JSON.stringify({segments:[{units:[{kind:'tag',text:'foreground'},{kind:'tag',text:'background'}]}]}))).toThrow());
it('does not pad49 unique units up to hard50',()=>{
 const units=['mist','misty',...Array.from({length:48},(_,i)=>'distinct tag '+i)].map(text=>({kind:'tag',text}));
 expect(()=>reverseTemplateProtocol('有效语义单元 50–150','tags',false)!.parse(JSON.stringify({segments:[{units}]}))).toThrow(/有效单元 49/);
});
it('retains explicit layer weight rather than silently deleting it',()=>{
 const e={segments:[{units:[{kind:'tag',text:'1.3::foreground ::'}]}]};
 expect(JSON.parse(normalizeMixedEnvelope(JSON.stringify(e)))).toEqual(e);
});
it('rejects a weighted empty layer rather than counting it as a fact',()=>expect(()=>reverseTemplateProtocol('有效语义单元 1–150','tags',false)!.parse(JSON.stringify({segments:[{units:[{kind:'tag',text:'1.3::foreground ::'}]}]}))).toThrow(/层级标签缺少具体事实/));
it('empty role segment is a controlled template rejection',()=>expect(()=>reverseTemplateProtocol('有效语义单元 1–150','tags',false)!.parse(JSON.stringify({segments:[{units:[{kind:'tag',text:'2girls'}]},{units:[{kind:'tag',text:'foreground'}]},{units:[{kind:'tag',text:'background'}]}]}))).toThrow());
