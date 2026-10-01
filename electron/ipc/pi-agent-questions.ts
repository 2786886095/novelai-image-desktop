import {randomUUID} from 'node:crypto';
import {normalizeAgentQuestions,validateAgentQuestionAnswers} from '../../src/agent/questions';
import type {AgentEvent,AgentQuestionRequest,AgentQuestionResponse,AgentQuestionResult} from '../../src/agent/types';
/** Application-owned manual answer gate. No timers and no connection to paid approvals. */
export class StudioQuestionRequests {
 private pending=new Map<string,{request:AgentQuestionRequest;finish:(answers:AgentQuestionResult)=>void}>();
 list():AgentQuestionRequest[]{return [...this.pending.values()].map(p=>structuredClone(p.request));}
 request(input:unknown,identity:{conversationId:string;messageId:string},signal:AbortSignal,emit:(event:AgentEvent)=>void):Promise<AgentQuestionResult>{
  signal.throwIfAborted();
  if([...this.pending.values()].some(p=>p.request.conversationId===identity.conversationId))throw Error('Another question is awaiting an answer');
  const request:AgentQuestionRequest={...identity,id:randomUUID(),questions:normalizeAgentQuestions(input)};
  return new Promise((resolve,reject)=>{
   const cleanup=(status:'answered'|'cancelled'|'aborted')=>{this.pending.delete(request.id);signal.removeEventListener('abort',abort);emit({kind:'question-resolved',requestId:request.id,conversationId:request.conversationId,status});};
   const abort=()=>{cleanup('aborted');reject(signal.reason??Error('Question aborted'));};
   this.pending.set(request.id,{request,finish:result=>{cleanup(result.cancelled?'cancelled':'answered');resolve(result);}});
   signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted){abort();return;}
   emit({kind:'question',request:structuredClone(request)});
  });
 }
 respond(input:AgentQuestionResponse):{ok:boolean;message?:string}{
  const pending=this.pending.get(input?.requestId);
  if(!pending||pending.request.conversationId!==input.conversationId)return {ok:false,message:'Question is no longer pending'};
  if(input.cancel===true){pending.finish({cancelled:true,answers:[]});return {ok:true};}
  let answers;try{answers=validateAgentQuestionAnswers(pending.request,input.answers);}catch{return {ok:false,message:'Invalid or incomplete answers'};}
  const result=answers.map(a=>{const q=pending.request.questions.find(q=>q.id===a.questionId)!;return {...a,question:q.prompt,label:q.options.find(o=>o.id===a.optionId)?.label};});
  pending.finish({cancelled:false,answers:result});return {ok:true};
 }
}
export const studioQuestions=new StudioQuestionRequests();
