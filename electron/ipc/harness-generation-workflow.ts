import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
export const TEMPLATE_GENERATION_TOOL='studio_generate_from_description';
export function templateGenerationArgs(args:Record<string,unknown>){
  const allowed=['text','imageAttachmentId','mode','templateVersion','generate'];
  if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('未知模板生图参数');
  if(!args.imageAttachmentId&&(typeof args.text!=='string'||!args.text.trim()||args.text.length>16000))throw Error('需要完整画面要求');
  const generate=args.generate??{};
  if(!generate||typeof generate!=='object'||Array.isArray(generate))throw Error('生图参数无效');
  if(Object.keys(generate).some(k=>!['count','model','width','height','steps','cfgScale','seed','sampler','noiseSchedule'].includes(k)))throw Error('模板生图参数包含未知字段');
  return generate as Record<string,unknown>;
}
// Called ONLY after native session authorization or the single pipeline approval.
// No approval tokens arrive from model arguments. Internal repair is bounded by
// the software converter and never enters another confirmation path.
export async function runTemplateGeneration(request:AgentToolBridgeRequest,input:Record<string,unknown>,execute:(r:AgentToolBridgeRequest)=>Promise<AgentToolBridgeResponse>,unchanged:()=>boolean){
  request.signal?.throwIfAborted();
  const conversion=await execute({...request,tool:input.imageAttachmentId?'langbai_reverse_prompt':'langbai_convert_prompt',callId:request.callId+'-template',args:{...(input.imageAttachmentId?{attachmentId:input.imageAttachmentId,hint:input.text??'',scope:'full'}:{text:input.text}),...(input.mode?{mode:input.mode}:{}),...(input.templateVersion?{templateVersion:input.templateVersion}:{})}});
  if(!conversion.ok)return {...conversion,data:{...(conversion.data as object),retryable:false},output:conversion.output+'\n本次任务结束，未执行生图。请报告问题，不要自动新建同一任务反复要求确认。'};
  request.signal?.throwIfAborted();
  if(!unchanged())return {ok:false,title:'参数已变化',output:'模板或工作台参数在任务期间发生变化，已停止；未提交生图。'};
  const data=conversion.data as {result?:string;prompt?:string;template?:unknown;validation?:unknown};
  const prompt=data?.result??data?.prompt;
  if(typeof prompt!=='string'||!prompt.trim())return {ok:false,title:'模板无有效结果',output:'未提交生图。'};
  const result=await execute({...request,args:{...request.args,positivePrompt:prompt}});
  return {...result,data:{...(result.data as object),template:data.template,validation:data.validation,positivePrompt:prompt}};
}
