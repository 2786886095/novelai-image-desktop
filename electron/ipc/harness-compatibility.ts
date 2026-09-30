import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {HarnessManifest} from './harness-policy';
import {backupHarnessHome} from './harness-backup';

const hash=(bytes:Buffer|string)=>crypto.createHash('sha256').update(bytes).digest('hex');
async function packageFiles(directory:string):Promise<Record<string,string>> {
 const files:Record<string,string>={};
 const walk=async(dir:string)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name),relative=path.relative(directory,file).split(path.sep).join('/');
  if(entry.isSymbolicLink())throw Error(`插件含有尚未支持的内部链接：${path.basename(directory)}/${relative}。原插件保持不变。`);
  if(entry.isDirectory())await walk(file);else if(entry.isFile())files[relative]=hash(await fs.readFile(file));
 }};
 await walk(directory);return files;
}
/** Inventory is a change detector, not an allow-list. Actual retained plugins must
 * boot with the candidate in a separate home before approval can be offered. */
export async function userPluginFingerprint(root:string,_current:HarnessManifest|null,_next:HarnessManifest,_previewSource?:string){
 const home=path.join(root,'user-home'),state:Record<string,unknown>={};
 const walk=async(dir:string)=>{
  let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
  for(const entry of entries){
   const full=path.join(dir,entry.name),relative=path.relative(home,full).split(path.sep).join('/');
   if(entry.isSymbolicLink()){
    const target=await fs.realpath(full),runtime=path.relative(path.resolve(root,'versions'),target);
    if(!runtimeLinkRelative(runtime))throw Error(`插件链接需要单独适配：${relative}。原插件保持不变。`);
    state[relative]=target;
   }else if(entry.isDirectory()){
    if(path.basename(dir)==='node_modules'&&!entry.name.startsWith('@'))state[relative]=await packageFiles(full);
    else if(path.basename(path.dirname(dir))==='node_modules'&&path.basename(dir).startsWith('@'))state[relative]=await packageFiles(full);
    else await walk(full);
   }else if(entry.isFile())state[relative]=hash(await fs.readFile(full));
  }
 };
 await walk(path.join(home,'profiles'));
 // Launcher patches and settings influence the enabled graph even when package bytes do not change.
 for(const name of await fs.readdir(home).catch(e=>{if(e.code==='ENOENT')return [] as string[];throw e;})){
  if(!/\.(?:ya?ml|json)$/.test(name))continue;
  const file=path.join(home,name),stat=await fs.lstat(file);if(stat.isSymbolicLink())throw Error('插件配置含链接：'+name);
  if(stat.isFile())state[name]=hash(await fs.readFile(file));
 }
 return hash(JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a],[b])=>a.localeCompare(b)))));
}

function runtimeLinkRelative(relative:string){
 const parts=relative.split(path.sep);
 return !path.isAbsolute(relative)&&!relative.startsWith('..')&&parts.length>3&&parts[1]==='runtime'&&parts[2]==='node_modules';
}

/** npm may hoist an SDK between releases. Never resolve through the developer's
 * node_modules: candidates must stay inside the candidate runtime itself. */
export async function candidateRuntimeLink(candidate:string,relative:string){
 if(!runtimeLinkRelative(relative))return null;
 const parts=relative.split(path.sep),tail=parts.slice(parts.lastIndexOf('node_modules')+1);
 for(const target of [path.join(candidate,'runtime/node_modules',...parts.slice(3)),path.join(candidate,'runtime/node_modules',...tail)]){
  try{if((await fs.stat(target)).isDirectory())return target;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 return null;
}

/** Copy the real configured home, never execute the probe against the live home.
 * Do not follow external links into user data. SDK links point at candidate code. */
export async function copyHarnessProbeHome(root:string,destination:string,candidate:string){
 const source=path.join(root,'user-home');
 try{await fs.access(source);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 await backupHarnessHome(source,destination);
 const manifest=JSON.parse(await fs.readFile(path.join(destination,'.studio-backup-links.json'),'utf8'));
 for(const link of manifest.links as Array<{path:string;target:string;kind:string}>){
  const relative=path.relative(path.resolve(root,'versions'),link.target);
  if(!runtimeLinkRelative(relative)||link.kind!=='directory')throw Error(`兼容检查未复制外部链接：${link.path}。原资料保持不变。`);
  // Match installation: obsolete dependencies remain in the retained old slot
  // for custom plugins; relocated SDKs use the candidate's hoisted package.
  const target=await candidateRuntimeLink(candidate,relative)??link.target;
  const dest=path.resolve(destination,link.path),rel=path.relative(path.resolve(destination),dest);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Invalid probe link');
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.symlink(path.resolve(target),dest,process.platform==='win32'?'junction':'dir');
 }
}
