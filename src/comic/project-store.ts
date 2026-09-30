import type {GenerateParams,TagComicProject} from '../types';
import {createTagComicProject,normalizeTagComicProject,TAG_COMIC_STORAGE_KEY} from './tag-comic';
export const COMIC_BACKUP_KEY=TAG_COMIC_STORAGE_KEY+'.before-agent-change';
export type ComicSnapshot={project:TagComicProject;revision:string;busy:boolean;error:string|null};
export function createComicProjectStore(deps:{storage:Pick<Storage,'getItem'|'setItem'>;params:()=>GenerateParams}){
 const listeners=new Set<()=>void>(),nonce=crypto.randomUUID();let sequence=0,lastRaw:string|null|undefined,blocked=false;
 let state:ComicSnapshot={project:createTagComicProject(deps.params()),revision:`${nonce}:${sequence}`,busy:false,error:null};
 function publish(patch:Partial<ComicSnapshot>){state={...state,...patch,revision:`${nonce}:${++sequence}`};for(const fn of listeners)fn();}
 function refresh(){
  try{
   const raw=deps.storage.getItem(TAG_COMIC_STORAGE_KEY);if(raw===lastRaw&&!blocked)return;
   const project=raw===null?state.project:normalizeTagComicProject(JSON.parse(raw),deps.params(),{trustOutputs:true});
   if(raw===null&&lastRaw!==undefined&&lastRaw!==null){publish({project:createTagComicProject(deps.params()),error:null});}
   else if(raw!==lastRaw||blocked)publish({project,error:null});
   lastRaw=raw;blocked=false;
  }catch(e){blocked=true;const error=e instanceof Error?e.message:String(e);if(state.error!==error)publish({error});}
 }
 refresh();
 function read(){refresh();if(blocked)throw Error('漫画项目读取失败，原始资料保留：'+state.error);return state;}
 function update(updater:(p:TagComicProject)=>TagComicProject,options:{expectedRevision?:string;backup?:boolean}={}){
  read();if(options.expectedRevision!==undefined){if(state.busy)throw Error('漫画任务进行中，请先停止并等待读回');if(options.expectedRevision!==state.revision)throw Error('漫画项目已变化，请重新读取');}
  try{
   const next=updater(structuredClone(state.project)),raw=JSON.stringify(next);
   if(options.backup)deps.storage.setItem(COMIC_BACKUP_KEY,JSON.stringify(state.project));
   deps.storage.setItem(TAG_COMIC_STORAGE_KEY,raw);
   lastRaw=raw;publish({project:next,error:null});return next;
  }catch(e){publish({error:e instanceof Error?e.message:String(e)});throw e;}
 }
 return {read,refresh,update,getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},setBusy:(busy:boolean)=>{if(state.busy!==busy)publish({busy});}};
}
export type ComicProjectStore=ReturnType<typeof createComicProjectStore>;
