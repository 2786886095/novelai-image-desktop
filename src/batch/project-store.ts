import type {BatchRedrawProject} from '../types';
export function createBatchProjectStore(deps:{get:()=>{project:BatchRedrawProject;busy:boolean};update:(p:BatchRedrawProject)=>void;busy:(value:boolean)=>void}){
 const nonce=crypto.randomUUID();let revision=0,previous:BatchRedrawProject|undefined;
 function read(){const state=deps.get();if(previous!==state.project){revision++;previous=state.project;}return {...state,revision:`${nonce}:${revision}`};}
 return {read,setBusy:deps.busy,update(fn:(p:BatchRedrawProject)=>BatchRedrawProject,expectedRevision?:string){
  const state=read();if(expectedRevision!==undefined&&(state.busy||state.revision!==expectedRevision))throw Error('批量重绘工程已变化或正在运行，请重新读取');
  const next=fn(structuredClone(state.project));deps.update(next);return read();
 }};
}
export type BatchProjectStore=ReturnType<typeof createBatchProjectStore>;
