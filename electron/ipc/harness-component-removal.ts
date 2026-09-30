import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateManifest,safeBundlePath} from './harness-policy';
import {discardHarnessDownload} from './harness-update';
// Deletion is file-by-file and hash-bound. Unknown/modified files and all user homes remain.
async function bounded<T>(items:T[],run:(item:T)=>Promise<void>){
 let next=0,failed=false,failure:unknown;
 await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{
  try{while(!failed&&next<items.length)await run(items[next++]);}
  catch(error){failed=true;failure=error;}
 }));
 if(failed)throw failure;
}
export async function removeHarnessComponent(root:string,signal?:AbortSignal,progress?:(phase:'scan'|'remove',done:number,total:number)=>void){
 signal?.throwIfAborted();
 root=path.resolve(root);if((await fs.lstat(root)).isSymbolicLink())throw Error('Linked component root');
 // Resolve OS aliases such as macOS /var, but reject links below the trusted app root.
 root=await fs.realpath(root);const parent=path.join(root,'versions');
 const slots=await fs.readdir(parent,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 if(slots.length&&(await fs.lstat(parent)).isSymbolicLink())throw Error('Linked versions directory');
 const removals:string[]=[],dirs=new Set<string>(),markers:string[]=[];let preserved=0;
 for(const entry of slots){
  if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[a-zA-Z0-9.-]+$/.test(entry.name)){preserved++;continue;}
  const slot=path.join(parent,entry.name);let manifest;
  try{const file=path.join(slot,'manifest.json');if((await fs.lstat(file)).isSymbolicLink())throw Error('Linked manifest');manifest=validateManifest(JSON.parse(await fs.readFile(file,'utf8')));}catch{preserved++;continue;}
  const entries=Object.entries(manifest.files);let scanned=0;progress?.('scan',0,entries.length);
  await bounded(entries,async([name,hash])=>{
   signal?.throwIfAborted();
   try{
   const file=safeBundlePath(slot,name);let linked=false;
   // Old uninstalled slots retain manifests. Missing entries need no ancestor walk.
   const st=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!st)return;
   for(let p=file;p!==slot;p=path.dirname(p)){const st=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink()){linked=true;break;}}
   if(linked){preserved++;return;}
   if(!st.isFile()||crypto.createHash('sha256').update(await fs.readFile(file,{signal})).digest('hex')!==hash){preserved++;return;}
   removals.push(file);for(let p=path.dirname(file);p!==parent;p=path.dirname(p))dirs.add(p);
   }finally{scanned++;if(scanned%1000===0||scanned===entries.length)progress?.('scan',scanned,entries.length);}
  });
  markers.push(path.join(slot,'.studio-uninstalled'));
  // Keep manifests: they are small recovery/migration receipts, not executable runtime.
 }
 signal?.throwIfAborted();
 // Retain last manifest to repair launcher-owned links on reinstall, including custom plugins.
 const activeFile=path.join(root,'active.json');
 try{const active=JSON.parse(await fs.readFile(activeFile,'utf8'));if(typeof active.slot!=='string'||!/^[a-zA-Z0-9.-]+$/.test(active.slot))throw Error('Invalid slot');
  const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(parent,active.slot,'manifest.json'),'utf8')));
  const temp=path.join(root,'uninstalled.json.tmp');await fs.writeFile(temp,JSON.stringify({active,manifest}));await fs.rename(temp,path.join(root,'uninstalled.json'));
  signal?.throwIfAborted();await fs.unlink(activeFile);
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 for(const marker of markers)await fs.writeFile(marker,'runtime removed; user data retained');
 // After deactivation, finish the bounded cleanup to leave a consistent removed
 // component. Cancellation is honored in preflight, before removing active.json.
 let removed=0;progress?.('remove',0,removals.length);
 await bounded(removals,async file=>{await fs.unlink(file);removed++;if(removed%1000===0||removed===removals.length)progress?.('remove',removed,removals.length);});
 const depths=new Map<number,string[]>();for(const dir of dirs){const depth=dir.split(path.sep).length;if(!depths.has(depth))depths.set(depth,[]);depths.get(depth)!.push(dir);}
 for(const depth of [...depths.keys()].sort((a,b)=>b-a))await bounded(depths.get(depth)!,async dir=>{await fs.rmdir(dir).catch(e=>{if(!['ENOTEMPTY','ENOENT','EEXIST'].includes(e.code))throw e;});});
 const downloads=path.join(root,'downloads');
 for(const name of await fs.readdir(downloads).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))await discardHarnessDownload(root,path.join(downloads,name));
 return {removed:removals.length,preserved};
}
