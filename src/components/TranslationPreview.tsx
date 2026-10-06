import {useEffect,useRef,useState} from 'react';
import {useAppStore} from '../store';
import {AppPortal,SelectMenu} from './ui';
import {CompactIconButton} from './CompactPromptControls';
import {TRANSLATION_LANGUAGES,normalizeTranslationPreference,resolveTranslationTarget,translationText} from '../translation';

export function TranslationPreview({currentValue,context,language,onApply,onClose}:{currentValue:string;context:string;language:unknown;onApply:(value:string,expected:string,context:string)=>boolean;onClose:()=>void}) {
 const settings=useAppStore(s=>s.settings),text=translationText(language);
 const preference=normalizeTranslationPreference(settings?.translateTargetLanguage);
 const target=resolveTranslationTarget(preference,language);
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<{value:string;source:string;context:string;target:string}|null>(null);
 const dialog=useRef<HTMLElement>(null),sequence=useRef(0),close=useRef(onClose);close.current=onClose;
 const stale=!!preview&&(preview.source!==currentValue||preview.context!==context||preview.target!==target);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();return;}
   if(e.key!=='Tab')return;
   const nodes=[...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,[tabindex="0"]')??[]].filter(n=>n.getClientRects().length);
   if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
   else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
  };
  document.addEventListener('keydown',key,true);
  return()=>{sequence.current++;document.removeEventListener('keydown',key,true);previous?.focus({preventScroll:true});};
 },[]);
 async function changeTarget(next:string){
  if(busy||saving)return;setSaving(true);setPreview(null);setError('');setNotice('');const id=++sequence.current;
  try{await window.naiDesktop.setSetting('translateTargetLanguage',normalizeTranslationPreference(next));await useAppStore.getState().refreshSettings();}
  catch(e){if(id===sequence.current)setError(e instanceof Error?e.message:text.failed);}
  finally{if(id===sequence.current)setSaving(false);}
 }
 async function run(){
  if(busy||saving||!currentValue.trim())return;
  const id=++sequence.current,source=currentValue,requestContext=context,requestTarget=target;
  setBusy(true);setError('');setNotice('');setPreview(null);
  try{const reply=await window.naiDesktop.translate(source,requestTarget);if(id!==sequence.current)return;
   if(!reply.ok||!reply.text?.trim()){setError(reply.error||text.failed);return;}
   setPreview({value:reply.text.trim(),source,context:requestContext,target:requestTarget});
  }catch(e){if(id===sequence.current)setError(e instanceof Error?e.message:text.failed);}
  finally{if(id===sequence.current)setBusy(false);}
 }
 async function copy(){if(!preview)return;const id=sequence.current;
  try{await navigator.clipboard.writeText(preview.value);if(id===sequence.current)setNotice(text.copied);}
  catch{if(id===sequence.current)setError(text.copyFailed);}
 }
 return <AppPortal><div className="modal-backdrop prompt-assistant-backdrop"><section ref={dialog} className="prompt-assistant-dialog translation-preview-dialog" role="dialog" aria-modal="true" aria-label={text.title}>
  <header><h2>{text.title}</h2><CompactIconButton label={text.cancel} icon="close" onClick={onClose}/></header>
  <div className="prompt-assistant-body translation-preview-body">
   <div className="translation-preview-target"><SelectMenu value={preference} options={[{value:'system',label:text.system},...TRANSLATION_LANGUAGES]} label={text.target} ariaLabel={text.target} disabled={busy||saving} onChange={next=>void changeTarget(next)}/><small>{TRANSLATION_LANGUAGES.find(l=>l.value===target)?.label}</small></div>
   <p className="prompt-assistant-note">{text.hint}</p>
   <div className="translation-preview-columns"><label>{text.source}<textarea readOnly value={currentValue}/></label><label>{text.result}<textarea readOnly value={preview?.value??''}/></label></div>
   {busy&&<p role="status">{text.busy}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p className="prompt-assistant-error" role="alert">{error}</p>}{stale&&<p className="prompt-assistant-error" role="alert">{text.stale}</p>}
  </div>
  <footer><button type="button" onClick={onClose}>{text.cancel}</button><button type="button" disabled={busy||saving||!currentValue.trim()} onClick={()=>void run()}>{preview?text.retry:text.run}</button><button type="button" disabled={!preview||busy||saving||stale} onClick={()=>void copy()}>{text.copy}</button><button className="prompt-assistant-apply" type="button" disabled={!preview||busy||saving||stale} onClick={()=>{if(preview&&!stale){if(onApply(preview.value,preview.source,preview.context))onClose();else setError(text.stale);}}}>{text.apply}</button></footer>
 </section></div></AppPortal>;
}
