import {useEffect,useId,useRef,useState} from 'react';
import {LuCheck,LuChevronLeft,LuChevronRight} from 'react-icons/lu';
import type {AgentQuestionAnswer,AgentQuestionRequest,AgentQuestionResponse} from '../agent/types';
import {restoreAgentQuestionDraft,validateAgentQuestionAnswers} from '../agent/questions';
import {studioUxText} from '../agent/ux';
export function AgentQuestionCards({request,language,onRespond}:{request:AgentQuestionRequest;language:unknown;onRespond:(response:AgentQuestionResponse)=>Promise<{ok:boolean;message?:string}>}){
 const t=(key:string,name='')=>studioUxText(language,key,name),uid=useId(),heading=useRef<HTMLHeadingElement>(null),sending=useRef(false);
 const storageKey=`studio-agent-question:${request.id}`;
 const [draft]=useState(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');return restoreAgentQuestionDraft(request,[2,3].includes(saved?.version)?saved:null);}catch{return restoreAgentQuestionDraft(request,null);}});
 const [index,setIndex]=useState(draft.index),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [answers,setAnswers]=useState<AgentQuestionAnswer[]>(draft.answers);
 const [custom,setCustom]=useState(()=>new Set(draft.answers.filter(a=>!a.optionId&&a.text).map(a=>a.questionId)));
 const [confirmed,setConfirmed]=useState(()=>new Set(draft.confirmed));
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[request.id,index]);
 useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({version:3,requestId:request.id,index,answers,confirmed:[...confirmed]}));}catch{/* Never depend on browser storage. */}},[answers,index,confirmed,storageKey]);
 const question=request.questions[index],answer=answers[index];
 const currentReady=!!answer&&(question.options.some(o=>o.id===answer.optionId)||!answer.optionId&&!!answer.text?.trim());
 async function send(next:AgentQuestionAnswer[],cancel=false){
  if(sending.current)return;
  let validated:AgentQuestionAnswer[]|undefined;try{if(!cancel)validated=validateAgentQuestionAnswers(request,next);}catch{return;}
  sending.current=true;setBusy(true);setError('');
  try{const response=await onRespond({requestId:request.id,conversationId:request.conversationId,...(cancel?{cancel:true}:{answers:validated})});if(!response.ok)throw Error(response.message||t('questionFailed'));try{sessionStorage.removeItem(storageKey);}catch{/* Optional cleanup. */}}
  catch(reason){setError(String(reason));}finally{sending.current=false;setBusy(false);}
 }
 function change(value:AgentQuestionAnswer){setConfirmed(current=>{const next=new Set(current);next.delete(value.questionId);return next;});setAnswers(current=>current.map((a,i)=>i===index?value:a));setError('');}
 function confirmChoice(value:AgentQuestionAnswer){
  if(sending.current)return;const next=answers.map((a,i)=>i===index?value:a);setAnswers(next);setError('');
  const accepted=new Set(confirmed);accepted.add(value.questionId);setConfirmed(accepted);
  try{if(accepted.size!==request.questions.length)throw Error('Confirm each question');validateAgentQuestionAnswers(request,next);void send(next);}
  catch{const pending=next.findIndex(a=>!accepted.has(a.questionId));if(pending>=0)setIndex(pending);}
 }
 return <section className="pi-question-card" aria-labelledby={`${uid}-title`} aria-busy={busy}>
  <header><span>{t('questionProgress',`${index+1} / ${request.questions.length}`)}</span><small>{t('questionManual')}</small></header>
  <h3 id={`${uid}-title`} tabIndex={-1} ref={heading}>{question.prompt}</h3>
  <form onSubmit={event=>{event.preventDefault();if(currentReady)confirmChoice(answer);}}>
   <fieldset disabled={busy}><legend className="pi-question-legend">{t('questionChoose')}</legend>
    {question.options.map(option=><button type="button" key={option.id} className={`pi-question-option${answer?.optionId===option.id?' is-selected':''}`} aria-pressed={answer?.optionId===option.id} onClick={()=>confirmChoice({questionId:question.id,optionId:option.id})}>
     <span className="pi-question-radio" aria-hidden>{answer?.optionId===option.id?'●':'○'}</span><span><strong>{option.label}{option.recommended&&<small className="pi-question-badge">{t('questionRecommended')}</small>}</strong>{option.description&&<small className="pi-question-description">{option.description}</small>}</span>{answer?.optionId===option.id&&<LuCheck aria-hidden/>}
    </button>)}
    <button type="button" className={`pi-question-option${custom.has(question.id)&&!answer?.optionId?' is-selected':''}`} aria-pressed={custom.has(question.id)&&!answer?.optionId} onClick={()=>{setCustom(current=>new Set(current).add(question.id));change({questionId:question.id,text:''});}}><span className="pi-question-radio" aria-hidden>{custom.has(question.id)&&!answer?.optionId?'●':'○'}</span><span><strong>{t('questionCustom')}</strong></span></button>
    {custom.has(question.id)&&!answer?.optionId&&<><textarea aria-label={t('questionCustom')} placeholder={t('questionCustomHint')} maxLength={4000} rows={3} value={answer?.text??''} onChange={event=>change({questionId:question.id,text:event.target.value})}/><button type="submit" className="pi-question-custom-confirm" disabled={!currentReady}>{t('questionConfirmCustom')}</button></>}
   </fieldset>
   {error&&<p role="alert" className="pi-notice pi-notice-error">{error}</p>}
   <footer><button type="button" disabled={busy} onClick={()=>void send(answers,true)}>{t('questionCancel')}</button><div>
    {request.questions.length>1&&<><button type="button" disabled={busy||index===0} onClick={()=>setIndex(index-1)}><LuChevronLeft aria-hidden/>{t('questionPrevious')}</button><button type="button" disabled={busy||index===request.questions.length-1} onClick={()=>setIndex(index+1)}>{t('questionNext')}<LuChevronRight aria-hidden/></button></>}
   </div></footer>
  </form>
 </section>;
}
