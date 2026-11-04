import {it,expect} from 'vitest';
import {reverseTemplateProtocol} from './reverse-template';

const template='有效语义单元 50–150；Tag 65–75%';
const raw=JSON.stringify({segments:[{units:[{kind:'tag',text:'red cup'}]}]});
it('legacy conversion returns extractable typed text with count/ratio warning; reverse remains strict',()=>{
 const protocol=reverseTemplateProtocol(template,'mixed',false,'convert')!;
 expect(()=>protocol.parse(raw)).toThrow();
 const result=protocol.parse(raw,'红色杯子',{validationWarningOnly:true});
 expect(result.prompt).toBe('red cup');expect(result.warnings.join('')).toContain('检查未通过');
 expect(()=>reverseTemplateProtocol(template,'mixed',false,'reverse')!.parse(raw)).toThrow();
});
it('legacy advisory still rejects invalid internal JSON instead of presenting it as a prompt',()=>{
 const protocol=reverseTemplateProtocol(template,'mixed',false,'convert')!;
 for(const raw of ['{bad','{}','{"segments":[]}',JSON.stringify({segments:[{units:[{kind:'tag'}]}]})])expect(()=>protocol.parse(raw,'',{validationWarningOnly:true})).toThrow();
 for(const text of ['信息不足：请补充',"I'm sorry, I cannot help.",'a'.repeat(60001)])expect(()=>protocol.parse(JSON.stringify({segments:[{units:[{kind:'tag',text}]}]}),'',{validationWarningOnly:true})).toThrow();
});
