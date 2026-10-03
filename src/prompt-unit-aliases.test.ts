import {expect,it} from 'vitest';
import {normalizeMixedEnvelope} from './prompt-template-audit';
import {reverseTemplateProtocol} from './reverse-template';
import shared from '../tests/fixtures/prompt-unit-aliases.json';
it.each(shared.cases)('shared unit alias contract: $name',fixture=>{
 const normalized=JSON.parse(normalizeMixedEnvelope(JSON.stringify({segments:fixture.segments})));
 expect(normalized.segments.map((s:{units:{text:string}[]})=>s.units.map(u=>u.text))).toEqual(fixture.expected);
 const prompt=reverseTemplateProtocol('有效语义单元 1–150','tags',false)!.parse(JSON.stringify({segments:fixture.segments})).prompt;
 expect(prompt).toBe(fixture.expected.map(s=>s.join(', ')).join(' | '));
});
it('removal cannot pad a 49-unit prompt up to the hard50 minimum',()=>{
 const units=['head back','head tilted back',...Array.from({length:48},(_,i)=>'distinct tag '+i)].map(text=>({kind:'tag',text}));
 expect(()=>reverseTemplateProtocol('有效语义单元 50–150','tags',false)!.parse(JSON.stringify({segments:[{units}]}))).toThrow(/有效单元 49/);
});
it('Tag alias rules never reinterpret natural units',()=>{
 const units=[{kind:'tag',text:'head back'},{kind:'natural',text:'head tilted back'}];
 expect(JSON.parse(normalizeMixedEnvelope(JSON.stringify({segments:[{units}]}))).segments[0].units).toEqual(units);
});
