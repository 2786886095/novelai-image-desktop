import {applyImageParameters} from '../apply-image-parameters';
import {errorText} from '../error-message';
import {SelectMenuCompat} from './ui';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {ImageFavorite,ImageFavoriteLibrary} from '../favorites-types';
import {favoritesText} from '../favorites-text';
import {useAppStore} from '../store';
import {ImagePreviewDialog} from './ImagePreviewDialog';
import {FAVORITES_PAGE_SIZES,loadFavoritesView,saveFavoritesView,normalizeFavoritesView,sortFavoriteItems,favoriteSortTimestamp,favoritePreviewItems,type FavoritesView} from '../favorites-view';

// Sparse row placement preserves sorted left-to-right reading order (never CSS columns/dense).
const FAVORITES_STREAM_BATCH=48;
function favoritesScrollRoot(node:HTMLElement|null):HTMLElement|null{
 const workspace=node?.closest<HTMLElement>('.favorites-workspace');if(workspace)return workspace;
 for(let parent=node?.parentElement;parent;parent=parent.parentElement){
  if(/auto|scroll|overlay/.test(window.getComputedStyle(parent).overflowY)&&parent.scrollHeight>parent.clientHeight+1)return parent;
 }
 return null;
}
function useFavoritesMasonry(ref:{current:HTMLDivElement|null},enabled:boolean,items:readonly ImageFavorite[]){
 useLayoutEffect(()=>{
  const grid=ref.current;if(!grid)return;
  if(!enabled){for(const card of Array.from(grid.children))if(card instanceof HTMLElement)card.style.removeProperty('grid-row-end');return;}
  let frame=0,disposed=false;
  const update=()=>{
   if(disposed||!grid.getClientRects().length)return;
   const style=window.getComputedStyle(grid),rowHeight=Number.parseFloat(style.gridAutoRows)||1,rowGap=Number.parseFloat(style.rowGap)||0,gap=Number.parseFloat(style.columnGap)||16;
   // Batch geometry reads before style writes; keep existing spans while appending.
   const placements=Array.from(grid.children).filter((card):card is HTMLElement=>card instanceof HTMLElement).map(card=>({card,value:`span ${Math.max(1,Math.ceil((card.getBoundingClientRect().height+gap+rowGap)/(rowHeight+rowGap)))}`}));
   for(const {card,value} of placements)if(card.style.gridRowEnd!==value)card.style.gridRowEnd=value;
  };
  const schedule=()=>{if(disposed||frame)return;frame=window.requestAnimationFrame(()=>{frame=0;update();});};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  observer?.observe(grid);for(const card of Array.from(grid.children))observer?.observe(card);
  grid.addEventListener('load',schedule,true);window.addEventListener('resize',schedule);update();
  return()=>{disposed=true;observer?.disconnect();window.cancelAnimationFrame(frame);grid.removeEventListener('load',schedule,true);window.removeEventListener('resize',schedule);};
 },[ref,enabled,items]);
}

