import {it,expect} from "vitest";
import sources from "./data/prompt-template-sources-20260926.json";
import {refreshShippedTemplates} from "./data/prompt-template-migration";
import {REVERSE_SYSTEM_PROMPTS,CONVERT_SYSTEM_PROMPTS} from "./data/prompt-templates";
import {PREVIOUS_REVERSE_SYSTEM_PROMPTS,PREVIOUS_CONVERT_SYSTEM_PROMPTS} from "./data/prompt-templates-previous-v5";
import {modeUserInstruction,modeRepairSystemPrompt} from "./prompt-mode";
it.each(["reverse","convert"] as const)("updates exact defaults per mode, retains custom and empty %s overrides",kind=>{
 const old=kind==='reverse'?PREVIOUS_REVERSE_SYSTEM_PROMPTS:PREVIOUS_CONVERT_SYSTEM_PROMPTS;const next=kind==='reverse'?REVERSE_SYSTEM_PROMPTS:CONVERT_SYSTEM_PROMPTS;
 expect(refreshShippedTemplates({...old,tags:old.tags+' custom',natural:''},kind)).toEqual({tags:old.tags+' custom',natural:'',mixed:next.mixed});
 expect(refreshShippedTemplates(next,kind)).toEqual(next);
});
it('incorporates both supplied mixed templates and the fact-first exception',()=>{
 for(const [label,templates] of [['图片反推',REVERSE_SYSTEM_PROMPTS],['提示词转换',CONVERT_SYSTEM_PROMPTS]] as const){
 const input=sources[label];
 expect(templates.mixed).toContain(input);expect(templates.mixed).toContain('事实与指定范围高于长度目标');
 expect(templates.tags).toContain('纯 Tag');expect(templates.natural).toContain('不套用 50–150');
 }
});
it('runtime and repair use the new V5 ratio without changing V4.5 ratio',()=>{
 expect(modeUserInstruction('mixed','convert')).toContain('65–75%');
 expect(modeRepairSystemPrompt('mixed')).toContain('25–35%');
 expect(modeRepairSystemPrompt('mixed','v4.5')).toContain('75–85%');
});
