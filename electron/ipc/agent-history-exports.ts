import {app,shell} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import {getHistory,getHistoryGroups} from './store';
import {projectStudioData} from '../../src/studio-agent-contract';

interface Receipt {id:string;filePath:string;fileName:string;count:number;bytes:number;sha256:string;createdAt:string;group:string}
const root=()=>path.join(app.getPath('userData'),'agent-history-exports');
const index=()=>path.join(root(),'receipts.json');
let tail:Promise<unknown>=Promise.resolve();
const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};
async function read():Promise<Receipt[]>{
 try{const data=JSON.parse(await fs.readFile(index(),'utf8'));if(!Array.isArray(data)||data.some(x=>typeof x.id!=='string'||!/^[a-f0-9-]{36}$/.test(x.id)||x.filePath!==path.join(root(),x.id+'.zip')||typeof x.sha256!=='string'))throw Error('导出记录损坏，请保留目录后检查');return data;}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
}
export async function listHistoryExports(){const items=await read();return {items:await Promise.all(items.map(async x=>{try{const stat=await fs.lstat(x.filePath);return {...x,available:stat.isFile()&&!stat.isSymbolicLink()&&stat.size===x.bytes};}catch{return {...x,available:false};}}))};}
export function exportAgentHistoryGroup(group:string,signal?:AbortSignal){return serial(async()=>{
 signal?.throwIfAborted();const groups=getHistoryGroups();if(group&&group!=='__ungrouped'&&!groups.some(x=>x.id===group))throw Error('历史分组不存在');
 const items=getHistory(undefined,group||undefined);if(!items.length)throw Error('该分组没有可导出的图片');
 const zip=new JSZip(),exported:Record<string,unknown>[]=[];
 for(const [i,item] of items.entries()){
  signal?.throwIfAborted();const stat=await fs.lstat(item.filePath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('图片已移动或不是普通文件；本次导出未完成');
  if(!/\.(png|jpe?g|webp|gif|avif)$/i.test(item.filePath))throw Error('历史项不是可导出的图片');
  const name=`images/${String(i+1).padStart(4,'0')}_${path.basename(item.filePath)}`;
  zip.file(name,await fs.readFile(item.filePath));exported.push({id:item.id,date:item.date,createdAt:item.createdAt,model:item.model,width:item.width,height:item.height,actualSeed:item.actualSeed,params:projectStudioData(item.params),filePath:name,groupId:item.groupId});
 }
 zip.file('project.json',JSON.stringify({version:1,groups:groups.filter(x=>items.some(i=>i.groupId===x.id)),items:exported},null,2));
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});signal?.throwIfAborted();
 await JSZip.loadAsync(bytes,{checkCRC32:true});await fs.mkdir(root(),{recursive:true});const id=randomUUID(),filePath=path.join(root(),id+'.zip');
 const receipt:Receipt={id,filePath,fileName:path.basename(filePath),count:items.length,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),createdAt:new Date().toISOString(),group};
 await fs.writeFile(filePath,bytes,{flag:'wx'});const temp=index()+'.'+randomUUID()+'.tmp';
 try{signal?.throwIfAborted();const records=await read();await fs.writeFile(temp,JSON.stringify([receipt,...records]),{flag:'wx'});await fs.rename(temp,index());}
 catch(e){await fs.unlink(filePath).catch(()=>{});throw e;}finally{await fs.unlink(temp).catch(()=>{});}
 return receipt;
 });}
export async function openHistoryExport(id:string){
 const receipt=(await read()).find(x=>x.id===id);if(!receipt)throw Error('导出记录不存在，请先导出或读取导出列表');
 const st=await fs.lstat(receipt.filePath);if(!st.isFile()||st.isSymbolicLink()||st.size!==receipt.bytes)throw Error('导出文件已改变或删除，请重新导出');
 const hash=createHash('sha256').update(await fs.readFile(receipt.filePath)).digest('hex');if(hash!==receipt.sha256)throw Error('导出文件校验失败，请重新导出');
 shell.showItemInFolder(receipt.filePath);return {opened:true,...receipt};
}
