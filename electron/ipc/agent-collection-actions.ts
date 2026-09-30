import {dialog,shell,type BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import {collectionActionCatalog,collectionGroup,validateCollectionAction} from '../../src/agent/collection-contract';
import {projectStudioData} from '../../src/studio-agent-contract';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
export interface CollectionAdapter {
 read(group:string):Promise<Record<string,unknown>>;
 apply(args:Record<string,unknown>,signal?:AbortSignal):Promise<unknown>;
}
export function createCollectionActions(adapter:CollectionAdapter,approve:(r:AgentToolBridgeRequest)=>Promise<boolean>){
 let tail:Promise<unknown>=Promise.resolve();
 async function execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
  try{
   const args=request.args,spec=validateCollectionAction(args),group=collectionGroup(spec.action);request.signal?.throwIfAborted();
   const before=await adapter.read(group);let result:unknown;
   if(spec.effect!=='read'){
    if(before.revision!==args.expectedRevision)throw Error('收藏或导航已变化，请重新读取');
    if(spec.effect==='confirm'&&!await approve({...request,args:{...args,title:spec.title,filesRetained:true}}))throw Error('Agent 内已取消，资料未修改');
    request.signal?.throwIfAborted();
    // Both renderer and filesystem adapters compare the revision again inside
    // their actual transaction; UI edits are not locked out during approval.
    result=await adapter.apply(args,request.signal);
   }
   const after=await adapter.read(group),rows=after.items as Record<string,unknown>[]|undefined;
   const offset=Number(args.offset??0),limit=Number(args.limit??20);
   const {items:_,...state}=after;
   const cancelled=!!result&&typeof result==='object'&&'cancelled' in result&&result.cancelled===true;
   const data={...state,action:spec.action,executed:spec.effect!=='read'&&!cancelled,...(rows?{readback:projectStudioData(rows.slice(offset,offset+limit).map(x=>group==='favorites.online'?{...x,key:`${x.source}:${x.id}`} :x)),total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null}:{}),...(result!==undefined?{result:projectStudioData(result)}:{})};
   return {ok:true,title:spec.title,output:JSON.stringify(data),data};
  }catch(e){return {ok:false,title:'收藏或导航操作未完成',output:e instanceof Error?e.message:String(e)};}
 }
 return {catalog:collectionActionCatalog,handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&Object.hasOwn(collectionActionCatalog,String(r.args.action)),execute:(r:AgentToolBridgeRequest)=>{
  if(collectionActionCatalog[String(r.args.action)]?.effect==='read')return execute(r);
  const task=tail.then(()=>execute(r));tail=task.catch(()=>{});return task;
 }};
}
export function desktopCollectionAdapter(renderer:(args:Record<string,unknown>)=>Promise<Record<string,unknown>>,window:()=>BrowserWindow|null):CollectionAdapter{
 const service=async()=>(await import('./image-favorites-ipc.js')).imageFavoritesService();
 return {
  read:async(group)=>group==='favorites.local'?(await service()).list():renderer({operation:'read',group}),
  apply:async(args,signal)=>{
   const action=String(args.action);if(collectionGroup(action)!=='favorites.local')return renderer({operation:'apply',...args});
   const api=await service();signal?.throwIfAborted();const rev=String(args.expectedRevision),id=String(args.id??'');let result:unknown;
   if(action==='favorites.local.add'){
    const source=(await import('./store.js')).getHistoryReferenceItems().find(x=>x.id===id);if(!source)throw Error('历史图片ID不存在，请读取真实历史');
    signal?.throwIfAborted();result=await api.add(source.filePath,rev);
   }else if(action==='favorites.local.rename')result=await api.rename(id,String(args.name),rev);
   else if(action==='favorites.local.remove')result=await api.remove(id,rev);
   else {
    const state=await api.list();if(state.revision!==rev)throw Error('收藏已变化，请重新读取');
    if(action==='favorites.local.chooseDirectory'){
     const options={title:'选择收藏目录',defaultPath:state.directory,properties:['openDirectory','createDirectory'] as Array<'openDirectory'|'createDirectory'>};const owner=window();
     const pick=await (owner?dialog.showOpenDialog(owner,options):dialog.showOpenDialog(options));signal?.throwIfAborted();
     if(pick.canceled||!pick.filePaths[0])return {cancelled:true};result={directory:await api.setDirectory(pick.filePaths[0],rev),oldFilesRetained:true};
    }else if(action==='favorites.local.open'){
     const item=state.items.find(x=>x.id===id);if(!item||item.missing)throw Error('收藏文件不存在');signal?.throwIfAborted();shell.showItemInFolder(item.filePath);result={opened:true,id};
    }else if(action==='favorites.local.openDirectory'){
     await fs.mkdir(state.directory,{recursive:true});signal?.throwIfAborted();const error=await shell.openPath(state.directory);if(error)throw Error(error);result={opened:true,directory:state.directory};
    }else throw Error('未知本地收藏操作');
   }
   const owner=window();if(owner&&!owner.isDestroyed())owner.webContents.send('favorites:changed',{message:'收藏已更新'});
   return result;
  },
 };
}
