import {promptMetrics} from '../../shared/v5-prompt-options';
import {v5Text} from './v5-copy';
import {StoryboardReview} from './StoryboardReview';
import {parseV5Storyboard,type V5Storyboard} from './v5-storyboard';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '../components/ui';
import {Icon} from '../components/icons';
import {useAppStore} from '../store';
import {resolveTemplateSlot,type TemplateLibraryState} from '../../shared/template-library';
import {MAX_COMIC_INPUT_CHARS,MAX_COMIC_TOTAL_PAGES,parseComicPromptPages,type ComicPromptFormat,type ComicPromptRequest,type ComicPromptResult} from './comic-prompt';
import {comicComposerText} from './comic-composer-text';
import {JAPANESE_COMIC_DRAFT_KEY} from './comic-scope';
import './comic-prompt-composer.css';

export interface ComicPromptComposerProps {
 initialInput?:string; draftKey?:string; language?:unknown; disabled?:boolean;
 onUseResult?:(value:string)=>void;
 onImport?:(lines:string[],format:ComicPromptFormat)=>Promise<boolean|void>;
}
export interface ComicComposerDraft {
 storyboard?:V5Storyboard;boardStamp?:string;pageStamps?:string[];color?:'color'|'mono';
 schema:1;input:string;format:ComicPromptFormat;countMode:'recommend'|'manual';pages:string;
 result:string;notes:string;completedPages:number;reason:string;beats:string[];
 resultContext:string;templateRevision:string;recommendationContext:string;
}
export function emptyComicComposerDraft(input=''):ComicComposerDraft {return {schema:1,input,format:'jp-page',countMode:'recommend',pages:'4',result:'',notes:'',completedPages:0,reason:'',beats:[],resultContext:'',templateRevision:'',recommendationContext:''};}
export function readComicComposerDraft(storage:Pick<Storage,'getItem'>,key:string,input=''):{draft:ComicComposerDraft;corrupt:boolean} {
 try {
  const raw=storage.getItem(key);if(raw===null)return {draft:emptyComicComposerDraft(input),corrupt:false};
  const v=JSON.parse(raw);if(!v||v.schema!==1||typeof v.input!=='string'||!['jp-page','single-panel'].includes(v.format)||!['recommend','manual'].includes(v.countMode)||typeof v.pages!=='string'||typeof v.result!=='string'||typeof v.notes!=='string'||v.input.length>MAX_COMIC_INPUT_CHARS||v.result.length>1000000)throw Error('invalid draft');
  let board:V5Storyboard|undefined;if(v.storyboard)try{board=parseV5Storyboard(JSON.stringify(v.storyboard),Number(v.pages),v.format==='single-panel');}catch{/* Keep input and old prompts when a saved storyboard is invalid. */}
  return {draft:{...emptyComicComposerDraft(),storyboard:board,boardStamp:typeof v.boardStamp==='string'?v.boardStamp:'',pageStamps:Array.isArray(v.pageStamps)?v.pageStamps.filter((x:unknown)=>typeof x==='string'):[],color:v.color==='mono'?'mono':'color',input:v.input,format:v.format,countMode:v.countMode,pages:v.pages,result:v.result,notes:v.notes,completedPages:Number.isSafeInteger(v.completedPages)&&v.completedPages>=0&&v.completedPages<=MAX_COMIC_TOTAL_PAGES?v.completedPages:0,reason:typeof v.reason==='string'?v.reason:'',beats:Array.isArray(v.beats)?v.beats.filter((x:unknown)=>typeof x==='string'):[],resultContext:typeof v.resultContext==='string'?v.resultContext:'',templateRevision:typeof v.templateRevision==='string'?v.templateRevision:'',recommendationContext:typeof v.recommendationContext==='string'?v.recommendationContext:''},corrupt:false};
 } catch {return {draft:emptyComicComposerDraft(input),corrupt:true};}
}
export function comicComposerSettingsContext(settings:unknown){const s=(settings??{}) as Record<string,unknown>;return JSON.stringify([s.convertApiUrl??null,s.convertApiModel??null]);}
export function comicComposerContext(draft:ComicComposerDraft,templateRevision:string,settings:unknown){return JSON.stringify([draft.input,draft.format,draft.pages,templateRevision,comicComposerSettingsContext(settings)]);}
function boardContext(d:ComicComposerDraft,revision:string,settings:unknown){return JSON.stringify([comicComposerContext(d,revision,settings),d.color??'color']);}
function pagePayload(board:V5Storyboard,i:number){return JSON.stringify({characters:board.characters,pageNumber:i+1,page:board.pages[i]});}
function recommendationContext(draft:ComicComposerDraft,revision:string,settings:unknown){return JSON.stringify([draft.input,draft.format,revision,comicComposerSettingsContext(settings)]);}
export function comicComposerPageLines(value:string){return value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}

