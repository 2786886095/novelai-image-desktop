import beforeV3 from "./prompt-templates-pre-v3.json";
import {REVERSE_SYSTEM_PROMPTS,CONVERT_SYSTEM_PROMPTS} from "./prompt-templates";
import {PREVIOUS_REVERSE_SYSTEM_PROMPTS,PREVIOUS_CONVERT_SYSTEM_PROMPTS} from "./prompt-templates-previous-v5";
type Templates={tags:string;natural:string;mixed:string};
export function refreshShippedTemplates(value:Templates,kind:"reverse"|"convert"):Templates {
 const old=kind==="reverse"?PREVIOUS_REVERSE_SYSTEM_PROMPTS:PREVIOUS_CONVERT_SYSTEM_PROMPTS;
 const next=kind==="reverse"?REVERSE_SYSTEM_PROMPTS:CONVERT_SYSTEM_PROMPTS;
 return Object.fromEntries((["tags","natural","mixed"] as const).map(mode=>[mode,(value[mode]===old[mode]||(mode==="mixed"&&value[mode]===beforeV3[kind]))?next[mode]:value[mode]])) as Templates;
}
