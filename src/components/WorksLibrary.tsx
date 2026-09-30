import {SelectMenuCompat} from './ui';
import {workflowText} from '../workflow-text';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useAppStore} from '../store';
import type {HistoryGroup, HistoryItem} from '../types';
import {directoryKey, filterWorks, readWorksPrompt, selectWorksRange, WORKS_PAGE_SIZE, worksDirectory, worksName, type WorksPrompt} from '../works-library';
import {worksText} from '../works-text';
import {ImagePreviewDialog} from './ImagePreviewDialog';
import {ImageFavoriteButton} from './ImageFavoriteButton';
import '../works-library.css';

export function WorksLibrary({active = true}: {active?: boolean}) {
  const language = useAppStore(s=>s.settings?.language), t = worksText(language),workflow=workflowText(language);
  const [items,setItems] = useState<HistoryItem[]>([]), [groups,setGroups] = useState<HistoryGroup[]>([]);
  const [loading,setLoading] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [query,setQuery] = useState(''), [date,setDate] = useState(''), [group,setGroup] = useState(''), [directory,setDirectory] = useState('');
  const [order,setOrder] = useState<'newest'|'oldest'>('newest'), [page,setPage] = useState(0);
  const [focused,setFocused] = useState<string|null>(null), [selection,setSelection] = useState<Set<string>>(new Set());
  const anchor = useRef<string|null>(null), revision = useRef(0);
  const [prompt,setPrompt] = useState<WorksPrompt|null>(null), [promptError,setPromptError] = useState(''), [promptLoading,setPromptLoading] = useState(false), [retry,setRetry] = useState(0);
  const [imageFailed,setImageFailed] = useState(false),[previewOpen,setPreviewOpen]=useState(false);
  const refresh = useCallback(async()=>{
    const token = ++revision.current;
    setLoading(true); setError('');
    try {
      if (!window.naiDesktop?.getHistory) throw Error(t.unavailable);
      // Do not read the date-filtered workbench history: this page owns its complete snapshot.
      const [all,collections] = await Promise.all([window.naiDesktop.getHistory(),window.naiDesktop.getHistoryGroups()]);
      if (token !== revision.current) return;
      setItems(all); setGroups(collections);
      setSelection(old=>new Set([...old].filter(id=>all.some(item=>item.id===id))));
    } catch(e) { if (token===revision.current) setError(e instanceof Error ? e.message : t.error); }
    finally { if (token===revision.current) setLoading(false); }
  },[t]);
  useEffect(()=>{
    if (!active) return;
    void refresh();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const unsubscribe = useAppStore.subscribe((state,previous)=>{
      if (state.history===previous.history) return;
      clearTimeout(timer); timer=setTimeout(()=>void refresh(),200);
    });
    return ()=>{++revision.current;clearTimeout(timer);unsubscribe();};
  },[active,refresh]);
  const filtered = useMemo(()=>filterWorks(items,{query,date,group,directory,order}),[items,query,date,group,directory,order]);
  const pages = Math.max(1,Math.ceil(filtered.length/WORKS_PAGE_SIZE)), currentPage = Math.min(page,pages-1);
  const visible = filtered.slice(currentPage*WORKS_PAGE_SIZE,(currentPage+1)*WORKS_PAGE_SIZE);
  const selected = filtered.find(item=>item.id===focused);
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  const previewImages = useMemo(()=>filtered.map(item=>({src:item.fileUrl,alt:worksName(item.filePath)})),[filtered]);
  const folders = useMemo(()=>{
    const values = new Map<string,{path:string;count:number}>();
    for (const item of items) {
      const path = worksDirectory(item.filePath), key = directoryKey(path);
      const old = values.get(key); values.set(key,{path:old?.path ?? path,count:(old?.count ?? 0)+1});
    }
    return [...values.values()].sort((a,b)=>a.path.localeCompare(b.path));
  },[items]);
  const dates = useMemo(()=>[...new Set(items.map(item=>item.date))].sort().reverse(),[items]);
  useEffect(()=>{setPage(0);setSelection(new Set());anchor.current=null;},[query,date,group,directory,order]);
  useEffect(()=>{
    setPrompt(null);setPromptError('');setNotice('');setImageFailed(false);setPromptLoading(Boolean(active&&selected));
    if (!active || !selected) return;
    let cancelled = false;
    // Debounce rapid thumbnail navigation; never display a previous image's metadata.
    const timer = setTimeout(()=>{
      void readWorksPrompt(selected,path=>window.naiDesktop.readMetadataSnapshotFromPath(path)).then(value=>{
        if (!cancelled) setPrompt(value);
      }).catch(()=>{if(!cancelled)setPromptError(t.readError);}).finally(()=>{if(!cancelled)setPromptLoading(false);});
    },120);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[active,selected,retry,t]);
  function focus(item:HistoryItem) { setFocused(item.id); }
  function toggle(item:HistoryItem,range=false) {
    setSelection(old=>selectWorksRange(filtered.map(i=>i.id),old,anchor.current,item.id,range));
    if (!range) anchor.current=item.id;
    focus(item);
  }
  function goTo(index:number) {
    const item=filtered[index]; if(!item)return;
    setFocused(item.id);setPage(Math.floor(index/WORKS_PAGE_SIZE));
  }
  async function copy(value:string) {
    setNotice('');try{await navigator.clipboard.writeText(value);setNotice(t.copied);}catch{setNotice(t.error);}
  }
  async function openFolder(item:HistoryItem) {
    setNotice('');try{if(!(await window.naiDesktop.openInExplorer(item.filePath)).ok)throw Error();}catch{setNotice(t.error);}
  }
  function reset() {setQuery('');setDate('');setGroup('');setDirectory('');}
  return <section className="works-library" aria-label={t.title}>
    <header className="works-header"><div><h2>{t.title}</h2></div><div className="works-actions"><button onClick={()=>useAppStore.getState().setActiveTab('favorites')}>{t.favorites}</button><button onClick={()=>void refresh()} disabled={loading}>{loading?t.loading:t.refresh}</button></div></header>
    <div className="works-toolbar">
      <input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={e=>setQuery(e.target.value)}/>
      <SelectMenuCompat aria-label={t.dates} value={date} onChange={e=>setDate(e.target.value)}><option value="">{t.dates}</option>{dates.map(d=><option key={d}>{d}</option>)}</SelectMenuCompat>
      <SelectMenuCompat aria-label={t.newest} value={order} onChange={e=>setOrder(e.target.value as typeof order)}><option value="newest">{t.newest}</option><option value="oldest">{t.oldest}</option></SelectMenuCompat>
      <button onClick={reset}>{t.reset}</button><span className="works-count">{filtered.length} {t.count}</span>
    </div>
    {error&&<div className="works-error" role="alert">{error} <button onClick={()=>void refresh()}>{t.retry}</button></div>}
    <div className="works-layout">
      <nav className="works-sidebar" aria-label={t.groups}>
        <button aria-pressed={!group&&!directory} onClick={()=>{setGroup('');setDirectory('');}}>{t.all}<span>{items.length}</span></button>
        <h3>{t.groups}</h3>
        <button aria-pressed={group==='__ungrouped'} onClick={()=>{setGroup('__ungrouped');setDirectory('');}}>{t.ungrouped}<span>{items.filter(i=>!i.groupId).length}</span></button>
        {groups.map(g=><button key={g.id} aria-pressed={group===g.id} onClick={()=>{setGroup(g.id);setDirectory('');}} title={g.name}><span className="works-ellipsis">{g.name}</span><span>{items.filter(i=>i.groupId===g.id).length}</span></button>)}
        <h3>{t.folders}</h3>
        {folders.map(folder=><button key={directoryKey(folder.path)} aria-pressed={directoryKey(directory)===directoryKey(folder.path)} title={folder.path} onClick={()=>{setDirectory(folder.path);setGroup('');}}><span className="works-ellipsis">{worksName(folder.path)}</span><span>{folder.count}</span></button>)}
      </nav>
      <main className="works-results" aria-busy={loading}>
        <div className="works-selection"><span>{t.selected} {selection.size}</span><button disabled={!visible.length} onClick={()=>setSelection(new Set(visible.map(i=>i.id)))}>{t.selectPage}</button><button disabled={!filtered.length} onClick={()=>setSelection(new Set(filtered.map(i=>i.id)))}>{t.selectAll}</button><button disabled={!selection.size} onClick={()=>setSelection(new Set())}>{t.clear}</button></div>
        {!filtered.length?<div className="works-empty">{loading?t.loading:items.length?t.noMatch:t.empty}</div>:<div className="works-grid">
          {visible.map(item=><article key={item.id} className={`works-tile${focused===item.id?' is-focused':''}${selection.has(item.id)?' is-selected':''}`}>
            <ImageFavoriteButton src={item.fileUrl} compact/><button className="works-thumbnail" onDoubleClick={()=>{focus(item);setPreviewOpen(true);}} aria-label={worksName(item.filePath)} aria-pressed={focused===item.id} onClick={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey)toggle(item,e.shiftKey);else{focus(item);anchor.current=item.id;}}} onKeyDown={e=>{const delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(delta){e.preventDefault();goTo((selectedIndex>=0?selectedIndex:filtered.indexOf(item))+delta);}}}>
              <img src={item.fileUrl} alt="" loading="lazy" decoding="async" onError={e=>{e.currentTarget.style.visibility='hidden';e.currentTarget.parentElement?.classList.add('has-missing-image');}}/><span className="works-missing">{t.missing}</span>
            </button>
            <label className="works-tile-caption"><input type="checkbox" checked={selection.has(item.id)} aria-label={`${t.selected}: ${worksName(item.filePath)}`} onChange={()=>toggle(item)}/><span title={item.filePath}>{worksName(item.filePath)}</span></label>
            <small>{item.width} × {item.height} · {item.date}</small>
          </article>)}
        </div>}
        <footer className="works-pagination"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>{t.previous}</button><span>{t.page} {currentPage+1} / {pages}</span><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>{t.next}</button></footer>
      </main>
      <aside className="works-preview" aria-label={t.preview}>
        {!selected?<div className="works-empty">{t.choose}</div>:<>
          <h3 className="works-ellipsis" title={selected.filePath}>{worksName(selected.filePath)}</h3>
          <button className="works-preview-open" type="button" aria-label={workflow.preview} onClick={()=>setPreviewOpen(true)}>{imageFailed?<p role="status">{t.missing}</p>:<img key={selected.fileUrl} src={selected.fileUrl} alt={worksName(selected.filePath)} onError={()=>setImageFailed(true)}/>}</button>
          <div className="works-preview-actions"><button type="button" onClick={()=>setPreviewOpen(true)}>{workflow.preview}</button><ImageFavoriteButton src={selected.fileUrl}/></div>
          {previewOpen&&<ImagePreviewDialog images={previewImages} index={selectedIndex} onIndex={goTo} onClose={()=>setPreviewOpen(false)}/>}
          <div className="works-preview-meta"><span>{selected.width} × {selected.height}</span><span>{selected.model}</span><span>Seed {selected.actualSeed}</span></div>
          <button onClick={()=>void openFolder(selected)}>{t.open}</button>
          <div className="works-prompt" aria-busy={promptLoading}>
            <h3>{t.prompt}</h3>
            {promptLoading&&<p role="status">{t.loading}</p>}
            {promptError&&<p role="alert">{promptError} <button onClick={()=>setRetry(x=>x+1)}>{t.retry}</button></p>}
            {prompt&&<><p className="works-prompt-source">{prompt.source==='original'?t.original:t.record}</p>{prompt.warning&&<p>{prompt.warning}</p>}<textarea aria-label={t.prompt} readOnly value={prompt.positive}/><button disabled={!prompt.positive} onClick={()=>void copy(prompt.positive)}>{t.copy}</button><details><summary>{t.negative}</summary><textarea aria-label={t.negative} readOnly value={prompt.negative}/><button disabled={!prompt.negative} onClick={()=>void copy(prompt.negative)}>{t.copyNegative}</button></details></>}
          </div>
          <p className="works-notice" role="status">{notice}</p>
        </>}
      </aside>
    </div>
  </section>;
}
