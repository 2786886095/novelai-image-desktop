import {SelectMenuCompat} from './ui';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {ImageFavorite,ImageFavoriteLibrary} from '../favorites-types';
import {favoritesText} from '../favorites-text';
import {useAppStore} from '../store';
import {ImagePreviewDialog} from './ImagePreviewDialog';
import {FAVORITES_PAGE_SIZES,loadFavoritesView,saveFavoritesView,favoritePreviewItems,type FavoritesView} from '../favorites-view';

export function FavoritesNoticeSupport(){
 useEffect(()=>window.naiDesktop.onFavoritesChanged?.(({message})=>{useAppStore.getState().setToast(message);window.dispatchEvent(new Event('studio:favorites-changed'));}),[]);return null;
}
export function LocalFavorites(){
 const language=useAppStore(s=>s.settings?.language),text=favoritesText(language),toast=useAppStore(s=>s.setToast);
 const [data,setData]=useState<ImageFavoriteLibrary>({directory:'',items:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [date,setDate]=useState(''),[editing,setEditing]=useState(''),[name,setName]=useState(''),[selected,setSelected]=useState<ImageFavorite|null>(null),[page,setPage]=useState(1);
 const [view,setView]=useState(()=>loadFavoritesView());
 useEffect(()=>{const changed=(e:Event)=>{if((e as CustomEvent).detail==='favorites.view'){setView(loadFavoritesView());setPage(1);}};window.addEventListener('studio:collections-changed',changed);return()=>window.removeEventListener('studio:collections-changed',changed);},[]);
 const updateView=(next:FavoritesView)=>{try{setView(saveFavoritesView(next));setPage(1);}catch(e){setError(String(e));}};
 const previewTrigger=useRef<HTMLButtonElement|null>(null);
 const reload=useCallback(async()=>{try{setData(await window.naiDesktop.favoritesList());setError('');}catch(e){setError(String(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{void reload();const update=()=>void reload();window.addEventListener('studio:favorites-changed',update);return()=>window.removeEventListener('studio:favorites-changed',update);},[reload]);
 const dates=useMemo(()=>[...new Set(data.items.map(x=>x.prefix.slice(0,8)))].sort().reverse(),[data.items]);
 const filtered=data.items.filter(x=>!date||x.prefix.startsWith(date)),pages=Math.max(1,Math.ceil(filtered.length/view.pageSize)),current=Math.min(page,pages);
 const previewItems=favoritePreviewItems(filtered),previewIndex=previewItems.findIndex(x=>x.id===selected?.id);
 useEffect(()=>{if(selected&&previewIndex<0)setSelected(null);},[selected,previewIndex]);
 const act=async(fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await fn();await reload();window.dispatchEvent(new Event('studio:favorites-changed'));}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <section className="local-favorites" aria-label={text.local}>
  <div className="favorites-directory"><div><strong>{text.directory}</strong><p>{data.directory||text.loading}</p><small>{text.folderHelp}</small></div><div className="favorites-actions"><button className="btn" disabled={busy} onClick={()=>void act(()=>window.naiDesktop.favoritesChooseDirectory())}>{text.choose}</button><button className="btn" disabled={!data.directory} onClick={()=>void window.naiDesktop.openInExplorer(data.directory).catch(e=>toast(String(e)))}>{text.open}</button></div></div>
  <div className="favorites-filter"><label>{text.date}<SelectMenuCompat aria-label={text.date} value={date} onChange={e=>{setDate(e.target.value);setPage(1);}}><option value="">{text.all}</option>{dates.map(d=><option key={d} value={d}>{d.slice(0,4)}-{d.slice(4,6)}-{d.slice(6)}</option>)}</SelectMenuCompat></label><label>{text.pageSize}<SelectMenuCompat aria-label={text.pageSize} value={view.pageSize} onChange={e=>updateView({...view,pageSize:Number(e.target.value)})}>{FAVORITES_PAGE_SIZES.map(n=><option key={n} value={n}>{n}</option>)}</SelectMenuCompat></label><label>{text.layout}<SelectMenuCompat aria-label={text.layout} value={view.layout} onChange={e=>updateView({...view,layout:e.target.value as FavoritesView['layout']})}><option value="grid">{text.grid}</option><option value="masonry">{text.masonry}</option></SelectMenuCompat></label><span>{filtered.length} {text.count}</span></div>
  {error&&<p role="alert">{text.failed}: {error}</p>}{loading?<p>{text.loading}</p>:!filtered.length&&<p className="favorites-empty">{text.empty}</p>}
  <div className={`local-favorites-grid${view.layout==='masonry'?' is-masonry':''}`}>{filtered.slice((current-1)*view.pageSize,current*view.pageSize).map(item=><article key={item.id}>
   <button className="favorite-image" aria-label={text.show+' '+(item.name||item.prefix)} disabled={item.missing} onClick={e=>{previewTrigger.current=e.currentTarget;setSelected(item);}}>{item.missing?<span>{text.missing}</span>:<img loading="lazy" src={item.fileUrl} alt={item.name||item.prefix} onError={e=>{e.currentTarget.hidden=true;}}/>}</button>
   <div className="favorite-caption">{editing===item.id?<form onSubmit={e=>{e.preventDefault();void act(async()=>{await window.naiDesktop.favoritesRename(item.id,name);setEditing('');});}}><span className="favorite-prefix">{item.prefix}_</span><input autoFocus aria-label={text.name} maxLength={100} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setEditing('');}}}/><div className="favorites-actions"><button className="btn" disabled={busy}>{text.save}</button><button type="button" className="btn" disabled={busy} onClick={()=>setEditing('')}>{text.cancel}</button></div></form>:<><strong title={item.filePath}>{item.prefix}{item.name?'_'+item.name:''}{item.extension}</strong><div className="favorites-actions"><button className="btn" disabled={busy||item.missing} onClick={()=>{setEditing(item.id);setName(item.name);}}>{text.rename}</button><button className="btn" disabled={busy} onClick={()=>void act(()=>window.naiDesktop.favoritesRemove(item.id))}>{text.remove}</button></div></>}</div>
  </article>)}</div>
  {pages>1&&<div className="favorites-pagination"><button className="btn" aria-label="Previous" disabled={current<=1} onClick={()=>setPage(current-1)}>‹</button><span>{current} / {pages}</span><button className="btn" aria-label="Next" disabled={current>=pages} onClick={()=>setPage(current+1)}>›</button></div>}
  {selected&&previewIndex>=0&&<ImagePreviewDialog images={previewItems.map(x=>({src:x.fileUrl!,alt:x.name||x.prefix}))} index={previewIndex} onIndex={i=>setSelected(previewItems[i]??null)} onClose={()=>setSelected(null)}/>}

 </section>;
}
