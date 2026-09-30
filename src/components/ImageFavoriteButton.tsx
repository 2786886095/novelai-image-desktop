import {Icon} from './icons';
import {useEffect,useRef,useState} from 'react';
import {useAppStore} from '../store';
import type {ImageFavorite} from '../favorites-types';

// Share in-flight reads between the thumbnail, canvas and lightbox for the same source.
const reads=new Map<string,Promise<ImageFavorite|null>>(),listeners=new Set<()=>void>(),mutations=new Set<string>();
function status(src:string){
 let request=reads.get(src);
 if(!request){request=window.naiDesktop.favoritesStatus(src);reads.set(src,request);void request.catch(()=>{if(reads.get(src)===request)reads.delete(src);});}
 return request;
}
function invalidate(){reads.clear();listeners.forEach(refresh=>refresh());}
let disconnect:(()=>void)|undefined;
function subscribe(refresh:()=>void){
 if(!listeners.size){window.addEventListener('studio:favorites-changed',invalidate);disconnect=window.naiDesktop.onFavoritesChanged?.(invalidate);}
 listeners.add(refresh);
 return()=>{listeners.delete(refresh);if(!listeners.size){window.removeEventListener('studio:favorites-changed',invalidate);disconnect?.();disconnect=undefined;reads.clear();}};
}

/** Toggling a bookmark never removes the original or archived image bytes. */
export function ImageFavoriteButton({src,compact=false}:{src:string;compact?:boolean}) {
 const [item,setItem]=useState<ImageFavorite|null>(null),[busy,setBusy]=useState(false),[checking,setChecking]=useState(true),[error,setError]=useState('');
 const revision=useRef(0),pending=useRef(false);
 const language=useAppStore(s=>s.settings?.language),zh=String(language??'zh-CN').startsWith('zh');
 useEffect(()=>{
  const token=++revision.current;let read=0;setItem(null);setBusy(false);pending.current=false;setError('');
  const refresh=()=>{const current=++read;setChecking(true);void status(src).then(result=>{if(token===revision.current&&current===read)setItem(result);}).catch(e=>{if(token===revision.current&&current===read)setError(String(e));}).finally(()=>{if(token===revision.current&&current===read)setChecking(false);});};
  const unsubscribe=subscribe(refresh);refresh();return()=>{revision.current++;unsubscribe();};
 },[src]);
 const saved=!!item,label=busy?(zh?'处理中…':'Updating…'):saved?(zh?'取消收藏':'Remove from favorites'):(zh?'收藏图片':'Save to favorites');
 async function toggle(){
  if(pending.current||mutations.has(src)||checking)return;
  pending.current=true;mutations.add(src);setBusy(true);setError('');const token=revision.current;
  try{
   // Recheck at click time so another view's last mutation cannot turn removal into addition.
   const current=await window.naiDesktop.favoritesStatus(src);
   const next=current?(await window.naiDesktop.favoritesRemove(current.id),null):(await window.naiDesktop.favoritesAdd(src)).item;
   if(token===revision.current)setItem(next);
   window.dispatchEvent(new Event('studio:favorites-changed'));
  }catch(e){const message=e instanceof Error?e.message:String(e);if(token===revision.current)setError(message);useAppStore.getState().setToast(message);window.dispatchEvent(new Event('studio:favorites-changed'));}
  finally{mutations.delete(src);if(token===revision.current){pending.current=false;setBusy(false);}}
 }
 return <button type="button" className={`image-favorite-action${compact?' is-compact':''}`} aria-label={label} title={error||label} aria-pressed={saved} disabled={!src||checking||busy} aria-busy={busy||checking} onClick={e=>{e.stopPropagation();void toggle();}}><Icon name={saved?'check':'star'}/>{!compact&&label}</button>;
}
