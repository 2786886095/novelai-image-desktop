import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {HarnessManifest} from './harness-policy';
import {candidateRuntimeLink} from './harness-compatibility';
/** Only wholly unchanged shipped plugins and launcher-owned links are migrated. */
export async function upgradeBundledUserFiles(root:string, before:HarnessManifest, nextRoot:string, next:HarnessManifest) {
 const home=path.join(root,'user-home/profiles/node_modules');
 const undo:Array<()=>Promise<void>>=[];let changed=0,custom=0,links=0;
 const digest=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
 const targetFor=(relative:string)=>{
  const own=/^plugins\/(studio-(?:brand|tools|data|library))\/(.+)$/.exec(relative);
  if(own)return path.join(home,'@langbai',`dsh-${own[1]}`,own[2]);
  if(relative.startsWith('community/packages/'))return path.join(home,relative.slice('community/packages/'.length));
  return null;
 };
 const rollback=async()=>{for(const restore of undo.reverse())await restore();};
 try {
  // Composition has defaults too. Update only an exact untouched shipped file;
  // customized plugin graphs and explicit per-session limits remain user-owned.
  const composition='community/community.patch.yml';
  if(before.files[composition]&&next.files[composition]&&before.files[composition]!==next.files[composition]){
   const target=path.join(root,'user-home/studio-community.patch.yml');
   const stat=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(stat?.isFile()&&!stat.isSymbolicLink()){
    const previous=await fs.readFile(target);
    if(digest(previous)===before.files[composition]){
     const replacement=await fs.readFile(path.join(nextRoot,composition));
     if(digest(replacement)!==next.files[composition])throw Error('Composition migration integrity failed');
     undo.push(()=>fs.writeFile(target,previous));await fs.writeFile(target,replacement);changed++;
    }else custom++;
   }
  }
  // A plugin is the compatibility unit. Never mix user-edited old files with new code.
  const prefixFor=(relative:string)=>{
   const own=/^(plugins\/studio-(?:brand|tools|data|library)\/)/.exec(relative);
   const community=/^(community\/packages\/(?:@[^/]+\/)?[^/]+\/)/.exec(relative);
   return own?.[1] ?? community?.[1] ?? null;
  };
  const prefixes=new Set([...Object.keys(before.files),...Object.keys(next.files)].map(prefixFor).filter((s):s is string=>!!s));
  for(const prefix of prefixes){
   const oldNames=Object.keys(before.files).filter(n=>n.startsWith(prefix));
   const newNames=Object.keys(next.files).filter(n=>n.startsWith(prefix));
   const names=[...new Set([...oldNames,...newNames])];
   if(names.every(n=>before.files[n]===next.files[n]))continue;
   const packageRoot=path.dirname(targetFor(prefix+'package.json')!);
   let customized=false;
   // Junctions, deletions, extra files and unknown package collisions belong to the user.
   for(let parent=packageRoot;parent!==home;parent=path.dirname(parent)){
    try{if((await fs.lstat(parent)).isSymbolicLink()){customized=true;break;}}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   }
   const oldBytes=new Map<string,Buffer>();
   if(!customized)for(const name of oldNames){
    try{const target=targetFor(name)!;const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink()){customized=true;break;}
     const bytes=await fs.readFile(target);if(digest(bytes)!==before.files[name]){customized=true;break;}oldBytes.set(name,bytes);
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;customized=true;break;}
   }
   if(!customized){
    const queue=[packageRoot];const expected=new Set(oldNames.map(n=>path.resolve(targetFor(n)!)));
    while(queue.length&&!customized){
     const dir=queue.pop()!;let entries;
     try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
     for(const entry of entries){const target=path.join(dir,entry.name);
      if(entry.isSymbolicLink()){customized=true;break;}
      if(entry.isDirectory())queue.push(target);else if(!expected.has(path.resolve(target))){customized=true;break;}
     }
    }
   }
   if(customized){custom+=names.length;continue;}
   // Validate all replacement bytes before the first mutation.
   const replacements=new Map<string,Buffer>();
   for(const name of newNames){const bytes=await fs.readFile(path.join(nextRoot,name));if(digest(bytes)!==next.files[name])throw new Error('Plugin migration integrity failed');replacements.set(name,bytes);}
   for(const name of names){
    if(before.files[name]===next.files[name])continue;
    const target=targetFor(name)!,previous=oldBytes.get(name),replacement=replacements.get(name);
    undo.push(async()=>{if(previous)await fs.writeFile(target,previous);else await fs.unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});});
    if(replacement){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,replacement);}else await fs.unlink(target);
    changed++;
   }
  }
  const queue=[home];const versions=path.resolve(root,'versions');
  while(queue.length){
   const directory=queue.pop()!;let entries;
   try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
   for(const entry of entries){
    const file=path.join(directory,entry.name);
    if(entry.isSymbolicLink()){
     const old=await fs.readlink(file);const resolved=path.resolve(path.dirname(file),old);
     const relative=path.relative(versions,resolved);
     if(relative.startsWith('..')||path.isAbsolute(relative))continue;
     const parts=relative.split(path.sep);if(parts[1]!=='runtime'||parts[2]!=='node_modules')continue;
     const target=await candidateRuntimeLink(nextRoot,relative);if(!target)continue;
     if(path.resolve(target)===resolved)continue;
     try{if(!(await fs.stat(target)).isDirectory())continue;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
     const type=process.platform==='win32'?'junction':'dir';
     await fs.unlink(file);
     try{await fs.symlink(target,file,type);}catch(e){await fs.symlink(resolved,file,type);throw e;}
     undo.push(async()=>{await fs.unlink(file);await fs.symlink(resolved,file,type);});links++;
    } else if(entry.isDirectory()) queue.push(file);
   }
  }
  return {changed,custom,links,rollback};
 } catch(e){await rollback();throw e;}
}
