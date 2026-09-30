import {useEffect,useSyncExternalStore} from 'react';
import {useAppStore} from '../store';
import {createComicProjectStore,type ComicProjectStore} from './project-store';
let shared:ComicProjectStore|undefined;
export function comicPersistenceMessage(language:unknown){return ({'zh-CN':'漫画项目未保存，原数据保留','zh-TW':'漫畫專案未儲存，原資料保留','ja-JP':'プロジェクトを保存できません。以前のデータは保持されています。','ko-KR':'프로젝트를 저장하지 못했습니다. 이전 데이터는 유지됩니다.'} as Record<string,string>)[String(language)]??'Project not saved; previous data retained';}
export function getComicProjectStore(){return shared??=createComicProjectStore({storage:localStorage,params:()=>useAppStore.getState().params});}
export function useComicProject(){
 const store=getComicProjectStore(),snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
 useEffect(()=>{const refresh=()=>store.refresh();window.addEventListener('storage',refresh);window.addEventListener('langbai:workspace-imported',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('langbai:workspace-imported',refresh);};},[store]);
 return {store,snapshot};
}
