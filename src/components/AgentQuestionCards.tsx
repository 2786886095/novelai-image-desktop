import {useEffect,useId,useRef,useState} from 'react';
import {LuCheck,LuChevronLeft,LuChevronRight} from 'react-icons/lu';
import type {AgentQuestionAnswer,AgentQuestionRequest,AgentQuestionResponse} from '../agent/types';
import {restoreAgentQuestionDraft,validateAgentQuestionAnswers} from '../agent/questions';
import {studioUxText} from '../agent/ux';
export function AgentQuestionCards({request,language,onRespond}:{request:AgentQuestionRequest;language:unknown;onRespond:(response:AgentQuestionResponse)=>Promise<{ok:boolean;message?:string}>}){
 const t=(key:string,name='')=>studioUxText(language,key,name),uid=useId(),heading=useRef<HTMLHeadingElement>(null);
 const storageKey=`studio-agent-question:${request.id}`;
 const [draft]=useState(()=>{try{return restoreAgentQuestionDraft(request,JSON.parse(sessionStorage.getItem(storageKey)??'null'));}catch{return restoreAgentQuestionDraft(request,null);}});
 const [index,setIndex]=useState(draft.index),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [answers,setAnswers]=useState<AgentQuestionAnswer[]>(draft.answers);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[request.id,index]);
 useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({index,answers}));}catch{/* Never depend on browser storage. */}},[answers,index,storageKey]);
 const question=request.questions[index],answer=answers[index];
 function change(value:AgentQuestionAnswer){setAnswers(current=>current.map((a,i)=>i===index?value:a));setError('');}
 function ready(){try{validateAgentQuestionAnswers(request,answers);return true;}catch{return false;}}
 const currentReady=!!answer&&(question.options.some(o=>o.id===answer.optionId)||!answer.optionId&&!!answer.text?.trim());
 async function send(cancel=false){if(busy||!cancel&&!ready())return;setBusy(true);setError('');try{const response=await onRespond({requestId:request.id,conversationId:request.conversationId,...(cancel?{cancel:true}:{answers:validateAgentQuestionAnswers(request,answers)})});if(!response.ok)throw Error(t('questionFailed'));try{sessionStorage.removeItem(storageKey);}catch{/* Optional draft cleanup. */}}catch(reason){setError(String(reason));}finally{setBusy(false);}}
 return <section className="pi-question-card" aria-labelledby={`${uid}-title`} aria-busy={busy}>
  <header><span>{t('questionProgress',`${index+1} / ${request.questions.length}`)}</span><small>{t('questionManual')}</small></header>
  <h3 id={`${uid}-title`} tabIndex={-1} ref={heading}>{question.prompt}</h3>
  <form onSubmit={event=>{event.preventDefault();if(index===request.questions.length-1)void send();else if(currentReady)setIndex(index+1);}}>
   <fieldset disabled={busy}><legend className="pi-question-legend">{t('questionChoose')}</legend>
    {question.options.map(option=><label key={option.id} className={`pi-question-option${answer?.optionId===option.id?' is-selected':''}`}>
     <input type="radio" name={`${uid}-${question.id}`} checked={answer?.optionId===option.id} onChange={()=>change({questionId:question.id,optionId:option.id})}/>
     <span><strong>{option.label}{option.recommended&&<small className="pi-question-badge">{t('questionRecommended')}</small>}</strong>{option.description&&<small className="pi-question-description">{option.description}</small>}</span>{answer?.optionId===option.id&&<LuCheck aria-hidden/>}
    </label>)}
    <label className={`pi-question-option${!answer?.optionId?' is-selected':''}`}><input type="radio" name={`${uid}-${question.id}`} checked={!answer?.optionId} onChange={()=>change({questionId:question.id,text:''})}/><span><strong>{t('questionCustom')}</strong></span></label>
    {!answer?.optionId&&<textarea autoFocus aria-label={t('questionCustom')} placeholder={t('questionCustomHint')} maxLength={4000} rows={3} value={answer?.text??''} onChange={event=>change({questionId:question.id,text:event.target.value})}/>}
   </fieldset>
   {error&&<p role="alert" className="pi-notice pi-notice-error">{error}</p>}
   <footer><button type="button" disabled={busy} onClick={()=>void send(true)}>{t('questionCancel')}</button><div>
    {request.questions.length>1&&<button type="button" disabled={busy||index===0} onClick={()=>setIndex(index-1)}><LuChevronLeft aria-hidden/>{t('questionPrevious')}</button>}
    {index<request.questions.length-1?<button type="submit" className="pi-primary" disabled={busy||!currentReady}>{t('questionNext')}<LuChevronRight aria-hidden/></button>:<button type="submit" className="pi-primary" disabled={busy||!ready()}>{t(busy?'questionSubmitting':'questionSubmit')}</button>}
   </div></footer>
  </form>
 </section>;
}
