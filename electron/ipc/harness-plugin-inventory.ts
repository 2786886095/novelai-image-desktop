import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const yaml=require('js-yaml') as {load:(s:string,o:unknown)=>unknown;DEFAULT_SCHEMA:{extend:(types:unknown[])=>unknown};Type:new(name:string,o:unknown)=>unknown};
const expression=Symbol('unevaluated expression');
const schema=yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:()=>expression})]);
const digest=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
export interface PluginReference {name:string;profile:string;file:string;hash:string;index:number;kind?:'row';id?:string}
export const launchPatches=['studio-preview.patch.yml','studio-data.patch.yml','studio-roleplay-default.patch.yml','studio-community.patch.yml','studio.patch.yml'];
async function read(home:string,relative:string){
 const parts=relative.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[\\:]/.test(p)))throw Error('Invalid profile path');
 let current=home;for(const part of parts){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw Error('插件配置含链接：'+relative);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 return fs.readFile(current);
}
/** Parse data only: never evaluate !!js or traverse arbitrary user config objects. */
export function parsePluginRows(source:string){
 if(Buffer.byteLength(source)>4*1024*1024)throw Error('插件配置过大');
 const data=yaml.load(source,{schema,maxAliasCount:100});const rows:Array<{id:string;name?:string;disabled?:boolean|symbol;parents:string[]}>=[];const visited=new Set<object>();
 const walk=(value:unknown,depth=0,parents:string[]=[])=>{
  if(depth>40||rows.length>5000)throw Error('插件配置嵌套过深');
  if(!value||typeof value!=='object'||visited.has(value))return;visited.add(value);
  if(Array.isArray(value)){for(const v of value)walk(v,depth+1,parents);return;}
  const row=value as Record<string,unknown>;
  if(typeof row.id==='string')rows.push({id:row.id,parents,...(typeof row.name==='string'?{name:row.name}:{}),...(row.disabled!==undefined?{disabled:row.disabled===true?true:row.disabled===false?false:expression}:{})});
  if(row.disabled!==undefined&&row.disabled!==false)return;
  if(row.insert)walk(row.insert,depth+1,parents);
  if(row.group===true)walk(row.config,depth+1,typeof row.id==='string'?[...parents,row.id]:parents);
  if(row.children)walk(row.children,depth+1,typeof row.id==='string'?[...parents,row.id]:parents);
 };walk(data);return rows;
}
export async function inventoryPluginReferences(root:string):Promise<PluginReference[]>{
 const home=path.join(root,'user-home');const refs:PluginReference[]=[];
 const dirs=await fs.readdir(path.join(home,'profiles'),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 const names=new Set(['web',...dirs.filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&d.name!=='node_modules').map(d=>d.name)]);
 for(const profile of names){
  const file=`profiles/${profile}/package.json`,raw=await read(home,file);
  if(raw){const bundles=JSON.parse(raw.toString()).dsh?.profile?.bundles;if(Array.isArray(bundles))for(const [index,name]of bundles.entries())if(typeof name==='string')refs.push({name,profile,file,hash:digest(raw),index});}
  const state=new Map<string,{reference?:PluginReference;disabled?:boolean|symbol;parents:string[]}>();
  const patches=[`profiles/${profile}/cordis.patch.yml`,...(profile==='web'?launchPatches:[])];
  for(const relative of patches){const bytes=await read(home,relative);if(!bytes)continue;
   for(const [index,row]of parsePluginRows(bytes.toString()).entries()){
    const before=state.get(row.id);
    state.set(row.id,{
     reference:row.name?{name:row.name,profile,file:relative,hash:digest(bytes),index,kind:'row',id:row.id}:before?.reference,
     disabled:row.disabled??before?.disabled,parents:row.parents.length?row.parents:before?.parents??[],
    });
   }
  }
  for(const row of state.values())if(row.reference&&!row.disabled&&!row.parents.some(id=>state.get(id)?.disabled)){
   refs.push(row.reference);
   // Keep a profile's installed dependency pin in sync even when activation uses a YAML row.
   if(raw&&JSON.parse(raw.toString()).dependencies?.[row.reference.name]&&!refs.some(r=>r.profile===profile&&r.file===file&&r.name===row.reference!.name))refs.push({name:row.reference.name,profile,file,hash:digest(raw),index:0});
  }
 }
 return refs;
}
