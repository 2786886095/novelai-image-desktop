import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {HarnessManifest} from './harness-policy';
import {planLegacyPluginRepair} from './harness-legacy-repair';

const hash=(bytes:Buffer|string)=>crypto.createHash('sha256').update(bytes).digest('hex');
async function packageFiles(directory:string):Promise<Record<string,string>> {
 const files:Record<string,string>={};
 const walk=async(dir:string)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name),relative=path.relative(directory,file).split(path.sep).join('/');
  if(entry.isSymbolicLink())throw Error('自定义插件需要兼容适配后再更新。');
  if(entry.isDirectory())await walk(file);else if(entry.isFile())files[relative]=hash(await fs.readFile(file));
 }};
 await walk(directory);return files;
}
/** Unknown user code is preserved and blocks automatic compatibility approval. */
export async function userPluginFingerprint(root:string,current:HarnessManifest|null,next:HarnessManifest,previewSource?:string){
 const home=path.join(root,'user-home/profiles/node_modules');
 const legacy=(await planLegacyPluginRepair(root,next)).before;
 const expected=(manifest:HarnessManifest|null,name:string)=>{
  const own=/^@langbai\/dsh-(studio-(?:brand|tools|data|library|preview))$/.exec(name);
  const prefix=own?`plugins/${own[1]}/`:`community/packages/${name}/`;
  return Object.fromEntries(Object.entries(manifest?.files??{}).filter(([n])=>n.startsWith(prefix)).map(([n,h])=>[n.slice(prefix.length),h]));
 };
 const same=(a:Record<string,string>,b:Record<string,string>)=>Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([n,h])=>b[n]===h);
 const state:Record<string,unknown>={};
 const inspect=async(name:string)=>{
  const dir=path.join(home,name),st=await fs.lstat(dir);
  if(st.isSymbolicLink()){
   const target=await fs.realpath(dir),relative=path.relative(path.resolve(root,'versions'),target);
   if(relative.startsWith('..')||path.isAbsolute(relative)||!relative.split(path.sep).includes('runtime'))throw Error('自定义插件需要兼容适配后再更新。');
   state[name]=target;return;
  }
  if(!st.isDirectory())return;
  const files=await packageFiles(dir);state[name]=files;
  const candidates=[current,next,legacy].map(m=>expected(m,name));
  if(name==='@langbai/dsh-studio-preview'&&previewSource)candidates.push(await packageFiles(previewSource));
  if(!candidates.some(c=>same(files,c)))throw Error('自定义插件需要兼容适配后再更新。');
 };
 let entries;
 try{entries=await fs.readdir(home,{withFileTypes:true});}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return hash('{}');throw e;}
 for(const entry of entries){
  if(entry.name.startsWith('@')&&!entry.isSymbolicLink())for(const name of await fs.readdir(path.join(home,entry.name)))await inspect(`${entry.name}/${name}`);
  else await inspect(entry.name);
 }
 return hash(JSON.stringify(state));
}
