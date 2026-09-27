import {createHash,randomUUID} from 'node:crypto';
import {LIBRARY_FIELDS,mergeLibraryPatch,validateLibraryRequest,validateLibraryValue} from '../../src/agent/library-contract';
import {projectStudioData} from '../../src/studio-agent-contract';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
import {normalizeTavernCharacter,normalizeTavernPersona,normalizeTavernLorebook,normalizeTavernSamplerPreset} from '../../src/tavern/compat';
export interface LibrarySnapshot {rows:Record<string,unknown>[];workspace?:Record<string,unknown>;}
export interface LibraryAdapter {
 read(collection:string):Promise<LibrarySnapshot>;
 backup(collection:string):Promise<string>;
 write(collection:string,rows:Record<string,unknown>[],before:LibrarySnapshot):Promise<void>;
}
const revision=(state:LibrarySnapshot)=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
export function createLibraryTools(adapter:LibraryAdapter,approve:(request:AgentToolBridgeRequest)=>Promise<boolean>){
 let tail:Promise<unknown>=Promise.resolve();
 async function execute(request:AgentToolBridgeRequest){
  try{
   if(request.tool==='studio_material_confirm'){
    const a=request.args;
    if(Object.keys(a).some(k=>!['name','collection','previous','warnings','revision'].includes(k))||typeof a.name!=='string'||typeof a.revision!=='string'||!['characters','personas','lorebooks','samplerPresets'].includes(String(a.collection))||JSON.stringify(a).length>16000)throw Error('会话资料确认参数无效');
    const approved=await approve(request);
    return {ok:true,title:'会话资料确认',output:JSON.stringify({approved}),data:{approved}};
   }
   if(request.tool==='studio_material_source'){
    const a=request.args;
    if(Object.keys(a).some(k=>!['collection','id'].includes(k))||!['characters','personas','lorebooks','samplerPresets'].includes(String(a.collection))||typeof a.id!=='string'||!a.id||a.id.length>200)throw Error('本机资料参数无效');
    const before=await adapter.read(String(a.collection)),row=before.rows.find(x=>x.id===a.id);
    if(!row)throw Error('本机资料不存在');
    // Trusted local-to-local transfer: retain full lists, but never export paths,
    // avatars, extension credentials or unrelated settings to the child process.
    const pick=(value:unknown,rule:import('../../src/agent/library-contract').LibraryRule):unknown=>rule.type==='object'?Object.fromEntries(Object.entries(rule.fields??{}).filter(([k])=>value&&typeof value==='object'&&Object.hasOwn(value,k)).map(([k,r])=>[k,pick((value as Record<string,unknown>)[k],r)])):rule.type==='array'&&Array.isArray(value)?value.map(v=>pick(v,rule.items!)):value;
    const item=pick(row,{type:'object',fields:LIBRARY_FIELDS[String(a.collection)]});
    validateLibraryValue(item,{type:'object',fields:LIBRARY_FIELDS[String(a.collection)]},'资料');
    if(Buffer.byteLength(JSON.stringify(item))>2_000_000)throw Error('单项资料超过传输上限，请拆分世界书后重试');
    const data={collection:a.collection,id:a.id,item};
    return {ok:true,title:'本机完整资料',output:'本机资料已读取',data};
   }
   const args=validateLibraryRequest(request.args),before=await adapter.read(args.collection);
   if(args.action==='read'){
    const rows=args.id?before.rows.filter(x=>x.id===args.id):before.rows;if(args.id&&!rows.length)throw Error('资料不存在');
    const offset=args.offset??0,limit=args.limit??20,data={collection:args.collection,revision:revision(before),items:projectStudioData(rows.slice(offset,offset+limit)),total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,editableFields:LIBRARY_FIELDS[args.collection],notes:'修改只影响本机保存的资料；不自动生成、不覆盖预览图。内置资料请先另存副本。删除已绑定的资料前需先解除会话绑定。'};
    return {ok:true,title:'本机资料库',output:JSON.stringify(data),data};
   }
   if(args.expectedRevision!==revision(before))throw Error('资料已变化，请重新读取');
   const old=args.id?before.rows.find(x=>x.id===args.id):undefined;
   if(args.id&&!old)throw Error('资料不存在');
   if(old&&(String(old.id).startsWith('builtin-')||old.source==='builtin'))throw Error('内置资料保持完整；请读取后新建一份自定义副本再修改');
   if(args.action==='delete'&&before.workspace){
    const w=before.workspace,rows=[...(w.conversations as Record<string,unknown>[]??[]),...(w.characters as Record<string,unknown>[]??[]),...(w.personas as Record<string,unknown>[]??[])];
    if(rows.some(row=>['activeCharacterId','personaId','samplerPresetId','lorebookId'].some(k=>row[k]===args.id)||['characterIds','lorebookIds'].some(k=>Array.isArray(row[k])&&(row[k] as string[]).includes(args.id!)))||w.selectedCharacterId===args.id||w.selectedPersonaId===args.id)throw Error('此资料仍被会话或角色绑定；请先解除绑定，避免删除后对话失效');
   }
   const now=new Date().toISOString(),id=args.id??randomUUID();
   let row=mergeLibraryPatch(old??{id,createdAt:now,group:'Default'},args.patch??{});row.updatedAt=now;
   const normalize={characters:normalizeTavernCharacter,personas:normalizeTavernPersona,lorebooks:normalizeTavernLorebook,samplerPresets:normalizeTavernSamplerPreset}[args.collection];
   if(normalize&&args.action!=='delete')row=normalize(row) as unknown as Record<string,unknown>;
   // Validate normalization before any write. Never report a silently dropped field as saved.
   const checkPatch=(actual:Record<string,unknown>,patch:Record<string,unknown>)=>{for(const [k,v] of Object.entries(patch)){if(Array.isArray(v)&&v.every(x=>x&&typeof x==='object')){if(!Array.isArray(actual[k])||(actual[k] as unknown[]).length!==v.length)throw Error('列表字段 '+k+' 回读不符');v.forEach((x,i)=>checkPatch((actual[k] as Record<string,unknown>[])[i],x));}else if(v&&typeof v==='object'&&!Array.isArray(v))checkPatch((actual[k]??{}) as Record<string,unknown>,v as Record<string,unknown>);else if(JSON.stringify(actual[k])!==JSON.stringify(v))throw Error('字段 '+k+' 与软件资料格式不兼容，请按读取结果修改');}};
   if(args.patch)checkPatch(row,args.patch);
   if(['update','delete'].includes(args.action)&&!await approve({...request,args:{action:args.action,collection:args.collection,名称:old?.name,id,修改:args.patch??null,说明:'执行前创建可恢复备份；图片文件保留，不触发生图'}}))throw Error('已取消，原资料未修改');
   if(revision(await adapter.read(args.collection))!==args.expectedRevision)throw Error('确认期间资料已变化，请重新读取');
   const backupPath=await adapter.backup(args.collection);
   if(revision(await adapter.read(args.collection))!==args.expectedRevision)throw Error('备份期间资料已变化，修改未执行');
   const rows=args.action==='create'?[...before.rows,row]:args.action==='delete'?before.rows.filter(x=>x.id!==id):before.rows.map(x=>x.id===id?row:x);
   await adapter.write(args.collection,rows,before);
   const after=await adapter.read(args.collection),saved=after.rows.find(x=>x.id===id);
   if(args.action==='delete'?!!saved:!saved)throw Error('写入后回读不符，请查看资料，不要重复执行');
   if(saved&&args.patch)checkPatch(saved,args.patch);
   const data={executed:true,collection:args.collection,action:args.action,id,revision:revision(after),item:projectStudioData(saved??null),backupPath,restoreInstructions:'如需恢复，在 Agent 的备份列表中检查此备份，再确认恢复。'};
   return {ok:true,title:'资料已保存',output:JSON.stringify(data),data};
  }catch(error){return {ok:false,title:'资料操作未完成',output:error instanceof Error?error.message:String(error)};}
 }
 return {handles:(tool:string)=>['langbai_library','studio_material_source','studio_material_confirm'].includes(tool),execute:(request:AgentToolBridgeRequest)=>{if(request.args.action==='read'||request.tool!=='langbai_library')return execute(request);const task=tail.then(()=>execute(request));tail=task.catch(()=>{});return task;}};
}
export function desktopLibraryAdapter():LibraryAdapter {
 const settingsKey=(c:string)=>c==='styles'?'stylePromptPresets':'positivePromptPresets';
 return {
  async read(c){if(c==='styles'||c==='positivePresets'){const s=(await import('./store.js')).getSettings();return {rows:s[settingsKey(c)] as unknown as Record<string,unknown>[]};}const w=(await import('./agent-store.js')).readAgentWorkspace();return {rows:w[c as 'characters'] as unknown as Record<string,unknown>[],workspace:w as unknown as Record<string,unknown>};},
  async backup(c){const result=await(await import('./data-backup.js')).exportDataBackup({categories:[c==='styles'||c==='positivePresets'?'promptPresets':'agentWorkspace'],destination:'internal'});if(!result.ok||!result.path)throw Error('修改前备份失败：'+result.message);return result.path;},
  async write(c,rows,before){if(c==='styles'||c==='positivePresets'){const store=await import('./store.js');if(JSON.stringify(store.getSettings()[settingsKey(c)])!==JSON.stringify(before.rows))throw Error('保存前资料已变化，请重新读取');store.setSetting(settingsKey(c),rows as never);}else{const store=await import('./agent-store.js');if(JSON.stringify(store.readAgentWorkspace())!==JSON.stringify(before.workspace))throw Error('保存前资料已变化，请重新读取');store.writeAgentWorkspace({...before.workspace,[c]:rows} as never);}}
 };
}
