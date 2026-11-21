import {createHash,randomUUID} from 'node:crypto';
import {realpathSync,lstatSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import type {BrowserWindow} from 'electron';
import {getHistory,getHistoryGroups,getSettings,setSetting} from './store';
import {app} from 'electron';
import {positivePromptPresetStorageId} from '../../src/positive-prompt-presets';
import {stylePromptPreviewDirectory,deleteStylePromptPresetImages} from './style-preset-images';
import type {PositivePromptPreset,StylePromptPreset,PromptChunk} from '../../src/types';
import type {NegativePromptPreset} from '../../src/negative-prompt-library';

type J=Record<string,unknown>;
const shape=(properties:J,required:string[]=[])=>({type:'object',additionalProperties:false,properties,required});
const str=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const name=str(100),id=str(160),body=str(100000),revision=str(64);
const array=(items:J,maxItems=32)=>({type:'array',items,minItems:1,maxItems});
const choices=(...values:string[])=>({type:'string',enum:values});
const kind=choices('positive','negative','style','chunk');
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}};
const digest=(...parts:unknown[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function unique(ids:string[]){if(new Set(ids).size!==ids.length)throw Error('同一批中不能重复指定同一资源。');return ids;}
function needName(v:unknown){const s=String(v??'').trim();if(!s||/[\u0000-\u001f\u007f]/u.test(s))throw Error('无效的名称');return s;}
function review(given:unknown,rev:string,items:unknown){if(given===undefined)return {preview:true,revision:rev,items};if(given!==rev)throw Error('资源或请求已变化，请重新预览。');}
function slice<T>(rows:T[],a:J){const offset=Number(a.offset??0),limit=Number(a.limit??20);return {total:rows.length,items:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};}
type Row=PositivePromptPreset|StylePromptPreset|PromptChunk|NegativePromptPreset;
function library(k:unknown):Row[]{const s=getSettings();switch(k){case 'positive':return s.positivePromptPresets;case 'negative':return s.negativePromptPresets;case 'style':return s.stylePromptPresets;case 'chunk':return s.promptChunks;default:throw Error('未知资源库');}}
function write(k:unknown,rows:Row[]){switch(k){case 'positive':return setSetting('positivePromptPresets',rows as PositivePromptPreset[]);case 'negative':return setSetting('negativePromptPresets',rows as NegativePromptPreset[]);case 'chunk':return setSetting('promptChunks',rows as PromptChunk[]);case 'style':return setSetting('stylePromptPresets',rows as StylePromptPreset[]);default:throw Error('未知资源库');}}
const txt=(r:Row)=>'content' in r?r.content:r.prompt;
function history(ids:string[]){const index=new Map(getHistory().map(r=>[r.id,r]));return unique(ids).map(id=>{const r=index.get(id);if(!r)throw Error('未知作品 ID：'+id);return r;});}
function managed(file:string){const dir=getSettings().outputDir;if(!dir||!path.isAbsolute(file)||!lstatSync(file).isFile())throw Error('非当前输出目录内的常规文件。');const rel=path.relative(realpathSync(dir),realpathSync(file));if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('作品不在当前输出目录。');}
function previewFolder(kind:unknown,r:Row){
 if(kind!=='positive'&&kind!=='style')return;
 const storageId=kind==='positive'?positivePromptPresetStorageId(r.id):r.id,dir=stylePromptPreviewDirectory(storageId);
 if(!existsSync(dir))return;
 const all=[...library('style').map(x=>x.id),...library('positive').map(x=>positivePromptPresetStorageId(x.id))];
 if(!/^[A-Za-z0-9_-]{1,96}$/.test(storageId)||all.filter(x=>stylePromptPreviewDirectory(x).toLowerCase()===dir.toLowerCase()).length!==1)throw Error('预览目录身份不唯一，请在软件中处理。');
 const expected=path.join(realpathSync(app.getPath('userData')),'style-prompt-previews',storageId);
 if(path.relative(expected,realpathSync(dir))!=='')throw Error('预览目录不属于此预设。');
 const files=readdirSync(dir,{withFileTypes:true});if(files.some(e=>!e.isFile()||!(e.name==='manifest.json'||/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(e.name))))throw Error('预览目录含非预期文件。');
 return {storageId,files:files.map(e=>{const s=lstatSync(path.join(dir,e.name));return [e.name,s.size,s.mtimeMs];})};
}
const brief=(r:ReturnType<typeof getHistory>[number])=>({id:r.id,name:path.basename(r.filePath),groupId:r.groupId});
export function workbenchResourceTools(window:()=>BrowserWindow|null|undefined){
 const emit=(channel:string)=>{const w=window();if(w&&!w.isDestroyed())w.webContents.send(channel);};
 let deleting=false;
 async function confirmDelete(signal:AbortSignal|undefined,label:string,rows:{id:string;name:string}[],act:()=>Promise<unknown>){
  signal?.throwIfAborted();const w=window();if(!w||w.isDestroyed()||deleting)throw Error('需要可用的桌面窗口逐次确认删除。');
  deleting=true;try{const {dialog}=await import('electron');
   const r=await dialog.showMessageBox(w,{type:'warning',title:'MCP 请求永久删除',message:'永久删除'+label+'（'+rows.length+' 项）？',detail:rows.map((x,i)=>String(i+1)+'. '+JSON.stringify(x.name)+' ['+JSON.stringify(x.id)+']').join('\n').replace(/[\u202a-\u202e\u2066-\u2069]/gu,'�')+'\n此操作不能撤销。',buttons:['取消','永久删除'],defaultId:0,cancelId:0,noLink:true});
   signal?.throwIfAborted();if(r.response!==1||w.isDestroyed())return {applied:false,cancelled:true};return await act();
  }finally{deleting=false;}
 }
 const tool=(name:string,description:string,inputSchema:J,readOnlyHint:boolean,run:(a:J,signal?:AbortSignal)=>Promise<unknown>,destructiveHint=false)=>({name,title:name,description,inputSchema,annotations:{readOnlyHint,destructiveHint,openWorldHint:false},run});
 return [
  tool('browse_prompt_library','Page or search positive, negative, style or reusable snippet entries. No writes or image bytes.',shape({kind,query:str(160),...page},['kind']),true,async a=>{
   const q=String(a.query??'').toLowerCase();return slice(library(a.kind).filter(r=>(r.name+'\n'+txt(r)).toLowerCase().includes(q)).map(r=>({id:r.id,name:r.name,text:txt(r),...('group' in r?{group:r.group,rating:r.rating??0}:{}),...('captions' in r?{characters:r.captions?.length??0}:{})})),a);
  }),
  tool('edit_prompt_library','Batch create (without id) or edit (by id). Preserve character settings and preview images. Preview first; commit with revision.',shape({kind,items:array(shape({id,name,text:body,rating:{type:'integer',minimum:0,maximum:5}},[])),revision},['kind','items']),false,async a=>{
   const rows=library(a.kind),edits=a.items as {id?:string;name?:string;text?:string;rating?:number}[],byId=new Map(rows.map(r=>[r.id,r]));unique(edits.flatMap(e=>e.id?[e.id]:[]));
   const plan=edits.map(e=>{const old=e.id?byId.get(e.id):undefined;if(e.id&&!old)throw Error('未知预设 ID：'+e.id);if(e.rating!==undefined&&a.kind!=='style')throw Error('只有画风支持评分。');if(e.text===undefined&&e.name===undefined&&e.rating===undefined)throw Error('没有修改字段');if(!old&&(!e.name||!e.text?.trim())||e.text!==undefined&&!e.text.trim())throw Error('名称和正文不能为空。');if(e.name!==undefined)needName(e.name);return {id:e.id,from:old?.name,to:e.name===undefined?old!.name:needName(e.name),action:old?'edit':'create'};});
   if(a.kind==='negative'&&rows.length+edits.filter(e=>!e.id).length>2000)throw Error('负面预设上限 2000。');
   const rev=digest('edit',a.kind,edits,rows);const p=review(a.revision,rev,plan);if(p)return p;
   const next=rows.slice(),now=new Date().toISOString();const items=edits.map((e,i)=>{const old=e.id?byId.get(e.id):undefined,id=old?.id??randomUUID(),name=plan[i].to,text=e.text??(old?txt(old):'');
    const base={...old,id,name,createdAt:old?.createdAt??now};const r:Row=a.kind==='chunk'?{...base,content:text.trim(),updatedAt:now}:a.kind==='style'?{group:'Default',...base,prompt:text,...(e.rating!==undefined?{rating:e.rating}:{})}:{...base,prompt:text};if(old)next[next.indexOf(old)]=r;else next.push(r);return {id,name};});
   write(a.kind,next);emit('mcp:style-catalog-changed');return {applied:true,items};
  }),
  tool('rename_history_group','Rename a history group by ID without relocating its files.',shape({id,name,revision},['id','name']),false,async a=>{
   const groups=getHistoryGroups(),g=groups.find(x=>x.id===a.id),to=needName(a.name);if(!g||groups.some(x=>x.id!==g.id&&x.name.toLowerCase()===to.toLowerCase()))throw Error('分组不存在或重名。');
   const p=review(a.revision,digest('group',groups,g.id,to),[{id:g.id,from:g.name,to}]);if(p)return p;
   const {renameHistoryGroup}=await import('./store.js');if(digest(groups)!==digest(getHistoryGroups()))throw Error('分组已变化');renameHistoryGroup(g.id,to);emit('mcp:history-catalog-changed');return {id:g.id,name:to,applied:true};
  }),
  tool('rename_history_images','Rename selected managed files, keeping extensions; reports actual names and per-file failures. Preview first.',shape({items:array(shape({id,name},['id','name'])),revision},['items']),false,async a=>{
   const {renameHistoryItem}=await import('./storage.js'),items=a.items as {id:string;name:string}[],rows=history(items.map(x=>x.id));rows.forEach(r=>managed(r.filePath));const plan=rows.map((r,i)=>({...brief(r),to:needName(items[i].name)}));
   const p=review(a.revision,digest('rename',plan,rows.map(r=>r.filePath)),plan);if(p)return p;
   const results=[];for(const [i,r] of rows.entries()){try{const [fresh]=history([r.id]);if(fresh.filePath!==r.filePath)throw Error('作品已变化');managed(fresh.filePath);const v=await renameHistoryItem(r.id,plan[i].to);results.push({id:r.id,ok:v.ok,name:v.item&&path.basename(v.item.filePath),message:v.message});}catch(e){results.push({id:r.id,ok:false,message:String(e)});}}
   emit('mcp:history-catalog-changed');return {applied:results.every(v=>v.ok),items:results};
  }),
  tool('export_history_zip','Export selected history IDs using the desktop Save As dialog. Does not accept a destination path.',shape({ids:array(id,100)},['ids']),false,async a=>{
   if(!window()||window()?.isDestroyed())throw Error('需要桌面窗口选择保存位置。');const rows=history(a.ids as string[]);rows.forEach(r=>managed(r.filePath));if(rows.reduce((n,r)=>n+lstatSync(r.filePath).size,0)>256*1024*1024)throw Error('单次 ZIP 原图总量最多 256 MiB。');const {exportFiles}=await import('./storage.js');const res=await exportFiles(rows.map(r=>({filePath:r.filePath})), '作品');return {ok:res.ok,count:res.count??0,message:res.message};
  }),
  tool('list_local_favorites','Page the local favorites library without exposing paths.',shape(page),true,async a=>{const {imageFavoritesService}=await import('./image-favorites-ipc.js');const s=await imageFavoritesService().list();return slice(s.items.map(({id,name,width,height,missing})=>({id,name,width,height,missing:!!missing})),a);}),
  tool('favorite_history_images','Copy selected history images to favorites, deduplicating content; originals stay in place.',shape({ids:array(id),revision},['ids']),false,async a=>{
   const {imageFavoritesService}=await import('./image-favorites-ipc.js');const api=imageFavoritesService(),s=await api.list(),rows=history(a.ids as string[]);rows.forEach(r=>managed(r.filePath));const p=review(a.revision,digest('favorite',s.revision,s.directory,rows.map(r=>[r.id,r.filePath])),rows.map(brief));if(p)return p;
   const items=[];for(const r of rows){try{const [fresh]=history([r.id]);if(fresh.filePath!==r.filePath)throw Error('作品已变化');managed(r.filePath);const current=await api.list();if(current.directory!==s.directory)throw Error('收藏目录已变化');const v=await api.add(r.filePath,current.revision);items.push({id:r.id,ok:true,favoriteId:v.item.id,duplicate:v.duplicate});}catch(e){items.push({id:r.id,ok:false,message:String(e)});}}
   const w=window();if(w&&!w.isDestroyed())w.webContents.send('favorites:changed',{message:'收藏已更新'});return {applied:items.every(x=>x.ok),items};
  }),
  tool('manage_local_favorites','Batch rename favorite copies or remove their catalog entries while retaining files. Removal also requires native confirmation.',shape({action:choices('rename','unlist'),items:array(shape({id,name},['id']),12),revision},['action','items']),false,async (a,signal)=>{
    const {imageFavoritesService}=await import('./image-favorites-ipc.js');const api=imageFavoritesService(),lib=await api.list(),edits=a.items as {id:string;name?:string}[];unique(edits.map(e=>e.id));
    const plan=edits.map(e=>{const item=lib.items.find(i=>i.id===e.id);if(!item||a.action==='rename'&&!e.name||a.action==='unlist'&&e.name!==undefined)throw Error('无效的收藏选择或名称。');return {id:item.id,name:item.name,to:e.name===undefined?undefined:needName(e.name)};});
    const p=review(a.revision,digest('fav',a.action,lib.revision,plan),plan);if(p)return p;
    const apply=async()=>{let rev=lib.revision;const done=[];for(const e of plan){try{if(a.action==='rename')await api.rename(e.id,e.to!,rev);else await api.remove(e.id,rev);
      done.push({id:e.id,ok:true});const fresh=await api.list();for(const pending of plan.slice(done.length)){const current=fresh.items.find(i=>i.id===pending.id);if(!current||current.name!==pending.name)throw Error('待处理条目已变化');}rev=fresh.revision;
    }catch(err){return {applied:false,completed:done,error:String(err)};}finally{const w=window();if(w&&!w.isDestroyed())w.webContents.send('favorites:changed',{message:'收藏已更新'});}}
    return {applied:true,completed:done,filesRetained:a.action==='unlist'};};
    return a.action==='unlist'?confirmDelete(signal,'收藏目录中的记录（图片文件保留）',plan,apply):apply();
  }),
  tool('delete_reference_presets','Permanently remove selected saved reference images from their library, never unmount live references. Preview plus native human confirmation.',shape({ids:array(id,12),revision},['ids']),false,async (a,signal)=>{
   const ids=unique(a.ids as string[]),{deleteReferenceSelection}=await import('./reference-presets.js');
   const before=await deleteReferenceSelection(ids),p=review(a.revision,before.revision,before.items);if(p)return p;
   return confirmDelete(signal,'参考图预设及库内副本',before.items,async()=>{const result=await deleteReferenceSelection(ids,before.revision);emit('mcp:style-catalog-changed');return result;});
  },true),
  tool('delete_workspace_resources','Permanently delete selected history images or text library entries. Requires exact preview and a separate native user approval. No raw paths.',shape({kind:choices('history','positive','negative','chunk','style'),ids:array(id,12),revision},['kind','ids']),false,async (a,signal)=>{
   const ids=unique(a.ids as string[]),k=a.kind;const state=()=>{if(k==='history'){const rows=history(ids);rows.forEach(r=>managed(r.filePath));return {items:rows.map(brief),rev:digest('delete',k,rows,rows.map(r=>{const st=lstatSync(r.filePath);return [st.size,st.mtimeMs,st.ino];}))};}
    const rows=library(k),selected=ids.map(id=>{const r=rows.find(x=>x.id===id);if(!r)throw Error('未知预设 ID：'+id);return r;});return {items:selected.map(({id,name})=>({id,name})),rev:digest('delete',k,selected,selected.map(r=>previewFolder(k,r)))};};
   const before=state(),p=review(a.revision,before.rev,before.items);if(p)return p;
   return confirmDelete(signal,k==='history'?'作品及其托管原图':'提示词库条目及其专属预览图',before.items,async()=>{const {deleteHistoryItems}=await import('./storage.js');if(state().rev!==before.rev)throw Error('确认期间资源已变化，未删除。');
    if(k==='history'){const r=await deleteHistoryItems(ids);emit('mcp:history-catalog-changed');return r;}
    const selected=library(k).filter(r=>ids.includes(r.id));for(const row of selected){const folder=previewFolder(k,row);if(folder)deleteStylePromptPresetImages(folder.storageId);}
    write(k,library(k).filter(r=>!ids.includes(r.id)));emit('mcp:style-catalog-changed');return {applied:true,deletedIds:ids};});
  },true),
 ];
}
