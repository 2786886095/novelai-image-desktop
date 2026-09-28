import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateManifest,safeBundlePath} from './harness-policy';
import {discardHarnessDownload} from './harness-update';
// Deletion is file-by-file and hash-bound. Unknown/modified files and all user homes remain.
export async function removeHarnessComponent(root:string){
 root=path.resolve(root);if((await fs.lstat(root)).isSymbolicLink())throw Error('Linked component root');
 // Resolve OS aliases such as macOS /var, but reject links below the trusted app root.
 root=await fs.realpath(root);const parent=path.join(root,'versions');
 const slots=await fs.readdir(parent,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 if(slots.length&&(await fs.lstat(parent)).isSymbolicLink())throw Error('Linked versions directory');
 const removals:string[]=[],dirs=new Set<string>();let preserved=0;
 for(const entry of slots){
  if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[a-zA-Z0-9.-]+$/.test(entry.name)){preserved++;continue;}
  const slot=path.join(parent,entry.name);let manifest;
  try{const file=path.join(slot,'manifest.json');if((await fs.lstat(file)).isSymbolicLink())throw Error('Linked manifest');manifest=validateManifest(JSON.parse(await fs.readFile(file,'utf8')));}catch{preserved++;continue;}
  for(const [name,hash] of Object.entries(manifest.files)){
   const file=safeBundlePath(slot,name);let linked=false;
   for(let p=file;p!==slot;p=path.dirname(p)){const st=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink()){linked=true;break;}}
   if(linked){preserved++;continue;}
   const st=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!st)continue;
   if(!st.isFile()||crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')!==hash){preserved++;continue;}
   removals.push(file);for(let p=path.dirname(file);p!==parent;p=path.dirname(p))dirs.add(p);
  }
  await fs.writeFile(path.join(slot,'.studio-uninstalled'),'runtime removed; user data retained');
  // Keep manifests: they are small recovery/migration receipts, not executable runtime.
 }
 // Retain last manifest to repair launcher-owned links on reinstall, including custom plugins.
 const activeFile=path.join(root,'active.json');
 try{const active=JSON.parse(await fs.readFile(activeFile,'utf8'));if(typeof active.slot!=='string'||!/^[a-zA-Z0-9.-]+$/.test(active.slot))throw Error('Invalid slot');
  const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(parent,active.slot,'manifest.json'),'utf8')));
  const temp=path.join(root,'uninstalled.json.tmp');await fs.writeFile(temp,JSON.stringify({active,manifest}));await fs.rename(temp,path.join(root,'uninstalled.json'));
  await fs.unlink(activeFile);
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 for(const file of removals)await fs.unlink(file);
 for(const dir of [...dirs].sort((a,b)=>b.length-a.length))await fs.rmdir(dir).catch(e=>{if(!['ENOTEMPTY','ENOENT','EEXIST'].includes(e.code))throw e;});
 const downloads=path.join(root,'downloads');
 for(const name of await fs.readdir(downloads).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))await discardHarnessDownload(root,path.join(downloads,name));
 return {removed:removals.length,preserved};
}