type ActiveRequest={id:string;stamp:string;output:string;credential:string;draft:ComicComposerDraft;request:ComicPromptRequest};
export function ComicPromptComposer({initialInput='',draftKey=JAPANESE_COMIC_DRAFT_KEY,language:languageProp,disabled=false,onUseResult,onImport}:ComicPromptComposerProps){
 const settings=useAppStore(s=>s.settings),language=languageProp??settings?.language,text=comicComposerText(language),id=useId();
 const [loaded]=useState(()=>readComicComposerDraft(typeof localStorage==='undefined'?{getItem:()=>null}:localStorage,draftKey,initialInput));
 const [draft,setDraft]=useState(loaded.draft),draftRef=useRef(draft);draftRef.current=draft;
 const [library,setLibrary]=useState<TemplateLibraryState|null>(null),libraryRef=useRef<TemplateLibraryState|null>(null);
 const [message,setMessage]=useState(''),[persistError,setPersistError]=useState(loaded.corrupt?text.storageCorrupt:'');
 const [busy,setBusy]=useState(false),[importing,setImporting]=useState(false),[unused,setUnused]=useState<ComicPromptResult|null>(null);
 const active=useRef<ActiveRequest|null>(null),mounted=useRef(true);
 const update=(patch:Partial<ComicComposerDraft>)=>{const next={...draftRef.current,...patch};draftRef.current=next;setDraft(next);};
 function selected(state:TemplateLibraryState,format:ComicPromptFormat=draftRef.current.format){return resolveTemplateSlot(`comic.${format}`,state);}
 async function loadLibrary(){const next=await window.naiDesktop.templateLibraryGet();if(mounted.current){libraryRef.current=next;setLibrary(next);}return next;}
 useEffect(()=>{mounted.current=true;const refresh=()=>{void loadLibrary().catch(()=>{if(mounted.current)setMessage(text.libraryError);});};refresh();window.addEventListener('langbai:template-library-changed',refresh);return()=>{mounted.current=false;window.removeEventListener('langbai:template-library-changed',refresh);const request=active.current;active.current=null;if(request)void window.naiDesktop.cancelComicPrompt(request.id).catch(()=>{});};},[]);
 useEffect(()=>{if(loaded.corrupt)return;try{localStorage.setItem(draftKey,JSON.stringify(draft));setPersistError('');}catch{setPersistError(text.storageError);}},[draft,draftKey,loaded.corrupt,text.storageError]);
 let meta:ReturnType<typeof resolveTemplateSlot>|undefined;try{if(library)meta=selected(library,draft.format);}catch{/* A broken library cannot authenticate a template selection. */}
 const total=Number(draft.pages),validPages=Number.isSafeInteger(total)&&total>=1&&total<=MAX_COMIC_TOTAL_PAGES;
 const actualLines=comicComposerPageLines(draft.result),currentContext=meta?comicComposerContext(draft,meta.revision,settings):'';
 const contextMatches=Boolean(draft.resultContext)&&currentContext===draft.resultContext;
 const needsRecommendation=draft.countMode==='recommend'&&(!meta||draft.recommendationContext!==recommendationContext(draft,meta.revision,settings));
 const parsed=validPages?parseComicPromptPages(draft.result,total):undefined;
 const boardCurrent=!!(meta&&draft.storyboard&&draft.boardStamp===boardContext(draft,meta.revision,settings));
 const pagesApproved=!draft.storyboard||(boardCurrent&&draft.storyboard.pages.every((_,i)=>draft.pageStamps?.[i]===pagePayload(draft.storyboard!,i)));
 const canApply=pagesApproved&&contextMatches&&parsed?.countStatus==='exact'&&actualLines.length===total&&!busy&&!disabled&&!library?.readOnly;
 const canNext=contextMatches&&draft.completedPages>0&&draft.completedPages<total&&actualLines.length===draft.completedPages;
 async function request(action:ComicPromptRequest['action'],nextBatch=false,replacePage?:number,balloon?:[number,number,number]){
  if(disabled||active.current)return;
  const source={...draftRef.current};if(!source.input.trim()){setMessage(text.missingInput);return;}
  const pageCount=Number(source.pages);if(!Number.isInteger(pageCount)||pageCount<1||pageCount>MAX_COMIC_TOTAL_PAGES){setMessage(text.invalidPages);return;}
  const requestId=globalThis.crypto?.randomUUID?.()??`comic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record:ActiveRequest={id:requestId,stamp:'',output:source.result,credential:String(useAppStore.getState().settings?.convertApiKey??''),draft:source,request:{requestId,action,format:source.format,input:source.input}};
  active.current=record;setBusy(true);setMessage(text.working);setUnused(null);
  let received:ComicPromptResult|undefined;
  try{
   const before=await loadLibrary();if(active.current!==record)return;if(before.readOnly)throw Error(text.libraryError);const template=selected(before,source.format);
   if(action==='generate'&&source.countMode==='recommend'&&source.recommendationContext!==recommendationContext(source,template.revision,useAppStore.getState().settings)){setMessage(text.recommendHint);return;}
   record.stamp=comicComposerContext(source,template.revision,useAppStore.getState().settings);
   const board=source.storyboard,stamp=boardContext(source,template.revision,useAppStore.getState().settings);
   if(action==='shorten'&&(!board||!balloon||source.boardStamp!==stamp))throw Error(text.stale);
   if(action==='generate'&&(!board||source.boardStamp!==stamp)){throw Error('剧本或设置已改变，请重新生成和审阅分镜');}
   if(action==='generate')parseV5Storyboard(JSON.stringify(board),pageCount,source.format==='single-panel');
   const first=replacePage!==undefined?replacePage+1:nextBatch?source.completedPages+1:1;
   const last=action==='generate'&&replacePage===undefined?pageCount:first;
   const output=(nextBatch||replacePage!==undefined)?comicComposerPageLines(source.result):[];
   const stamps=(nextBatch||replacePage!==undefined)?[...(source.pageStamps??[])]:[];
   for(let batchFrom=first;batchFrom<=last;batchFrom++){
   if(active.current!==record||!mounted.current)return;
   const pages=1;record.id=requestId+'-'+batchFrom;
   record.request={...record.request,requestId:record.id,input:action==='shorten'?board!.pages[balloon![0]].panels[balloon![1]].dialogue[balloon![2]]:source.input,color:source.color??'color',totalPages:pageCount,templateRevision:template.revision,...(action==='generate'?{pages,batchFrom,approvedPage:pagePayload(board!,batchFrom-1)}:{})};
   if(action==='generate')setMessage('正在编译第 '+batchFrom+' / '+pageCount+' 页');
   const result=await window.naiDesktop.comicPrompt(record.request);received=result;if(active.current!==record||!mounted.current)return;
   const after=await loadLibrary();if(active.current!==record||!mounted.current)return;
   const currentTemplate=selected(after,source.format),now=draftRef.current;
   const stale=now.storyboard!==source.storyboard||now.color!==source.color||after.readOnly||now.countMode!==source.countMode||record.stamp!==comicComposerContext(now,currentTemplate.revision,useAppStore.getState().settings)||now.result!==record.output||record.credential!==String(useAppStore.getState().settings?.convertApiKey??'');
   if(stale){setUnused(result);setMessage(text.stale);return;}
   if(!result.ok){setUnused(result);setMessage(result.message||text.failed);return;}
   if(action==='recommend'){
    if(typeof result.pages!=='number'||!Number.isInteger(result.pages)||result.pages<1||result.pages>MAX_COMIC_TOTAL_PAGES||!result.reason){setUnused(result);setMessage(text.failed);return;}
    update({pages:String(result.pages),reason:result.reason,beats:result.beats??[],recommendationContext:recommendationContext(source,currentTemplate.revision,useAppStore.getState().settings)});setMessage(text.reason+': '+result.pages+' '+text.pageUnit);return;
   }
   if(action==='shorten'&&result.shortened&&balloon&&board){const next=structuredClone(board);next.pages[balloon[0]].panels[balloon[1]].dialogue[balloon[2]]=result.shortened;update({storyboard:next});setMessage(result.message);return;}
   if(action==='storyboard'){
    if(!result.storyboard)throw Error('未收到有效分镜；未提交生图。');
    update({storyboard:result.storyboard,boardStamp:stamp,pageStamps:[]});setMessage('请核对台词与分镜，再编译提示词。');return;
   }
   if(result.countStatus!=='exact'||!result.lines||result.lines.length!==pages){setUnused(result);setMessage(result.message||text.failed);return;}
   output[batchFrom-1]=result.lines[0];stamps[batchFrom-1]=pagePayload(board!,batchFrom-1);
   const joined=output.join('\n');record.output=joined;
   update({result:joined,notes:'',completedPages:output.length,templateRevision:currentTemplate.revision,resultContext:record.stamp,pageStamps:[...stamps]});
   }
   setMessage(text.batchComplete);
  }catch(error){if(active.current===record&&mounted.current){if(received)setUnused(received);setMessage((error instanceof Error?error.message:String(error))||text.failed);}}
  finally{if(active.current===record){active.current=null;if(mounted.current)setBusy(false);}}
 }
 function cancel(){const request=active.current;if(!request)return;active.current=null;setBusy(false);setMessage(text.cancelHint);void window.naiDesktop.cancelComicPrompt(request.id).catch(()=>{});}
 async function importResult(){if(!canApply||!onImport||importing)return;setImporting(true);try{const accepted=await onImport(parsed!.lines,draft.format);if(accepted!==false)setMessage(text.imported);}catch(error){setMessage(error instanceof Error?error.message:String(error));}finally{setImporting(false);}}
 const resultNotice=!draft.result?'':!contextMatches?text.changed:canApply?text.ready:canNext?'':text.countMismatch;
 return <section className="comic-prompt-composer" aria-labelledby={id+'-heading'}>
  <header className="comic-composer-header"><div><h3 id={id+'-heading'}><Icon name="sparkles"/>{text.title}</h3><p>{text.subtitle}</p></div><span className="comic-composer-text-only">TEXT → PAGES</span></header>
  <div className="comic-composer-form">
   <fieldset className="comic-composer-fieldset"><legend>{text.format}</legend><div className="comic-composer-segments" role="group" aria-label={text.format}>{(['jp-page','single-panel'] as const).map(format=><button key={format} type="button" aria-pressed={draft.format===format} disabled={disabled} onClick={()=>update({format})}>{format==='jp-page'?text.jp:text.single}</button>)}</div><small>{text.formatHint}</small></fieldset>
   {meta&&library&&<label>{text.template}<select aria-label={text.template} disabled={disabled||busy||library.readOnly} value={meta.ref.id} onChange={async e=>{const id=e.target.value,slot=meta.slot;setBusy(true);try{const kind=library.custom.some(t=>t.id===id&&t.slot===slot)?'custom':'builtin';const r=await window.naiDesktop.templateLibraryMutate({action:'select',slot,ref:{kind,id},expectedRevision:library.revision});if(!r.ok)throw Error(r.message);await loadLibrary();window.dispatchEvent(new Event('langbai:template-library-changed'));}catch(error){setMessage(String(error));}finally{setBusy(false);}}}>{[...library.builtins,...library.custom].filter(t=>t.slot===meta.slot).map(t=><option key={t.id} value={t.id}>{t.id===t.slot?t.name+' · '+('sourceVersion' in t?t.sourceVersion:''):t.name}</option>)}</select></label>}
   <div className="comic-composer-template"><span>{text.template}: <b>{meta?.name??text.emptyLibrary}</b>{meta?.sourceVersion&&<small> · {meta.sourceVersion}</small>}</span><Button variant="ghost" disabled={busy} onClick={()=>void loadLibrary().catch(()=>setMessage(text.libraryError))}><Icon name="refresh"/>{text.refreshTemplate}</Button><small>{text.templateHint}</small>{library?.readOnly&&<p className="comic-composer-warning" role="alert">{text.libraryError} {library.warnings.join(" ")}</p>}</div>
   <label className="comic-composer-content" htmlFor={id+'-input'}><span>{text.input}</span><textarea id={id+'-input'} maxLength={MAX_COMIC_INPUT_CHARS} value={draft.input} disabled={disabled} onChange={e=>update({input:e.target.value})}/><small>{text.inputHint} <span>{draft.input.length.toLocaleString()} / 20,000</span></small></label>
   <div className="comic-composer-count-row"><fieldset className="comic-composer-fieldset"><legend>{text.countMode}</legend><div className="comic-composer-segments" role="group" aria-label={text.countMode}>{(['recommend','manual'] as const).map(mode=><button type="button" key={mode} aria-pressed={draft.countMode===mode} disabled={disabled} onClick={()=>update({countMode:mode})}>{mode==='recommend'?text.recommended:text.manual}</button>)}</div></fieldset><label htmlFor={id+'-pages'}><span>{text.pages}</span><input id={id+'-pages'} type="number" min={1} max={MAX_COMIC_TOTAL_PAGES} step={1} inputMode="numeric" value={draft.pages} disabled={disabled} onChange={e=>update({pages:e.target.value})}/><small>{text.range}</small></label></div>
   {draft.countMode==='recommend'&&<div className="comic-composer-recommend"><Button disabled={busy||disabled||Boolean(library?.readOnly)||!draft.input.trim()} onClick={()=>void request('recommend')}><Icon name="sparkles"/>{text.recommend}</Button><small>{text.recommendHint}</small>{draft.reason&&<p><b>{text.reason}: </b>{draft.reason}</p>}</div>}
   {draft.beats.length>0&&<details className="comic-composer-notes"><summary>{text.reason} · {draft.beats.length} {text.pageUnit}</summary><ol>{draft.beats.map((beat,index)=><li key={index}>{beat}</li>)}</ol></details>}
   <label>{v5Text(language,'style')}<select disabled={disabled||busy} value={draft.color??'color'} onChange={e=>update({color:e.target.value==='mono'?'mono':'color'})}><option value="color">{v5Text(language,'color')}</option><option value="mono">{v5Text(language,'mono')}</option></select></label>
   <div className="comic-composer-actions"><Button disabled={busy||disabled||!meta||Boolean(library?.readOnly)||!draft.input.trim()||!validPages||needsRecommendation} onClick={()=>void request('storyboard')}>{v5Text(language,'stage1')}</Button>{busy&&<Button onClick={cancel}>{text.cancel}</Button>}</div>
   {draft.storyboard&&<><StoryboardReview shorten={(i,j,k)=>void request('shorten',false,undefined,[i,j,k])} language={language} board={draft.storyboard} disabled={busy||disabled||!boardCurrent} set={storyboard=>update({storyboard})} compiled={contextMatches?draft.completedPages:0} rerun={i=>void request('generate',false,i)}/>{!boardCurrent&&<p>{v5Text(language,'stale')}</p>}<div className="comic-composer-actions"><Button variant="primary" disabled={busy||disabled||!boardCurrent||Boolean(library?.readOnly)||needsRecommendation} onClick={()=>void request('generate')}>{v5Text(language,'stage2')}</Button>{canNext&&boardCurrent&&<Button disabled={busy||disabled} onClick={()=>void request('generate',true)}>{v5Text(language,'resume')} · {draft.completedPages+1}</Button>}</div></>}

  </div>
  {(message||persistError)&&<div className="comic-composer-status" role="status" aria-live="polite" aria-busy={busy}>{persistError&&<p className="comic-composer-warning">{persistError}</p>}{message&&<p>{message}</p>}</div>}
  {draft.result&&<div className="comic-composer-output"><div className="comic-composer-result-heading"><label htmlFor={id+'-result'}>{text.result}</label><span>{text.progress} {actualLines.length} / {validPages?total:'–'} {text.pageUnit}</span></div><textarea id={id+'-result'} value={draft.result} spellCheck={false} onChange={e=>update({result:e.target.value})}/><small>{text.resultHint}</small><details><summary>V5 · {text.pages}</summary>{actualLines.map((line,i)=>{const m=promptMetrics(line);return <div key={i}>{v5Text(language,'page')} {i+1} · Base: {m.counts[0]} · {m.counts.slice(1).map((n,j)=>'#'+(j+1)+': '+n+' / 25–30 '+(n>=25&&n<=30?'✓':'!')).join(' · ')} · Text: {m.textChars} / 750</div>})}</details>{resultNotice&&<p className={canApply?'comic-composer-ready':'comic-composer-warning'}>{resultNotice}</p>}{draft.notes&&<details className="comic-composer-notes"><summary>{text.notes}</summary><pre>{draft.notes}</pre></details>}<div className="comic-composer-actions"><Button disabled={!draft.result.trim()} onClick={()=>void navigator.clipboard.writeText(draft.result).then(()=>setMessage(text.copyDone)).catch(()=>{})}><Icon name="copy"/>{text.copyDraft}</Button>{onImport&&<Button variant="primary" disabled={!canApply||importing} onClick={()=>void importResult()}><Icon name="check"/>{text.import}</Button>}{onUseResult&&<Button disabled={!canApply||importing} onClick={()=>onUseResult(parsed!.lines.join('\n'))}>{text.use}</Button>}</div></div>}
  {unused&&<details className="comic-composer-unused"><summary>{text.staleView}</summary><p>{unused.message}</p><pre>{unused.raw??unused.lines?.join('\n')??JSON.stringify({pages:unused.pages,reason:unused.reason},null,2)}</pre><Button onClick={()=>void navigator.clipboard.writeText(unused.raw??unused.lines?.join('\n')??unused.reason??'').then(()=>setMessage(text.copyDone)).catch(()=>{})}>{text.copy}</Button></details>}
 </section>;
}
