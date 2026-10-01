import type {AgentQuestion,AgentQuestionAnswer,AgentQuestionRequest} from './types';
export const agentQuestionToolSchema={type:'object',additionalProperties:false,required:['questions'],properties:{questions:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,required:['prompt','options'],properties:{prompt:{type:'string',minLength:1,maxLength:600},options:{type:'array',minItems:2,maxItems:6,items:{type:'object',additionalProperties:false,required:['label'],properties:{label:{type:'string',minLength:1,maxLength:120},description:{type:'string',maxLength:400},recommended:{type:'boolean'}}}}}}}}};
function text(value:unknown,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid question text');return value.trim();}
/** Treat the model's wording as plain data, not executable UI or authorization. */
export function normalizeAgentQuestions(input:unknown):AgentQuestion[]{
 const raw=(input as {questions?:unknown})?.questions;
 if(!Array.isArray(raw)||raw.length<1||raw.length>3)throw Error('Expected one to three questions');
 return raw.map((q,index)=>{
  if(!q||!Array.isArray(q.options)||q.options.length<2||q.options.length>6)throw Error('Expected two to six options');
  const options=q.options.map((o:any,i:number)=>({id:`o${i+1}`,label:text(o?.label,120),description:o?.description===undefined?undefined:text(o.description,400),recommended:o?.recommended===true}));
  if(options.filter((o:{recommended:boolean})=>o.recommended).length>1)throw Error('Only one recommendation per question');
  return {id:`q${index+1}`,prompt:text(q.prompt,600),options};
 });
}
export function initialAgentQuestionAnswers(request:AgentQuestionRequest):AgentQuestionAnswer[]{
 return request.questions.map(q=>({questionId:q.id,optionId:(q.options.find(o=>o.recommended)??q.options[0]).id}));
}
export function restoreAgentQuestionDraft(request:AgentQuestionRequest,value:unknown){
 const defaults=initialAgentQuestionAnswers(request),saved=value as {index?:unknown;answers?:unknown};
 const index=typeof saved?.index==='number'&&Number.isInteger(saved.index)?Math.max(0,Math.min(request.questions.length-1,saved.index)):0;
 const answers=defaults.map((fallback,i)=>{
  const a=Array.isArray(saved?.answers)?saved.answers[i]:undefined,q=request.questions[i];
  if(a?.questionId!==q.id)return fallback;
  if(typeof a.optionId==='string'&&q.options.some(o=>o.id===a.optionId))return {questionId:q.id,optionId:a.optionId};
  if(a.optionId===undefined&&typeof a.text==='string'&&a.text.length<=4000)return {questionId:q.id,text:a.text};
  return fallback;
 });
 return {index,answers};
}
export function validateAgentQuestionAnswers(request:AgentQuestionRequest,value:unknown):AgentQuestionAnswer[]{
 if(!Array.isArray(value)||value.length!==request.questions.length)throw Error('Answer every question');
 return request.questions.map(q=>{
  const matches=value.filter(a=>a?.questionId===q.id);if(matches.length!==1)throw Error('Invalid question identity');
  const answer=matches[0];
  if(typeof answer.optionId==='string'&&answer.text===undefined&&q.options.some(o=>o.id===answer.optionId))return {questionId:q.id,optionId:answer.optionId};
  if(answer.optionId===undefined)return {questionId:q.id,text:text(answer.text,4000)};
  throw Error('Invalid option identity');
 });
}
