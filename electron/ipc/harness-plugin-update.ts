import {inventoryPluginReferences,launchPatches} from './harness-plugin-inventory';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {updateFetch} from './download-request';
import {safeBundlePath,type HarnessManifest} from './harness-policy';
import type {HarnessPluginChoice} from '../../src/harness-types';
const semver=require('semver') as {satisfies:(v:string,r:string)=>boolean;gt:(a:string,b:string)=>boolean;rcompare:(a:string,b:string)=>number;valid:(v:string)=>string|null;prerelease:(v:string)=>unknown};
const sha=(v:Buffer|string)=>crypto.createHash('sha256').update(v).digest('hex');
export const pluginName=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export interface PluginMeta {name:string;version:string;peerDependencies?:Record<string,string>;deprecated?:string;dist:{tarball:string;integrity:string};[key:string]:unknown}
export interface PluginChange extends HarnessPluginChoice {beforeHash:string;directory:string;profiles:Array<{file:string;hash:string;index:number;kind?:'row';id?:string}>;meta?:PluginMeta;action?:'upgrade'|'disable'}
const absent=(e:unknown)=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;};
async function plain(root:string,relative:string){
 const full=safeBundlePath(root,relative);let current=path.resolve(root);
 for(const part of relative.split('/')){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('插件路径含链接，请保留现状并手动检查：'+relative);}
 return full;
}
async function filesIn(directory:string){
 const entries:Record<string,string>={};let count=0;
 async function walk(dir:string,rel=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(++count>100000)throw Error('插件文件数量超出检查上限');
  const file=path.join(dir,entry.name),name=rel+entry.name;
  if(entry.isSymbolicLink())throw Error('插件包含链接：'+name);
  if(entry.isDirectory())await walk(file,name+'/');else if(entry.isFile())entries[name]=sha(await fs.readFile(file));
 }}await walk(directory);return Object.fromEntries(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)));
}
export async function pluginFingerprint(directory:string){return sha(JSON.stringify(await filesIn(directory)));}
export function rejectsRuntime(meta:Pick<PluginMeta,'peerDependencies'>,version:string){
 const ranges=Object.entries(meta.peerDependencies??{}).filter(([name])=>name.startsWith('@deepseek-ai/dsh-'));
 return ranges.some(([,range])=>!semver.satisfies(version,range));
}
export function compatibleRelease(name:string,current:string,target:string,versions:Record<string,PluginMeta>){
 return Object.values(versions).filter(m=>m.name===name&&semver.valid(m.version)&&semver.valid(current)&&semver.gt(m.version,current)&&!m.deprecated&&(!semver.prerelease(m.version)||!!semver.prerelease(current))&&Object.keys(m.peerDependencies??{}).some(n=>n.startsWith('@deepseek-ai/dsh-'))&&!rejectsRuntime(m,target)).sort((a,b)=>semver.rcompare(a.version,b.version))[0];
}
/** Include declared bundles AND ordinary enabled configuration rows. */
export async function planPluginUpgrades(root:string,target:string,signal:AbortSignal,includeCompatible=false):Promise<PluginChange[]>{
 const home=path.join(root,'user-home'),found=new Map<string,PluginChange>();
 for(const ref of await inventoryPluginReferences(root)){
  signal.throwIfAborted();const {name,profile,...reference}=ref;
  if(!pluginName.test(name)||name.startsWith('@deepseek-ai/')||name.startsWith('@langbai/'))continue;
  let directory=`profiles/${profile}/node_modules/${name}`,pkg=await plain(home,directory+'/package.json').catch(absent);
  if(!pkg){directory=`profiles/node_modules/${name}`;pkg=await plain(home,directory+'/package.json').catch(absent);}if(!pkg)continue;
  const meta=JSON.parse(await fs.readFile(pkg,'utf8')) as PluginMeta;
  if(meta.name!==name||!semver.valid(meta.version))continue;
  const incompatible=rejectsRuntime(meta,target);if(!includeCompatible&&!incompatible)continue;
  const existing=found.get(directory);if(existing){existing.profiles.push(reference);if(ref.kind==='row')existing.canDisable=false;continue;}
  const change:PluginChange={name,fromVersion:meta.version,description:typeof meta.description==='string'?meta.description.slice(0,320):undefined,directory,beforeHash:await pluginFingerprint(path.dirname(pkg)),profiles:[reference],incompatible,reason:incompatible?`${name} ${meta.version} 的 Harness 版本声明不包含 ${target}`:'当前版本声明兼容',canDisable:ref.kind!=='row'};
  try{
   const response=await updateFetch('https://registry.npmjs.org/'+encodeURIComponent(name),{signal});if(!response.ok)throw Error('HTTP '+response.status);
   const registry=await response.json() as {versions:Record<string,PluginMeta>};const next=compatibleRelease(name,meta.version,target,registry.versions??{});
   if(next){const url=new URL(next.dist.tarball);if(url.origin!=='https://registry.npmjs.org'||url.username||url.password||url.hash||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(next.dist.integrity))throw Error('包来源或校验信息无效');change.meta=next;change.version=next.version;change.reason+='；发现兼容新版';}
   else change.reason+='；尚未找到声明兼容的更新版本';
  }catch(error){signal.throwIfAborted();change.checkError=true;change.reason+='；插件更新检查失败：'+(error instanceof Error?error.message:String(error));}
  found.set(directory,change);
 }
 const changes=[...found.values()];for(const c of changes)if(changes.some(other=>other.name===c.name&&other.version!==c.version)){delete c.meta;delete c.version;c.reason+='；多个配置的插件版本不同，请单独处理';}
 return changes;
}
export function selectPluginChanges(plan:PluginChange[],disable:string[]=[]){
 if(!Array.isArray(disable)||disable.some(n=>typeof n!=='string'||!plan.some(p=>p.name===n&&p.canDisable)))throw Error('禁用选择已失效，请重新检查');
 return plan.filter(p=>p.meta||disable.includes(p.name)).map(p=>({...p,action:disable.includes(p.name)?'disable' as const:'upgrade' as const}));
}
/** Bundle the runtime dependency closure, including hoisted dependencies, without install scripts. */
export async function stagePluginPackages(runtime:string,target:string,changes:PluginChange[],files:Record<string,string>,signal:AbortSignal){
 const modules=path.join(runtime,'node_modules');
 async function locate(from:string,name:string){
  if(!pluginName.test(name))throw Error('Invalid dependency name');
  for(let dir=from;dir.startsWith(path.resolve(runtime));dir=path.dirname(dir)){
   const candidate=path.join(dir,'node_modules',name);if(await fs.stat(path.join(candidate,'package.json')).catch(absent))return candidate;
   if(dir===path.resolve(runtime))break;
  }throw Error('插件依赖缺失：'+name);
 }
 let count=0;
 async function vendor(source:string,dest:string,ancestors:Map<string,string>){
  signal.throwIfAborted();if(++count>2000)throw Error('插件依赖数量异常');
  const meta=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
  const closure=new Map(ancestors);closure.set(meta.name,meta.version);
  await fs.cp(source,dest,{recursive:true,errorOnExist:true,force:false,filter:async file=>{
   if(path.relative(source,file).split(path.sep).includes('node_modules'))return false;
   if((await fs.lstat(file)).isSymbolicLink())throw Error('插件依赖包含链接');return true;
  }});
  const deps={...meta.dependencies,...meta.optionalDependencies};
  for(const [name]of Object.entries(deps)){
   signal.throwIfAborted();if(name.startsWith('@deepseek-ai/'))continue;
   let dep:string;try{dep=await locate(source,name);}catch(e){if(meta.optionalDependencies?.[name])continue;throw e;}
   const info=JSON.parse(await fs.readFile(path.join(dep,'package.json'),'utf8'));
   if(closure.get(name)===info.version)continue;
   await vendor(dep,path.join(dest,'node_modules',name),closure);
  }
 }
 const staged=new Set<string>();
 for(const change of changes){if(change.action!=='upgrade'||staged.has(change.name))continue;staged.add(change.name);
  const source=path.join(modules,change.name),meta=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
  if(meta.name!==change.name||meta.version!==change.version)throw Error('插件候选版本与确认不符');
  const relative='plugin-updates/'+change.name,dest=safeBundlePath(target,relative);await vendor(source,dest,new Map());
  for(const [name,hash]of Object.entries(await filesIn(dest)))files[relative+'/'+name]=hash;
 }
}
export function validatePluginChanges(changes:unknown):asserts changes is PluginChange[]{
 if(!Array.isArray(changes)||changes.length>100)throw Error('Invalid plugin changes');
 for(const c of changes as PluginChange[]){
  if(!pluginName.test(c.name)||c.name.startsWith('@deepseek-ai/')||c.name.startsWith('@langbai/')||!['upgrade','disable'].includes(c.action??'')||!c.directory?.startsWith('profiles/')||!c.directory.endsWith('/node_modules/'+c.name)||!/^[a-f0-9]{64}$/.test(c.beforeHash)||!Array.isArray(c.profiles)||!c.profiles.length)throw Error('Invalid plugin change');
  safeBundlePath('home',c.directory);
  if(c.action==='upgrade'&&(!c.version||!semver.valid(c.version)))throw Error('Invalid plugin version');
  for(const p of c.profiles){const valid=p.kind==='row'?(launchPatches.includes(p.file)||/^profiles\/[^/\\:.]+\/cordis\.patch\.yml$/.test(p.file)):/^profiles\/[^/\\:.]+\/package\.json$/.test(p.file);if(!valid||!/^[a-f0-9]{64}$/.test(p.hash)||!Number.isInteger(p.index)||p.index<0||p.kind==='row'&&c.action==='disable')throw Error('Invalid plugin profile');}
 }
}
/** Transactional changes run identically in the isolated probe and the live install. */
export async function applyPluginUpgrades(root:string,bundle:string,manifest:HarnessManifest){
 const changes=manifest.pluginChanges??[];validatePluginChanges(changes);
 const home=path.join(root,'user-home'),undo:Array<()=>Promise<void>>=[];
 const rollback=async()=>{for(const restore of undo.reverse())await restore();};
 const profiles=new Map<string,{bytes:Buffer;value:any}>();
 // Check ALL approved originals before the first write, including profile edits.
 for(const c of changes){
  const source=await plain(home,c.directory);
  if(await pluginFingerprint(source)!==c.beforeHash)throw Error('确认后插件发生变化：'+c.name);
  for(const p of c.profiles){const bytes=await fs.readFile(await plain(home,p.file));if(sha(bytes)!==p.hash)throw Error('确认后插件配置发生变化');if(p.kind!=='row')profiles.set(p.file,{bytes,value:JSON.parse(bytes.toString())});}
 }
 try{
  for(const c of changes){
   if(c.action==='disable'){for(const p of c.profiles){const value=profiles.get(p.file)!.value;value.dsh.profile.bundles=value.dsh.profile.bundles.filter((n:string)=>n!==c.name);}continue;}
   const prefix='plugin-updates/'+c.name+'/',entries=Object.entries(manifest.files).filter(([n])=>n.startsWith(prefix));
   if(!entries.some(([n])=>n===prefix+'package.json'))throw Error('插件候选文件缺失');
   const target=await plain(home,c.directory),id=crypto.randomBytes(8).toString('hex');
   const staging=path.join(root,'plugin-staging',id),previous=path.join(root,'plugin-previous',id);await fs.mkdir(staging,{recursive:true});await fs.mkdir(path.dirname(previous),{recursive:true});
   for(const [name,expected]of entries){const data=await fs.readFile(await plain(bundle,name));if(sha(data)!==expected)throw Error('插件候选校验失败');const file=safeBundlePath(staging,name.slice(prefix.length));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data,{flag:'wx'});}
   const pkg=JSON.parse(await fs.readFile(path.join(staging,'package.json'),'utf8'));if(pkg.name!==c.name||pkg.version!==c.version)throw Error('插件版本不符');
   await fs.rename(target,previous);let swapped=false;
   undo.push(async()=>{if(swapped)await fs.rename(target,staging);await fs.rename(previous,target);});
   await fs.rename(staging,target);swapped=true;
   for(const p of c.profiles){if(p.kind==='row')continue;const value=profiles.get(p.file)!.value;if(value.dependencies?.[c.name])value.dependencies[c.name]=c.version;}
  }
  if(changes.length){
   const receiptFile=path.join(home,'studio-plugin-changes.json'),before=await fs.readFile(receiptFile).catch(absent);
   // Backup-based restore retains plugin bytes and all original configuration.
   undo.push(async()=>{if(before)await fs.writeFile(receiptFile,before);else await fs.unlink(receiptFile).catch(absent);});
   await fs.writeFile(receiptFile,JSON.stringify({time:new Date().toISOString(),changes:changes.map(({name,fromVersion,version,action,profiles})=>({name,fromVersion,version,action,profiles:profiles.map(p=>p.file)}))},null,2));
   for(const [file,{bytes,value}]of profiles){const target=await plain(home,file);undo.push(()=>fs.writeFile(target,bytes));await fs.writeFile(target,JSON.stringify(value,null,2)+'\n');}
  }
  return {rollback};
 }catch(error){await rollback();throw error;}
}
