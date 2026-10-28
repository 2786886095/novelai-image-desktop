import './negative-prompt-library.css';
import './prompt-preset-layout.css';
import {useEffect,useRef,useState} from 'react';
import {useAppStore} from './store';
import {AppPortal,Button} from './components/ui';
import {CompactIconButton} from './components/CompactPromptControls';
import {Icon} from './components/icons';
import {confirmAction} from './components/confirm';
import {applyNegativePreset,exportNegativeLibrary,mergeNegativeLibrary,negativeLibraryText,normalizeNegativePromptPresets,parseNegativeLibrary,type NegativePromptPreset} from './negative-prompt-library';
import {collectPromptTags,formatPromptTagInput,matchesPromptLibraryEntry,promptTagField,promptTagText,UNTAGGED_PROMPT_FILTER} from './prompt-library-tags';
import {PromptTagFilter,PromptTagInput,PromptTagList} from './components/PromptTagControls';

let pending:Promise<unknown>=Promise.resolve();
export function mutateNegativePresets(update:(current:NegativePromptPreset[])=>NegativePromptPreset[]){
 const op=pending.catch(()=>undefined).then(async()=>{
  const next=update(normalizeNegativePromptPresets(useAppStore.getState().settings?.negativePromptPresets));
  const saved=await window.naiDesktop.setSetting('negativePromptPresets',next);
  useAppStore.setState(s=>({settings:s.settings?{...s.settings,negativePromptPresets:saved}:s.settings}));
 });pending=op;return op;
}
/** `bar`: labelled library + save-current buttons that stay visible under the prompt editor. */
export function NegativePromptLibraryControl({value,onApply,variant='icon'}:{value:string;onApply:(value:string)=>void;variant?:'icon'|'bar'}){
 const settings=useAppStore(s=>s.settings),text=negativeLibraryText(settings?.language),tagText=promptTagText(settings?.language);
 const presets=normalizeNegativePromptPresets(settings?.negativePromptPresets);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[tagFilter,setTagFilter]=useState(''),[selectedId,setSelectedId]=useState('');
 const [draft,setDraft]=useState<NegativePromptPreset|null>(null),[draftTags,setDraftTags]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const file=useRef<HTMLInputElement>(null);
 const filtered=presets.filter(p=>matchesPromptLibraryEntry(p,[p.name,p.prompt],query,tagFilter));
 const selected=filtered.find(p=>p.id===selectedId)??filtered[0];
 const tagSuggestions=collectPromptTags(presets).map(t=>t.tag);
 useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key!=='Escape'||e.defaultPrevented)return;e.preventDefault();e.stopPropagation();if(draft)setDraft(null);else if(!busy)setOpen(false);};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[open,draft,busy]);
 async function run(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setBusy(false);}}
 function create(current:boolean){setDraft({id:crypto.randomUUID(),name:'',prompt:current?value:'',createdAt:new Date().toISOString()});setDraftTags(tagFilter&&tagFilter!==UNTAGGED_PROMPT_FILTER?tagFilter:'');setError('');}
 function edit(preset:NegativePromptPreset){setDraft({...preset});setDraftTags(formatPromptTagInput(preset.tags));}
 async function save(){if(!draft||!draft.name.trim()||!draft.prompt.trim()||draft.name.length>100||draft.prompt.length>100000)return;const {tags:_previous,...rest}=draft,entry={...rest,name:draft.name.trim(),...promptTagField(draftTags)};await mutateNegativePresets(current=>{const index=current.findIndex(p=>p.id===entry.id);return index<0?mergeNegativeLibrary(current,[entry],()=>crypto.randomUUID()):current.map(p=>p.id===entry.id?entry:p);});setSelectedId(entry.id);setDraft(null);}
 async function remove(){if(!selected||!await confirmAction(text[19],text[6],undefined,undefined,{confirm:text[6],cancel:text[13]}))return;const id=selected.id;await mutateNegativePresets(current=>current.filter(p=>p.id!==id));setSelectedId('');}
 async function importFile(input:File){if(input.size>5000000)throw Error('Library file exceeds 5 MB');const imported=parseNegativeLibrary(await input.text());await mutateNegativePresets(current=>mergeNegativeLibrary(current,imported,()=>crypto.randomUUID()));}
 function exportFile(){const blob=new Blob([exportNegativeLibrary(presets)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='negative-prompt-library.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function apply(mode:'replace'|'append'){if(!selected)return;onApply(applyNegativePreset(value,selected.prompt,mode));setOpen(false);useAppStore.getState().setToast(text[18]);}
 return <>
  {variant==='bar'?<>
   <button type="button" className="prompt-tool-btn negative-library-trigger" title={text[0]} aria-haspopup="dialog" aria-expanded={open&&!draft} onClick={()=>{setOpen(true);setDraft(null);setError('');}}><Icon name="template"/><span>{text[0]}</span></button>
   <button type="button" className="prompt-tool-btn negative-library-save-current" title={text[3]} aria-haspopup="dialog" disabled={!value.trim()} onClick={()=>{setOpen(true);create(true);}}><Icon name="pin"/><span>{text[3]}</span></button>
  </>:<CompactIconButton label={text[0]} icon="template" className="negative-library-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);setDraft(null);setError('');}}/>}
  {open&&<AppPortal><div className="modal-backdrop negative-library-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
   <section className="negative-library-dialog" role="dialog" aria-modal="true" aria-label={text[0]}>
    <header><div><h2>{text[0]}</h2><p className="field-hint">{text[1]}</p></div><Button type="button" variant="ghost" aria-label={text[11]} disabled={busy} onClick={()=>setOpen(false)}><Icon name="close"/></Button></header>
    <div className="negative-library-tools">
     <label className="negative-library-search"><Icon name="search"/><input type="search" aria-label={text[2]} title={tagText.searchHint} placeholder={tagText.searchHint} value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <div><Button disabled={busy} onClick={()=>create(false)}><Icon name="plus"/>{text[4]}</Button><Button disabled={busy||!value.trim()} onClick={()=>create(true)}><Icon name="pin"/>{text[3]}</Button><Button disabled={busy} onClick={()=>file.current?.click()}>{text[7]}</Button><Button disabled={busy} onClick={exportFile}>{text[8]}</Button></div>
     <input ref={file} type="file" accept=".json,application/json" hidden onChange={e=>{const input=e.currentTarget.files?.[0];e.currentTarget.value='';if(input)void run(()=>importFile(input));}}/>
    </div>
    <PromptTagFilter className="negative-library-tags" items={presets} value={tagFilter} onChange={setTagFilter} language={settings?.language}/>
    {error&&<p className="negative-library-error" role="alert">{error}</p>}
    <div className="negative-library-body">
     <nav aria-label={text[0]}>{filtered.length===0?<p>{text[16]}</p>:filtered.map(p=><button type="button" key={p.id} className={p.id===selected?.id?'active':''} disabled={busy||Boolean(draft)} onClick={()=>{setSelectedId(p.id);setError('');}}><strong>{p.name}</strong><small>{p.prompt}</small><PromptTagList tags={p.tags}/></button>)}</nav>
     <article>{draft?<>
      <label>{text[14]}<input autoFocus maxLength={100} value={draft.name} disabled={busy} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <label className="negative-library-editor">{text[15]}<textarea value={draft.prompt} maxLength={100000} disabled={busy} onChange={e=>setDraft({...draft,prompt:e.target.value})}/></label>
      <PromptTagInput value={draftTags} onChange={setDraftTags} suggestions={tagSuggestions} language={settings?.language} disabled={busy}/>
      <footer><Button disabled={busy} onClick={()=>setDraft(null)}>{text[13]}</Button><Button variant="primary" disabled={busy||!draft.name.trim()||!draft.prompt.trim()} onClick={()=>void run(save)}>{text[12]}</Button></footer>
     </>:selected?<>
      <div className="negative-library-detail-title"><div className="negative-library-detail-heading"><h3>{selected.name}</h3><PromptTagList tags={selected.tags}/></div><div><Button disabled={busy} onClick={()=>edit(selected)}><Icon name="draw"/>{text[5]}</Button><Button variant="ghost" disabled={busy} onClick={()=>void run(remove)}><Icon name="trash"/>{text[6]}</Button></div></div>
      <label className="negative-library-editor">{text[15]}<textarea aria-label={text[15]} readOnly value={selected.prompt}/></label>
      <footer><Button disabled={busy} onClick={()=>apply('append')}>{text[10]}</Button><Button variant="primary" disabled={busy} onClick={()=>apply('replace')}>{text[9]}</Button></footer>
     </>:<p>{text[16]}</p>}</article>
    </div>
   </section>
  </div></AppPortal>}
 </>;
}