export function FavoritesNoticeSupport(){
 useEffect(()=>window.naiDesktop.onFavoritesChanged?.(({message})=>{useAppStore.getState().setToast(message);window.dispatchEvent(new Event('studio:favorites-changed'));}),[]);
 useEffect(()=>window.naiDesktop.onImageCopyNotice?.(message=>useAppStore.getState().setToast(message)),[]);
 useEffect(()=>window.naiDesktop.onImageParametersRequested?.(filePath=>{void applyImageParameters(filePath);}),[]);return null;
}
export function LocalFavorites(){
 const language=useAppStore(s=>s.settings?.language),text=favoritesText(language),toast=useAppStore(s=>s.setToast);
 const [data,setData]=useState<ImageFavoriteLibrary>({directory:'',items:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [date,setDate]=useState(''),[editing,setEditing]=useState(''),[name,setName]=useState(''),[selected,setSelected]=useState<ImageFavorite|null>(null),[page,setPage]=useState(1);
 const [view,setView]=useState(()=>loadFavoritesView());
 const [visibleLimit,setVisibleLimit]=useState(FAVORITES_STREAM_BATCH);
 const gridRef=useRef<HTMLDivElement|null>(null),sentinelRef=useRef<HTMLDivElement|null>(null);
 const resetBrowse=()=>{setPage(1);setVisibleLimit(FAVORITES_STREAM_BATCH);const root=favoritesScrollRoot(gridRef.current);if(root)root.scrollTop=0;};
 const [viewPersistenceFailed,setViewPersistenceFailed]=useState(false);
 const sortByRef=useRef(view.sortBy);sortByRef.current=view.sortBy;
 const updateView=(next:FavoritesView)=>{const normalized=normalizeFavoritesView(next);sortByRef.current=normalized.sortBy;setView(normalized);resetBrowse();try{saveFavoritesView(normalized);setViewPersistenceFailed(false);}catch{setViewPersistenceFailed(true);}};
 const previewTrigger=useRef<HTMLButtonElement|null>(null);
 const reloadRevision=useRef(0);
 const reload=useCallback(async()=>{const revision=++reloadRevision.current,sortBy=sortByRef.current;setLoading(true);try{const next=await (sortBy==='generatedAt'?window.naiDesktop.favoritesList({resolveGeneratedAt:true}):window.naiDesktop.favoritesList());if(revision===reloadRevision.current&&sortBy===sortByRef.current){setData(next);setError('');}}catch(e){if(revision===reloadRevision.current&&sortBy===sortByRef.current)setError(errorText(e));}finally{if(revision===reloadRevision.current&&sortBy===sortByRef.current)setLoading(false);}},[]);
 useEffect(()=>{void reload();const update=()=>void reload();window.addEventListener('studio:favorites-changed',update);return()=>{++reloadRevision.current;window.removeEventListener('studio:favorites-changed',update);};},[reload,view.sortBy]);
 const dates=useMemo(()=>[...new Set(data.items.map(x=>x.prefix.slice(0,8)))].sort().reverse(),[data.items]);
 const filtered=useMemo(()=>sortFavoriteItems(data.items.filter(x=>!date||x.prefix.startsWith(date)),view),[data.items,date,view.sortBy,view.sortDirection]),pages=Math.max(1,Math.ceil(filtered.length/view.pageSize)),current=Math.min(page,pages);
 const visibleItems=useMemo(()=>view.layout==='masonry'?filtered.slice(0,visibleLimit):filtered.slice((current-1)*view.pageSize,current*view.pageSize),[filtered,view.layout,visibleLimit,current,view.pageSize]);
 useFavoritesMasonry(gridRef,view.layout==='masonry',visibleItems);
 useEffect(()=>{
  const sentinel=sentinelRef.current;if(view.layout!=='masonry'||!sentinel||visibleLimit>=filtered.length)return;
  const root=favoritesScrollRoot(sentinel);let disposed=false,frame=0;
  const more=()=>{if(!disposed)setVisibleLimit(limit=>Math.min(filtered.length,limit+FAVORITES_STREAM_BATCH));};
  if(typeof IntersectionObserver!=='undefined'){
   const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))more();},{root,rootMargin:'400px 0px',threshold:0});observer.observe(sentinel);
   return()=>{disposed=true;observer.disconnect();};
  }
  // Old renderers still advance on the existing ancestor scroller; no extra scroller/button.
  const check=()=>{if(!sentinel.getClientRects().length)return;const bounds=sentinel.getBoundingClientRect(),clip=root?.getBoundingClientRect();if(bounds.top<=(clip?.bottom??window.innerHeight)+400&&bounds.bottom>=(clip?.top??0))more();};
  const schedule=()=>{if(disposed||frame)return;frame=window.requestAnimationFrame(()=>{frame=0;check();});};
  window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);schedule();
  return()=>{disposed=true;window.cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
 },[view.layout,visibleLimit,filtered]);
 const unknownGeneratedCount=filtered.filter(item=>favoriteSortTimestamp(item.generatedAt)===null).length;
 const previewItems=favoritePreviewItems(filtered),previewIndex=previewItems.findIndex(x=>x.id===selected?.id);
 useEffect(()=>{if(selected&&previewIndex<0)setSelected(null);},[selected,previewIndex]);
 const act=async(fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await fn();await reload();window.dispatchEvent(new Event('studio:favorites-changed'));}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <section className="local-favorites" aria-label={text.local}>
  <div className="favorites-directory"><div><strong>{text.directory}</strong><p>{data.directory||text.loading}</p><small>{text.folderHelp}</small></div><div className="favorites-actions"><button className="btn" disabled={busy} onClick={()=>void act(()=>window.naiDesktop.favoritesChooseDirectory())}>{text.choose}</button><button className="btn" disabled={!data.directory} onClick={()=>void window.naiDesktop.openInExplorer(data.directory).catch(e=>toast(errorText(e)))}>{text.open}</button></div></div>
  <div className="favorites-filter"><label>{text.date}<SelectMenuCompat aria-label={text.date} value={date} onChange={e=>{setDate(e.target.value);resetBrowse();}}><option value="">{text.all}</option>{dates.map(d=><option key={d} value={d}>{d.slice(0,4)}-{d.slice(4,6)}-{d.slice(6)}</option>)}</SelectMenuCompat></label><label>{text.sortBy}<SelectMenuCompat aria-label={text.sortBy} value={view.sortBy} onChange={e=>updateView({...view,sortBy:e.target.value as FavoritesView['sortBy']})}><option value="savedAt">{text.savedAt}</option><option value="generatedAt">{text.generatedAt}</option></SelectMenuCompat></label><label>{text.sortDirection}<SelectMenuCompat aria-label={text.sortDirection} value={view.sortDirection} onChange={e=>updateView({...view,sortDirection:e.target.value as FavoritesView['sortDirection']})}><option value="desc">{text.newestFirst}</option><option value="asc">{text.oldestFirst}</option></SelectMenuCompat></label>{view.layout==='grid'&&<label>{text.pageSize}<SelectMenuCompat aria-label={text.pageSize} value={view.pageSize} onChange={e=>updateView({...view,pageSize:Number(e.target.value)})}>{FAVORITES_PAGE_SIZES.map(n=><option key={n} value={n}>{n}</option>)}</SelectMenuCompat></label>}<label>{text.layout}<SelectMenuCompat aria-label={text.layout} value={view.layout} onChange={e=>updateView({...view,layout:e.target.value as FavoritesView['layout']})}><option value="grid">{text.grid}</option><option value="masonry">{text.masonry}</option></SelectMenuCompat></label><span>{filtered.length} {text.count}</span></div>
  <p className="favorites-sort-hint">{text.sortHelp}</p>
  {view.layout==='masonry'&&<p className="favorites-sort-hint">{text.continuousHelp}</p>}
  {view.sortBy==='generatedAt'&&unknownGeneratedCount>0&&<p role="status">{text.unknownGeneratedHint.replace('{count}',String(unknownGeneratedCount))}</p>}
  {viewPersistenceFailed&&<p role="status">{text.viewSaveFailed}</p>}
  {error&&<p role="alert">{text.failed}: {error}</p>}{loading?<p>{text.loading}</p>:!filtered.length&&<p className="favorites-empty">{text.empty}</p>}
  <div ref={gridRef} className={`local-favorites-grid${view.layout==='masonry'?' is-masonry':''}`} data-layout={view.layout}>{visibleItems.map(item=><article key={item.id} style={view.layout==='grid'?{gridRowEnd:'auto'}:undefined}>
   <button className="favorite-image" aria-label={text.show+' '+(item.name||item.prefix)} disabled={item.missing} onClick={e=>{previewTrigger.current=e.currentTarget;setSelected(item);}}>{item.missing?<span>{text.missing}</span>:<img loading="lazy" decoding="async" width={Number.isFinite(item.width)&&item.width>0?item.width:undefined} height={Number.isFinite(item.height)&&item.height>0?item.height:undefined} src={item.fileUrl} alt={item.name||item.prefix} onError={e=>{e.currentTarget.hidden=true;}}/>}</button>
   <div className="favorite-caption">{editing===item.id?<form onSubmit={e=>{e.preventDefault();void act(async()=>{await window.naiDesktop.favoritesRename(item.id,name);setEditing('');});}}><span className="favorite-prefix">{item.prefix}_</span><input autoFocus aria-label={text.name} maxLength={100} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setEditing('');}}}/><div className="favorites-actions"><button className="btn" disabled={busy}>{text.save}</button><button type="button" className="btn" disabled={busy} onClick={()=>setEditing('')}>{text.cancel}</button></div></form>:<><strong title={item.filePath}>{item.prefix}{item.name?'_'+item.name:''}{item.extension}</strong>{view.sortBy==='generatedAt'&&favoriteSortTimestamp(item.generatedAt)===null&&<small>{text.unknownGenerated}</small>}<div className="favorites-actions"><button className="btn" disabled={busy||item.missing} onClick={()=>{setEditing(item.id);setName(item.name);}}>{text.rename}</button><button className="btn" disabled={busy||item.missing} onClick={()=>void act(()=>applyImageParameters(item.filePath))}>{text.apply}</button><button className="btn" disabled={busy} onClick={()=>void act(()=>window.naiDesktop.favoritesRemove(item.id))}>{text.remove}</button></div></>}</div>
  </article>)}</div>
  {view.layout==='grid'&&pages>1&&<div className="favorites-pagination"><button className="btn" aria-label="上一页" disabled={current<=1} onClick={()=>setPage(current-1)}>‹</button><span>{current} / {pages}</span><button className="btn" aria-label="下一页" disabled={current>=pages} onClick={()=>setPage(current+1)}>›</button></div>}
  {view.layout==='masonry'&&filtered.length>0&&<div ref={sentinelRef} className="favorites-stream-status" role="status" aria-live="polite">{(visibleItems.length<filtered.length?text.loadedCount:text.allLoaded).replace('{shown}',String(visibleItems.length)).replace('{total}',String(filtered.length))}</div>}
  {selected&&previewIndex>=0&&<ImagePreviewDialog images={previewItems.map(x=>({src:x.fileUrl!,alt:x.name||x.prefix}))} index={previewIndex} onIndex={i=>setSelected(previewItems[i]??null)} onClose={()=>setSelected(null)}/>}

 </section>;
}
