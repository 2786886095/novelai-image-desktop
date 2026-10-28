export type PromptEditRequest = {kind:'optimize'|'custom';instruction:string};

import {PROMPT_OPTIMIZE_TEMPLATE, PROMPT_CUSTOM_TEMPLATE,PROMPT_OPTIMIZE_TEMPLATE_V2,PROMPT_CUSTOM_TEMPLATE_V2} from './data/prompt-edit-templates';
// Backward-compatible export; runtime selects the overlay by task kind.
export const PROMPT_ASSISTANT_POLICY = PROMPT_OPTIMIZE_TEMPLATE;
type EditingTemplates = {promptOptimizeTemplate?:string;promptAssistantTemplate?:string;promptOptimizeTemplateV2?:string;promptAssistantTemplateV2?:string};

export function resolvePromptAssistantMode(settings?: {promptAssistantMode?:unknown;convertMode?:unknown}|null):'tags'|'natural'|'mixed' {
 const mode=settings?.promptAssistantMode;
 return mode==='tags'||mode==='natural'||mode==='mixed'?mode:'mixed';
}
export function isSparsePromptEditSource(value:string){return value.trim().length<=120&&value.split(/[,，|]/).filter(part=>part.trim()).length<=3;}

export function preparePromptAssistance(currentPrompt:string,request:PromptEditRequest,templates:EditingTemplates={},edition:'1.0.0'|'2.0.0'='1.0.0') {
 if (!request || !['optimize','custom'].includes(request.kind) || typeof request.instruction!=='string' || typeof currentPrompt!=='string') throw new Error('提示词助手请求无效。');
 if(currentPrompt.length>24000||request.instruction.length>8000)throw new Error('提示词或修改要求过长。');
 const instruction=request.kind==='optimize'?'在不改变画面原意的前提下优化当前提示词，修正冲突和冗余，按所选模板完善表达。':request.instruction.trim();
 if(request.kind==='optimize'&&!currentPrompt.trim())throw new Error('请先输入要优化的提示词。');
 if(!instruction)throw new Error('请输入修改要求。');
 const v2=edition==='2.0.0';
 const custom=request.kind==='optimize'?(v2?templates.promptOptimizeTemplateV2:templates.promptOptimizeTemplate):(v2?templates.promptAssistantTemplateV2:templates.promptAssistantTemplate);
 const systemSuffix=custom?.trim() || (request.kind==='optimize'?(v2?PROMPT_OPTIMIZE_TEMPLATE_V2:PROMPT_OPTIMIZE_TEMPLATE):(v2?PROMPT_CUSTOM_TEMPLATE_V2:PROMPT_CUSTOM_TEMPLATE));
 return {systemSuffix,userText:JSON.stringify({task:request.kind,currentPrompt,instruction}),auditText:request.kind==='optimize'?currentPrompt:currentPrompt+'\n'+instruction};
}
