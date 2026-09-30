export type PromptEditRequest = {kind:'optimize'|'custom';instruction:string};

import {PROMPT_OPTIMIZE_TEMPLATE, PROMPT_CUSTOM_TEMPLATE} from './data/prompt-edit-templates';
// Backward-compatible export; runtime selects the overlay by task kind.
export const PROMPT_ASSISTANT_POLICY = PROMPT_OPTIMIZE_TEMPLATE;
type EditingTemplates = {promptOptimizeTemplate?:string;promptAssistantTemplate?:string};

export function preparePromptAssistance(currentPrompt:string,request:PromptEditRequest,templates:EditingTemplates={}) {
 if (!request || !['optimize','custom'].includes(request.kind) || typeof request.instruction!=='string' || typeof currentPrompt!=='string') throw new Error('Invalid prompt assistant request');
 if(currentPrompt.length>24000||request.instruction.length>8000)throw new Error('Prompt or instruction is too long');
 const instruction=request.kind==='optimize'?'在不改变画面原意的前提下优化当前提示词，修正冲突和冗余，按所选模板完善表达。':request.instruction.trim();
 if(request.kind==='optimize'&&!currentPrompt.trim())throw new Error('Enter a prompt before optimizing');
 if(!instruction)throw new Error('Enter your requested changes');
 const custom=request.kind==='optimize'?templates.promptOptimizeTemplate:templates.promptAssistantTemplate;
 const systemSuffix=custom?.trim() || (request.kind==='optimize'?PROMPT_OPTIMIZE_TEMPLATE:PROMPT_CUSTOM_TEMPLATE);
 return {systemSuffix,userText:JSON.stringify({task:request.kind,currentPrompt,instruction}),auditText:request.kind==='optimize'?currentPrompt:instruction};
}
