import {expect,it} from 'vitest';
import {auditMixedEnvelope,mixedTemplateContract} from './prompt-template-audit';
import {reverseTemplateProtocol} from './reverse-template';
const template='有效语义单元 50–150；Tag 65–75%';
const envelope=()=>({segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:['1girl','black hair','blue eyes','upper body'][i]??'distinct tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her visible sleeve catches light '+i}))]}]});
it('blocks the observed unchanged black hair after explicit hair-color edit',()=>{
 const source='1girl, black hair, blue eyes, upper body\n只将头发颜色改为白色，保持蓝眼睛和其他设定不变。';
 const result=auditMixedEnvelope(JSON.stringify(envelope()),source,mixedTemplateContract(template,'mixed')!);
 expect(result.issues.join(' ')).toContain('white hair');
});
it('applies eye-color phrasing and does not treat a prohibited hair edit as an instruction',()=>{
 const e=envelope();const source='black hair, blue eyes, upper body\n将眼睛颜色改为红色，不要把头发颜色改为白色。';
 const r=auditMixedEnvelope(JSON.stringify(e),source,mixedTemplateContract(template,'mixed')!);
 expect(r.issues.join(' ')).toContain('red eyes');expect(r.issues.join(' ')).not.toContain('white hair');
});
it('a pure-tag reverse range is actually audited, not accepted as a 46-unit success',()=>{
 const protocol=reverseTemplateProtocol('有效语义单元 50–150\n当前模式：纯 Tag','tags',false);
 expect(protocol).not.toBeNull();expect(()=>protocol!.parse(JSON.stringify({segments:[{units:Array.from({length:46},(_,i)=>({kind:'tag',text:'visible tag '+i}))}]}))).toThrow(/50–150/);
});
it('text conversion uses template expansion boundaries, not image-only evidence rules',()=>{
 const protocol=reverseTemplateProtocol('有效语义单元 50–150\n当前模式：纯 Tag','tags',false,'convert');
 expect(protocol!.instruction).toContain('未限定的次要细节');
 expect(protocol!.instruction).toContain('单人严格只有一个 segment');
 expect(protocol!.instruction).not.toContain('反推只使用图像可见证据');
 expect(reverseTemplateProtocol('有效语义单元 50–150','tags',false)!.instruction).toContain('反推只使用图像可见证据');
});
