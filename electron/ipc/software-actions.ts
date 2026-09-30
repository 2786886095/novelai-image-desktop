import {SOFTWARE_WORKFLOWS} from '../../src/agent/workflow-catalog';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {SOFTWARE_ACTIONS,validateSoftwareAction} from '../../src/agent/software-action-contract';
import {projectStudioData} from '../../src/studio-agent-contract';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
export function verifySoftwareAction(action:string,args:Record<string,unknown>,state:Record<string,unknown>) {
 const items=(state.items??state.presets??[]) as Record<string,unknown>[];
 const groups=(state.groups??[]) as Array<string|Record<string,unknown>>;
 let passed=true;
 if(action==='history.groups.create')passed=groups.some(x=>typeof x==='object'&&x.name===String(args.name).trim());
 else if(action==='history.groups.rename')passed=groups.some(x=>typeof x==='object'&&x.id===args.id&&x.name===String(args.name).trim());
 else if(action==='history.groups.delete')passed=!groups.some(x=>typeof x==='object'&&x.id===args.id)&&!items.some(x=>x.groupId===args.id);
 else if(action==='references.groups.create')passed=groups.includes(String(args.name).trim());
 else if(action==='references.groups.delete')passed=!groups.includes(String(args.name).trim())&&!items.some(x=>x.group===String(args.name).trim());
 else if(action.endsWith('.delete'))passed=!items.some(x=>x.id===args.id);
 else if(action.endsWith('.clear'))passed=items.length===0;
 else if(action.endsWith('.move'))passed=items.some(x=>x.id===args.id&&(x[action.startsWith('references.')?'group':'groupId']??'')===String(args.group).trim());
 if(!passed)throw Error('操作后的回读未符合预期；请查看当前资料，不要自动重试');
}
export const SOFTWARE_ACTION_TOOLS=['langbai_software_capabilities','langbai_software_action'] as const;
export function createSoftwareActions(approve:(request:AgentToolBridgeRequest)=>Promise<boolean>,nativeActions:Record<string,unknown>={}) {
 async function snapshot(action:string) {
  if(action.startsWith('history.exports.'))return (await import('./agent-history-exports.js')).listHistoryExports();
  const store=await import('./store.js');
  if(action.startsWith('history.'))return {groups:store.getHistoryGroups(),items:store.getHistory()};
  if(action.startsWith('references.'))return (await import('./reference-presets.js')).listReferencePresets();
  return {items:store.getTextToolHistory(action.startsWith('text.convert.')?'convert':'reverse')};
 }
 const revision=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
 let tail:Promise<unknown>=Promise.resolve();
 async function execute(request:AgentToolBridgeRequest) {
  try {
   if(request.tool==='langbai_software_capabilities') {
    const data={platform:'desktop',actions:{...SOFTWARE_ACTIONS,...nativeActions},workflows:SOFTWARE_WORKFLOWS,coverage:'workflows 按用户操作列出已接通流程；actions 是本入口可执行的明细操作。未列出的功能不代表已接通。',mutationContract:'先读取同类资料取得 revision，再传 expectedRevision；普通修改直接执行，删除与覆盖在 Agent 内确认。'};
    return {ok:true,title:'软件功能清单',output:JSON.stringify(data),data};
   }
   const spec=validateSoftwareAction(request.args),args=request.args;
   request.signal?.throwIfAborted();
   let before=await snapshot(spec.action),rev=revision(before);let result:unknown;
   if(spec.effect!=='read') {
    if(args.expectedRevision!==rev)throw Error('资料已变化，请重新读取');
    if(spec.effect==='confirm'&&!await approve({...request,args:{...args,title:spec.title}}))throw Error('Agent 内已取消，资料未修改');
    request.signal?.throwIfAborted();
    before=await snapshot(spec.action);if(revision(before)!==rev)throw Error('确认期间资料已变化，请重新读取');
    const s=await import('./store.js'),r=await import('./reference-presets.js');
    const id=String(args.id??''),name=String(args.name??''),group=String(args.group??'');
    const data=before as {groups?:Array<{id?:string;name?:string}>;items?:Array<{id:string}>;presets?:Array<{id:string}>};
    if(spec.action.startsWith('history.groups.')&&id&&!data.groups?.some(x=>x.id===id))throw Error('历史分组不存在');
    if(spec.action.startsWith('history.items.')&&id&&!data.items?.some(x=>x.id===id))throw Error('历史图片不存在');
    if(spec.action.startsWith('text.')&&id&&!data.items?.some(x=>x.id===id))throw Error('历史项不存在');
    if(spec.action.startsWith('references.')&&id&&!data.presets?.some(x=>x.id===id))throw Error('参考图预设不存在');
    if(spec.action==='references.groups.delete'&&!(data.groups as unknown as string[])?.includes(name))throw Error('参考图分组不存在');
    switch(spec.action){
     case 'history.groups.create':result=s.createHistoryGroup(name);break;
     case 'history.groups.rename':result=s.renameHistoryGroup(id,name);break;
     case 'history.groups.delete':result=s.deleteHistoryGroup(id);break;
     case 'history.items.move':if(group&&!data.groups?.some(x=>x.id===group))throw Error('目标历史分组不存在');result=s.setHistoryGroup(id,group);break;
     case 'history.items.rename': {
      const renamed=await (await import('./storage.js')).renameHistoryItem(id,name);if(!renamed.ok||!renamed.item)throw Error(renamed.message??'重命名未完成');
      const row=s.getHistory().find(x=>x.id===id);if(row?.filePath!==renamed.item.filePath)throw Error('重命名回读不一致');const stat=await fs.lstat(row.filePath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('重命名文件验证失败');
      result={id,filePath:row.filePath,bytes:stat.size};break;
     }
     case 'history.groups.export':result=await (await import('./agent-history-exports.js')).exportAgentHistoryGroup(group,request.signal);break;
     case 'history.exports.open':result=await (await import('./agent-history-exports.js')).openHistoryExport(id);break;
     case 'history.items.delete':result=await (await import('./storage.js')).deleteHistoryItem(id);break;
     case 'references.delete':result=await r.deleteReferencePreset(id);break;
     case 'references.move':result=await r.moveReferencePresetToGroup(id,group);break;
     case 'references.groups.create':result=await r.createReferencePresetGroup(name);break;
     case 'references.groups.delete':result=await r.deleteReferencePresetGroup(name);break;
     case 'text.convert.delete':result=s.removeTextToolHistoryItem('convert',id);break;
     case 'text.reverse.delete':result=s.removeTextToolHistoryItem('reverse',id);break;
     case 'text.convert.clear':result=s.clearTextToolHistory('convert');break;
     case 'text.reverse.clear':result=s.clearTextToolHistory('reverse');break;
    }
    if(result&&typeof result==='object'&&'ok' in result&&result.ok===false)throw Error('软件操作返回失败；请回读核实');
   }
   const current=await snapshot(spec.action);rev=revision(current);
   if(spec.effect!=='read')verifySoftwareAction(spec.action,args,current as Record<string,unknown>);
   const raw=current as Record<string,unknown>;
   const rows=((spec.action.startsWith('history.groups.')||spec.action.startsWith('references.groups.'))?raw.groups:raw.items??raw.presets) as unknown[];
   const offset=Number(args.offset??0),limit=Number(args.limit??20);
   const data={action:spec.action,revision:rev,executed:spec.effect!=='read',...(result?{result:projectStudioData(result)}:{}),readback:projectStudioData(rows?.slice(offset,offset+limit)??current),total:rows?.length,offset,nextOffset:rows&&offset+limit<rows.length?offset+limit:null};
   return {ok:true,title:spec.title,output:JSON.stringify(data),data};
  }catch(error){return {ok:false,title:'软件操作未完成',output:error instanceof Error?error.message:String(error)};}
 }
 return {handles:(tool:string)=>(SOFTWARE_ACTION_TOOLS as readonly string[]).includes(tool),execute:(request:AgentToolBridgeRequest)=>{
  if(request.tool==='langbai_software_capabilities'||String(request.args.action).endsWith('.list'))return execute(request);
  const task=tail.then(()=>execute(request));tail=task.catch(()=>{});return task;
 }};
}
