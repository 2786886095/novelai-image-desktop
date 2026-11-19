import {classifyAiPromptResponse} from './ai-prompt-response';
import {comicPageFrame,parseComicPromptPages} from '../../src/comic/comic-prompt';
export class V5ClassifiedError extends Error {}
type Turn={role:string;content:unknown};
interface Options{model:string;budget:number;messages:Turn[];pages?:number;signal?:AbortSignal}
const instruction='Continue outputting directly from the exact character where you stopped. Do not repeat any already generated text or add explanations.';
export async function requestV5Prompt(o:Options,send:(messages:Turn[],budget:number,budgetKey:'max_tokens'|'max_completion_tokens')=>Promise<any>){
 const reasoning=/(?:deepseek.*(?:reasoner|thinking|r1)|claude.*thinking|gemini.*(?:thinking|pro)|(?:^|\/)o[134](?:-|$)|gpt-5)/i.test(o.model);
 const key=/(?:^|\/)(?:o[134](?:-|$)|gpt-5)/i.test(o.model)?'max_completion_tokens':'max_tokens';
 let budget=reasoning?12000:o.budget,history=[...o.messages],assembled='';
 for(let attempt=0;attempt<=2;attempt++){
  o.signal?.throwIfAborted();let response;
  try{response=await send(history,budget,key)}catch(e:any){
   const msg=String(e?.response?.data?.error?.message??e?.response?.data?.message??'');
   if(budget!==12000||e?.response?.status!==400||!/(?:max[_ ](?:completion[_ ])?tokens|output.{0,16}limit|token.{0,16}limit)/i.test(msg)||!/exceed|limit|at most|range|maximum|too (?:large|high)|less than/i.test(msg))throw e;
   budget=8192;o.signal?.throwIfAborted();response=await send(history,budget,key);
  }
  const choice=response?.data?.choices?.[0],fin=choice?.finish_reason;
  // Isolate the provider's length signal, but never bypass filtering/refusal.
  const check=classifyAiPromptResponse({choices:[{...choice,finish_reason:fin==='length'?'stop':fin}]});
  if(!check.ok && !(check.kind==='empty'&&fin==='length'))throw new V5ClassifiedError(check.message);
  let chunk=check.ok?check.content:'';
  if(assembled&&chunk.startsWith(assembled))chunk=chunk.slice(assembled.length);
  else if(assembled){for(let n=Math.min(4096,assembled.length,chunk.length);n>=12;n--)if(assembled.endsWith(chunk.slice(0,n))){chunk=chunk.slice(n);break;}}
  assembled+=chunk;
  const frame=o.pages===undefined?undefined:comicPageFrame(assembled);
  const opened=frame!==undefined&&frame.state!=='bare',closed=frame?.state==='closed';
  const enough=closed&&parseComicPromptPages(assembled,o.pages!).countStatus==='exact';
  if(enough||(fin!=='length'&&(!opened||closed)))return {data:{choices:[{finish_reason:'stop',message:{content:assembled}}]}};
  if(attempt===2)return {data:{choices:[{finish_reason:'length',message:{content:assembled}}]}};
  history=assembled?[...o.messages,{role:'assistant',content:assembled},{role:'user',content:instruction}]:[...o.messages];
 }
 throw Error('续写次数已达上限');
}
