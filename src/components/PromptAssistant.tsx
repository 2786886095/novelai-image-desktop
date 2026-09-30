import {useAppStore} from '../store';
import {isPromptApiConfigured,requestPromptApiSettings,promptSetupText} from '../prompt-ui-settings';
import {useEffect,useRef,useState} from 'react';
import {AppPortal} from './ui';
import {CompactIconButton} from './CompactPromptControls';
import {promptEditorText} from '../prompt-editor-text';
import type {PromptEditRequest} from '../prompt-assistant';
import type {ReversePromptMode,ReversePromptTemplateVersion} from '../types';

export function PromptAssistant({kind,currentValue,context,mode,version,language,onApply,onClose}:{
 kind:PromptEditRequest['kind'];currentValue:string;context:string;mode:ReversePromptMode;version:ReversePromptTemplateVersion;language:unknown;
 onApply:(next:string,expected:string)=>boolean;onClose:()=>void;
}) {
 const text=promptEditorText(language),title=kind==='optimize'?text.optimize:text.custom;
 const settings=useAppStore(state=>state.settings),ready=isPromptApiConfigured(settings),setup=promptSetupText(language);
 function configure(){requestPromptApiSettings();useAppStore.getState().setShowSettings(true);onClose();}
 const [instruction,setInstruction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<{value:string;source:string;context:string;stats?:string}|null>(null);
 const dialog=useRef<HTMLElement>(null),sequence=useRef(0),close=useRef(onClose);close.current=onClose;
 const stale=!!preview&&(preview.source!==currentValue||preview.context!==context);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  (dialog.current?.querySelector<HTMLElement>('textarea:not([readonly])')??dialog.current?.querySelector<HTMLElement>('button'))?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}
   if(e.key!=='Tab')return;
   const nodes=[...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,select,[tabindex="0"]')??[]].filter(n=>n.getClientRects().length);
   if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
   else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
  };
  document.addEventListener('keydown',key,true);
  return()=>{sequence.current++;document.removeEventListener('keydown',key,true);previous?.focus({preventScroll:true});};
 },[]);
 async function run(){
  if(busy||!isPromptApiConfigured(useAppStore.getState().settings))return;
  const id=++sequence.current,source=currentValue,requestContext=context;
  setBusy(true);setError('');setPreview(null);
  try {
   const reply=await window.naiDesktop.convertPrompt(source,mode,false,version,{kind,instruction});
   if(id!==sequence.current)return;
   if(!reply.ok||!reply.result?.trim()){setError(reply.message||text.failed);return;}
   setPreview({value:reply.result,source,context:requestContext,stats:reply.validation?`${reply.validation.total} ${text.units} · Tag ${reply.validation.tags} (${reply.validation.tagPercent}%) · ${text.natural} ${reply.validation.natural}`:undefined});
  }catch(e){if(id===sequence.current)setError(e instanceof Error?e.message:text.failed);}
  finally{if(id===sequence.current)setBusy(false);}
 }
 return <AppPortal><div className="modal-backdrop prompt-assistant-backdrop"><section ref={dialog} className="prompt-assistant-dialog" data-kind={kind} data-ready={ready} role="dialog" aria-modal="true" aria-label={title}>
  <header><h2>{title}</h2><CompactIconButton label={text.cancel} icon="close" onClick={onClose}/></header>
  <div className="prompt-assistant-body">
   {!ready?<div className="prompt-api-required"><p>{setup.missing}</p><button type="button" className="btn btn-primary" onClick={configure}>{setup.configure}</button></div>:<>
   <label className="prompt-assistant-source">{text.current}<textarea readOnly value={currentValue} placeholder={text.empty}/></label>
   {kind==='custom'&&<label className="prompt-assistant-instruction">{text.instruction}<textarea maxLength={8000} value={instruction} onChange={e=>{setInstruction(e.target.value);setPreview(null);}} placeholder={text.hint} disabled={busy}/></label>}
   {busy&&<p role="status">{text.busy}</p>}
   {error&&<p className="prompt-assistant-error" role="alert">{error}</p>}
   {preview&&<label className="prompt-assistant-result">{text.preview}<textarea readOnly value={preview.value}/>{preview.stats&&<small>{preview.stats}</small>}</label>}
   {stale&&<p className="prompt-assistant-error" role="alert">{text.stale}</p>}
   </>}
  </div>
  {ready&&<footer><button type="button" onClick={onClose}>{text.cancel}</button><button type="button" disabled={busy||(kind==='optimize'?!currentValue.trim():!instruction.trim())} onClick={()=>void run()}>{preview?text.retry:text.run}</button>
   <button className="prompt-assistant-apply" type="button" disabled={!preview||busy||stale} onClick={()=>{if(preview&&!stale){if(onApply(preview.value,preview.source))onClose();else setError(text.stale);}}}>{text.apply}</button></footer>}
 </section></div></AppPortal>;
}
