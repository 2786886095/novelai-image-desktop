import {useEffect,useSyncExternalStore} from 'react';
import {useAppStore} from '../store';
import {createComicProjectStore,type ComicProjectStore} from './project-store';
let shared:ComicProjectStore|undefined;
export function comicPersistenceMessage(_language:unknown){return '漫画项目未保存，原数据保留';}
export function getComicProjectStore(){return shared??=createComicProjectStore({storage:localStorage,params:()=>useAppStore.getState().params});}
export function useComicProject(){
 const store=getComicProjectStore(),snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
 useEffect(()=>{const refresh=()=>store.refresh();window.addEventListener('storage',refresh);window.addEventListener('langbai:workspace-imported',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('langbai:workspace-imported',refresh);};},[store]);
 return {store,snapshot};
}
