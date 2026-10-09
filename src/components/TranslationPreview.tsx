import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useAppStore} from '../store';
import {AppPortal,SelectMenu} from './ui';
import {CompactIconButton} from './CompactPromptControls';
import {TRANSLATION_LANGUAGES,normalizeTranslationPreference,normalizeTranslationSource,resolveTranslationTarget,translationText,translationEditorText} from '../translation';
import {TranslationSession} from '../translation-session';

export function TranslationPreview({currentValue,context,language,onApply,onClose}:{currentValue:string;context:string;language:unknown;onApply:(value:string,expected:string,context:string)=>boolean;onClose:()=>void}) {
 const settings=useAppStore(s=>s.settings),text=translationText(language),editor=translationEditorText(language);
 const preference=normalizeTranslationPreference(settings?.translateTargetLanguage),sourcePreference=normalizeTranslationSource(settings?.translateSourceLanguage),target=resolveTranslationTarget(preference,language);
 const origin=useRef({source:currentValue,context});
 const [session]=useState(()=>new TranslationSession(currentValue,target,(source,to,from)=>window.naiDesktop.translate(source,to,from),settings?.translateRealtime===true,sourcePreference));
 const state=useSyncExternalStore(session.subscribe,()=>session.snapshot,()=>session.snapshot);
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[localError,setLocalError]=useState('');
 const dialog=useRef<HTMLElement>(null),closed=useRef(false),close=useRef(onClose);close.current=onClose;
 const originalChanged=currentValue!==origin.current.source||context!==origin.current.context;
 const canApply=state.valid&&!!state.result.trim()&&!state.busy&&!state.composing&&!saving&&!originalChanged;
 useEffect(()=>{closed.current=false;session.start();return()=>{closed.current=true;session.dispose();};},[session]);
 useEffect(()=>{session.setLanguages(sourcePreference,target);session.setLive(settings?.translateRealtime===true);},[session,sourcePreference,target,settings?.translateRealtime]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();return;}
   if(e.key!=='Tab')return;
   const nodes=[...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input:not(:disabled),[tabindex="0"]')??[]].filter(n=>n.getClientRects().length);
   if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
   else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);previous?.focus({preventScroll:true});};
 },[]);
 async function persistLanguages(from:string,to:string){
  setSaving(true);setLocalError('');setNotice('');
  try{await window.naiDesktop.setSetting('translateSourceLanguage',from);await window.naiDesktop.setSetting('translateTargetLanguage',to);await useAppStore.getState().refreshSettings();}
  catch(e){if(!closed.current){session.setLanguages(sourcePreference,target);setLocalError(e instanceof Error?e.message:text.failed);}}
  finally{if(!closed.current)setSaving(false);}
 }
 async function changeLive(live:boolean){
  setSaving(true);setLocalError('');setNotice('');
  try{await session.persistLive(live,async value=>{await window.naiDesktop.setSetting('translateRealtime',value);await useAppStore.getState().refreshSettings();});}
  catch(e){if(!closed.current)setLocalError(e instanceof Error?e.message:text.failed);}
  finally{if(!closed.current)setSaving(false);}
 }
 async function copy(){
  try{await navigator.clipboard.writeText(state.result);if(!closed.current)setNotice(text.copied);}
  catch{if(!closed.current)setLocalError(text.copyFailed);}
 }
 const edit=()=>{setNotice('');setLocalError('');};
 return <AppPortal><div className="modal-backdrop prompt-assistant-backdrop"><section ref={dialog} className="prompt-assistant-dialog translation-preview-dialog" role="dialog" aria-modal="true" aria-label={text.title}>
  <header><h2>{text.title}</h2><CompactIconButton label={text.cancel} icon="close" onClick={onClose}/></header>
  <div className="prompt-assistant-body translation-preview-body">
   <div className="translation-preview-languages">
    <SelectMenu value={state.sourceLanguage} options={[{value:'auto',label:editor.auto},...TRANSLATION_LANGUAGES]} label={editor.sourceLanguage} ariaLabel={editor.sourceLanguage} disabled={saving} onChange={next=>{session.setLanguages(next,state.target);void persistLanguages(next,preference);}}/>
    <button type="button" className="translation-swap-button" aria-label={editor.swap} title={session.canSwap?editor.swap:editor.selectSource} disabled={!session.canSwap||saving} onClick={()=>{edit();if(session.swap())void persistLanguages(session.snapshot.sourceLanguage,session.snapshot.target);}}>⇄</button>
    <SelectMenu value={state.target===target?preference:state.target} options={[{value:'system',label:text.system},...TRANSLATION_LANGUAGES]} label={text.target} ariaLabel={text.target} disabled={saving} onChange={next=>{session.setLanguages(state.sourceLanguage,resolveTranslationTarget(next,language));void persistLanguages(state.sourceLanguage,normalizeTranslationPreference(next));}}/>
   </div>
   <div className="translation-preview-options">
    <label className="translation-live-toggle"><span>{editor.live}</span><span className={`toggle ${state.live?'toggle-on':''}`}><input type="checkbox" role="switch" aria-label={editor.live} checked={state.live} disabled={saving} onChange={e=>void changeLive(e.target.checked)}/><span/></span></label>
   </div>
   <p className="prompt-assistant-note">{text.hint}</p>
   <div className="translation-preview-columns">
    <label>{text.source}<textarea aria-label={text.source} value={state.source} onChange={e=>{edit();session.editSource(e.target.value);}} onCompositionStart={()=>session.setComposing(true)} onCompositionEnd={()=>session.setComposing(false)}/></label>
    <label>{text.result}<textarea aria-label={text.result} value={state.result} onChange={e=>{edit();session.editResult(e.target.value);}} onCompositionStart={()=>session.setComposing(true)} onCompositionEnd={()=>session.setComposing(false,false)}/></label>
   </div>
   {state.busy&&<p role="status">{text.busy}</p>}{notice&&<p role="status">{notice}</p>}{(localError||state.error)&&<p className="prompt-assistant-error" role="alert">{localError||(state.error==='TRANSLATION_FAILED'?text.failed:state.error)}</p>}{originalChanged&&<p className="prompt-assistant-error" role="alert">{text.stale}</p>}
  </div>
  <footer><button type="button" onClick={onClose}>{text.cancel}</button><button type="button" disabled={state.busy||state.composing||saving||!state.source.trim()} onClick={()=>{edit();session.translate();}}>{state.result?text.retry:text.run}</button><button type="button" disabled={!canApply} onClick={()=>void copy()}>{text.copy}</button><button className="prompt-assistant-apply" type="button" disabled={!canApply} onClick={()=>{if(canApply){if(onApply(state.result,origin.current.source,origin.current.context))onClose();else setLocalError(text.stale);}}}>{text.apply}</button></footer>
 </section></div></AppPortal>;
}
