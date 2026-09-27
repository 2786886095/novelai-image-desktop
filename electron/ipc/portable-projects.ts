import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import type {DataBackupRecovery} from '../../src/types';

// Portable data is never a runtime installer. No junctions, processes or engine
// slots cross the boundary. Plugins travel only with explicit credential consent.
export const CAPSULE_ROOT = 'portable-projects/';
const MAX_FILE = 256 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;
const MAX_FILES = 20000;
type Kind = 'agent' | 'detective';
type Entry = {name:string; hash:string; bytes:number};
type Manifest = {version:1; kind:Kind; files:Entry[]; omitted:string[]};
const hash = (b:Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const busyChecks = new Map<string,()=>boolean>();
let locked = false;
export function registerPortableBusy(check:()=>boolean, name='agent') { busyChecks.set(name,check); }
export function assertPortableIdle() { if (locked) throw Error('Backup/restore in progress'); }
export async function withPortableLock<T>(operation:()=>Promise<T>):Promise<T> {
  if (locked || [...busyChecks.values()].some(check=>check())) throw Error('Stop Tavern Agent and Artist Detective before backing up or restoring their workspaces');
  locked = true;
  try { return await operation(); } finally { locked = false; }
}
function relative(name:string) {
  if (!name || name.length>512 || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(p=>!p || p==='.' || p==='..' || /[. ]$/.test(p) || /[\x00-\x1f<>"|?*]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('Invalid portable path');
  return name;
}
async function exists(p:string) { try { return await fs.lstat(p); } catch(e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return null; throw e; } }
async function plainDirectory(p:string) {
  for(let current=path.resolve(p);;current=path.dirname(current)) {
    const st=await exists(current);
    // macOS system paths are aliases (/var -> /private/var, etc.). Only these
    // OS-owned exact aliases are accepted, never links inside a user workspace.
    const systemAlias=process.platform==='darwin' && ['/var','/tmp','/etc'].includes(current)
      && st?.isSymbolicLink() && await fs.realpath(current)===`/private${current}`;
    if(st && !systemAlias && (st.isSymbolicLink() || !st.isDirectory())) throw Error('Portable destination must not contain links');
    if(path.dirname(current)===current) break;
  }
}
async function pack(kind:Kind, sources:{root:string;prefix:string;filter?:(name:string)=>boolean}[], extra:Map<string,Buffer>) {
  const zip=new JSZip(), files:Entry[]=[], omitted:string[]=[], seen=new Set<string>(); let total=0;
  const add=(name:string,bytes:Buffer)=>{
    relative(name); const key=name.toLowerCase(); if(seen.has(key)) throw Error('Duplicate portable path'); seen.add(key);
    total+=bytes.length; if(bytes.length>MAX_FILE || total>MAX_TOTAL || files.length>=MAX_FILES) throw Error('Portable workspace exceeds size limit');
    files.push({name,hash:hash(bytes),bytes:bytes.length}); zip.file(`files/${name}`,bytes,{compression:'STORE',date:new Date('2000-01-01T00:00:00Z'),createFolders:false});
  };
  for(const source of sources) {
    const walk=async(file:string,name:string):Promise<void>=>{
      const st=await exists(file); if(!st)return;
      if(st.isSymbolicLink()) { omitted.push(name); return; }
      if(st.isDirectory()) { for(const n of (await fs.readdir(file)).sort()) await walk(path.join(file,n),name?`${name}/${n}`:n); }
      else if(st.isFile() && (!source.filter || source.filter(name))) {
        if(st.size>MAX_FILE)throw Error('Portable file exceeds size limit');
        const data=await fs.readFile(file), after=await fs.stat(file);
        if(st.size!==after.size || st.mtimeMs!==after.mtimeMs)throw Error('Workspace changed during backup');
        add(source.prefix+name,data);
      }
    };
    await plainDirectory(path.dirname(source.root)); await walk(source.root,'');
  }
  for(const [name,data] of extra) add(name,data);
  if(!files.length)return null;
  const manifest:Manifest={version:1,kind,files,omitted}; zip.file('manifest.json',JSON.stringify(manifest),{date:new Date('2000-01-01T00:00:00Z')});
  return zip.generateAsync({type:'nodebuffer',compression:'STORE'});
}
export async function validateCapsule(bytes:Buffer, expected?:Kind) {
  if(bytes.length>MAX_TOTAL+10*1024*1024)throw Error('Portable archive too large');
  const zip=await JSZip.loadAsync(bytes); const mf=zip.file('manifest.json');
  if(!mf || (mf as any)._data?.uncompressedSize>8*1024*1024)throw Error('Invalid portable manifest');
  const manifest=JSON.parse(await mf.async('string')) as Manifest;
  if(manifest.version!==1 || !['agent','detective'].includes(manifest.kind) || expected && manifest.kind!==expected || !Array.isArray(manifest.files) || manifest.files.length>MAX_FILES)throw Error('Unsupported portable capsule');
  const contents=new Map<string,Buffer>(),seen=new Set<string>(); let total=0;
  for(const entry of manifest.files) {
    relative(entry.name); if(seen.has(entry.name.toLowerCase()))throw Error('Duplicate portable path'); seen.add(entry.name.toLowerCase());
    if(!Number.isSafeInteger(entry.bytes) || entry.bytes<0 || entry.bytes>MAX_FILE || (total+=entry.bytes)>MAX_TOTAL)throw Error('Invalid portable size');
    const file=zip.file(`files/${entry.name}`);
    if(!file || (file as any)._data?.uncompressedSize!==entry.bytes)throw Error('Portable size mismatch');
    const data=await file.async('nodebuffer'); if(data.length!==entry.bytes || hash(data)!==entry.hash)throw Error('Portable integrity mismatch');
    if(manifest.kind==='detective' && !/^(?:reference\.(?:png|jpg|jpeg|webp)|run\/(?:.*\.(?:png|jpg|jpeg|webp)|status\.json|fixed-prompt\.json|search\/(?:round-\d+|finalists)\.json))$/i.test(entry.name))throw Error('Unexpected detective file');
    contents.set(entry.name,data);
  }
  // A file may not be the parent of another file, even across case variants.
  for(const name of seen) for(let i=name.indexOf('/');i>=0;i=name.indexOf('/',i+1))if(seen.has(name.slice(0,i)))throw Error('Portable path conflict');
  return {manifest,contents,id:hash(bytes)};
}
export async function exportPortableProjects(userData:string, zip:JSZip, selection:Set<string>) {
  if(!selection.has('tavernAgent')&&!selection.has('styleLab'))return;
  return withPortableLock(()=>exportProjects(userData,zip,selection));
}
async function exportProjects(userData:string, zip:JSZip, selection:Set<string>) {
  const add=async(kind:Kind,bytes:Buffer|null)=>{if(bytes)zip.file(`${CAPSULE_ROOT}${kind}-${hash(bytes)}.zip`,bytes,{compression:'STORE'});};
  if(selection.has('tavernAgent')) {
    await add('agent',await pack('agent',[{root:path.join(userData,'TavernAgent/user-home'),prefix:'',filter:n=>!/(?:^|\/)(?:\.cache|logs|tmp)(?:\/|$)|(?:^|\/)(?:.*\.lock|.*\.pid)$/i.test(n)}],new Map()));
  }
  if(selection.has('styleLab')) {
    let config:any={};try{config=JSON.parse(await fs.readFile(path.join(userData,'artist-detective-runtime.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(config.pid) { try{process.kill(config.pid,0);throw Error('Stop Artist Detective before backing up results');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;} }
    const extra=new Map<string,Buffer>();
    if(config.image && /\.(png|jpe?g|webp)$/i.test(config.image)) {const st=await exists(config.image);if(st?.isFile()&&!st.isSymbolicLink()&&st.size<=MAX_FILE)extra.set(`reference${path.extname(config.image).toLowerCase()}`,await fs.readFile(config.image));}
    const sources=config.directory?[{root:config.directory,prefix:'run/',filter:(n:string)=>/\.(png|jpe?g|webp)$/i.test(n)||/^(status\.json|fixed-prompt\.json|search\/(round-\d+|finalists)\.json)$/.test(n)}]:[];
    const bytes=await pack('detective',sources,extra);
    if(bytes) {
      const validated=await validateCapsule(bytes,'detective'); const normalized=new Map<string,Buffer>();
      for(const [name,data] of validated.contents) {
        if(name.endsWith('.json')) {
          const remap=(value:any):any=>{
            if(Array.isArray(value))return value.map(remap);
            if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['pid','token','apiKey','api_key','authorization'].includes(k)).map(([k,v])=>[k,remap(v)]));
            if(typeof value==='string' && config.directory) { const rel=path.relative(config.directory,value).replaceAll('\\','/'); if(validated.contents.has('run/'+rel))return 'portable:'+rel; }
            return value;
          };
          const dataJson=remap(JSON.parse(data.toString('utf8')));if(name==='run/status.json')dataJson.stage='imported';normalized.set(name,Buffer.from(JSON.stringify(dataJson)));
        }else normalized.set(name,data);
      }
      await add('detective',await pack('detective',[],normalized));
    }
  }
  // Capsules brought through a mobile device or conflicting local restore are
  // retained byte-for-byte. Selection gates also apply on every re-export.
  const bridge=path.join(userData,'portable-project-capsules');
  await plainDirectory(bridge);
  for(const name of await fs.readdir(bridge).catch((e)=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(!/^(agent|detective)-[a-f0-9]{64}\.zip$/.test(name))continue;
    const kind=name.startsWith('agent-')?'agent':'detective';
    if(kind==='agent' ? !selection.has('tavernAgent') : !selection.has('styleLab'))continue;
    const st=await fs.lstat(path.join(bridge,name));if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_TOTAL+10*1024*1024)throw Error('Invalid capsule file');
    const bytes=await fs.readFile(path.join(bridge,name)); const valid=await validateCapsule(bytes,kind);
    if(name!==`${kind}-${valid.id}.zip`)throw Error('Capsule filename integrity mismatch');
    zip.file(CAPSULE_ROOT+name,bytes,{compression:'STORE'});
  }
}
export async function inspectPortableProjects(zip:JSZip, selection:Set<string>) {
  const capsules=[];
  for(const [name,file] of Object.entries(zip.files)) {
    if(file.dir || !name.startsWith(CAPSULE_ROOT))continue;
    const match=/^portable-projects\/(agent|detective)-([a-f0-9]{64})\.zip$/.exec(name); if(!match)throw Error('Invalid portable entry');
    const kind=match[1] as Kind;
    if(kind==='agent' ? !selection.has('tavernAgent') : !selection.has('styleLab'))continue;
    if((file as any)._data?.uncompressedSize>MAX_TOTAL+10*1024*1024)throw Error('Capsule too large');
    const bytes=await file.async('nodebuffer'), valid=await validateCapsule(bytes,kind);
    if(valid.id!==match[2])throw Error('Capsule integrity mismatch');
    capsules.push({...valid,bytes,name:path.posix.basename(name)});
  }
  return capsules;
}
export async function restorePortableProjects(userData:string,capsules:Awaited<ReturnType<typeof inspectPortableProjects>>) {
  const recoveryPaths:DataBackupRecovery[]=[];
  if(!capsules.length)return recoveryPaths;
  return withPortableLock(async()=>{
    for(const capsule of capsules) {
      const kind=capsule.manifest.kind;
      const root=path.join(userData,kind==='agent'?'TavernAgent/imports':'artist-detective-imports',capsule.id);
      await plainDirectory(root);await fs.mkdir(root,{recursive:true});
      // Always stage a complete, immutable recovery copy. Existing active data
      // wins; an imported plugin is never loaded during backup restoration.
      for(const [name,original] of capsule.contents) {
        let data=original;
        if(kind==='detective' && name.endsWith('.json')) {
          const rebase=(v:any):any=>Array.isArray(v)?v.map(rebase):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,rebase(w)])):typeof v==='string'&&v.startsWith('portable:')?path.join(root,'run',relative(v.slice(9))):v;
          data=Buffer.from(JSON.stringify(rebase(JSON.parse(data.toString('utf8')))));
        }
        const target=path.join(root,name);await plainDirectory(path.dirname(target));await fs.mkdir(path.dirname(target),{recursive:true});
        const old=await exists(target);if(old){if(!old.isFile()||old.isSymbolicLink()||!(await fs.readFile(target)).equals(data))throw Error('Recovery copy has been modified');}
        else await fs.writeFile(target,data,{flag:'wx'});
      }
      if(kind==='agent') {
        const home=path.join(userData,'TavernAgent/user-home');await plainDirectory(home);
        // Fresh installs restore immediately; existing installations retain
        // their complete active profile and get a separate recovery folder.
        const fresh=!(await exists(home));
        if(fresh)await fs.cp(root,home,{recursive:true,force:false,errorOnExist:true});
        recoveryPaths.push({kind,id:capsule.id,path:root,status:fresh?'restored':'staged'});
      }else{
        const file=path.join(userData,'artist-detective-runtime.json');let c:any={};try{c=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
        const fresh=!c.directory || !(await exists(c.directory));
        if(fresh) {
          c.directory=path.join(root,'run');c.image=[...capsule.contents.keys()].find(n=>n.startsWith('reference.'));if(c.image)c.image=path.join(root,c.image);delete c.pid;
          await fs.writeFile(file,JSON.stringify(c));
        }
        recoveryPaths.push({kind,id:capsule.id,path:root,status:fresh?'restored':'staged'});
      }
      const bridge=path.join(userData,'portable-project-capsules');await plainDirectory(bridge);await fs.mkdir(bridge,{recursive:true});
      const target=path.join(bridge,capsule.name);if(!(await exists(target)))await fs.writeFile(target,capsule.bytes,{flag:'wx'});
      else {const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink()||!(await fs.readFile(target)).equals(capsule.bytes))throw Error('Stored capsule integrity mismatch');}
    }
    return recoveryPaths;
  });
}

export async function portableSummaries(zip:JSZip) {
  const capsules=await inspectPortableProjects(zip,new Set(['tavernAgent','styleLab']));
  return (['agent','detective'] as const).flatMap(kind=>{
    const group=capsules.filter(c=>c.manifest.kind===kind);
    return group.length ? [{
      category:kind==='agent'?'tavernAgent' as const:'styleLab' as const,
      items:group.reduce((n,c)=>n+c.manifest.files.length,0),
      bytes:group.reduce((n,c)=>n+c.manifest.files.reduce((a,f)=>a+f.bytes,0),0),
    }] : [];
  });
}
/** Resolve only immutable, verified capsules previously imported by this app. */
export async function portableRecoveryPath(userData:string,kind:Kind,id:string) {
  if(!['agent','detective'].includes(kind)||!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid recovery identity');
  const bridge=path.join(userData,'portable-project-capsules');await plainDirectory(bridge);
  const file=path.join(bridge,kind+'-'+id+'.zip'),st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_TOTAL+10*1024*1024)throw Error('Invalid recovery capsule');
  const bytes=await fs.readFile(file),valid=await validateCapsule(bytes,kind);
  if(valid.id!==id)throw Error('Recovery integrity mismatch');
  const directory=path.join(userData,kind==='agent'?'TavernAgent/imports':'artist-detective-imports',id);
  await plainDirectory(directory);
  return {directory,valid};
}
/** Explicit activation: retain current state, never execute or start imported code. */
export async function activatePortableRecovery(userData:string,kind:Kind,id:string) {
 return withPortableLock(async()=>{
  const {directory,valid}=await portableRecoveryPath(userData,kind,id);
  // Rebuild from verified bytes, not possibly user-edited recovery files.
  const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
  if(kind==='agent'){
    const base=path.join(userData,'TavernAgent'),stage=path.join(base,'restore-staging-'+stamp);
    const home=path.join(base,'user-home'),preserved=path.join(base,'restore-preserved',stamp);
    await plainDirectory(stage);await plainDirectory(home);await plainDirectory(preserved);
    await fs.mkdir(stage,{recursive:true});
    for(const [name,data] of valid.contents){const target=path.join(stage,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data,{flag:'wx'});}
    await fs.mkdir(preserved,{recursive:true});
    let moved=false;
    try {
      if(await exists(home)){await fs.rename(home,path.join(preserved,'user-home'));moved=true;}
      await fs.rename(stage,home);
    } catch(e){if(moved)await fs.rename(path.join(preserved,'user-home'),home);throw e;}
    return {preserved};
  }
  // Validate staged result bytes (with rebased paths) before binding the project.
  for(const [name,original] of valid.contents) {
    const target=path.join(directory,name);await plainDirectory(path.dirname(target));
    const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink())throw Error('Invalid recovery result');
    let expected=original;
    if(name.endsWith('.json')){
      const rebase=(v:any):any=>Array.isArray(v)?v.map(rebase):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,rebase(w)])):typeof v==='string'&&v.startsWith('portable:')?path.join(directory,'run',relative(v.slice(9))):v;
      expected=Buffer.from(JSON.stringify(rebase(JSON.parse(original.toString('utf8')))));
    }
    if(!(await fs.readFile(target)).equals(expected))throw Error('Recovery result has changed');
  }
  const file=path.join(userData,'artist-detective-runtime.json');let c:any={};let old:Buffer|null=null;
  try{old=await fs.readFile(file);c=JSON.parse(old.toString('utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const preserved=path.join(userData,'artist-detective-preserved',stamp);await plainDirectory(preserved);await fs.mkdir(preserved,{recursive:true});
  if(old)await fs.writeFile(path.join(preserved,'artist-detective-runtime.json'),old,{flag:'wx'});
  c.directory=path.join(directory,'run');const ref=[...valid.contents.keys()].find(n=>n.startsWith('reference.'));
  if(ref)c.image=path.join(directory,ref);else delete c.image;
  delete c.pid;
  const temp=file+'.'+stamp+'.tmp';await fs.writeFile(temp,JSON.stringify(c),{flag:'wx'});await fs.rename(temp,file);
  return {preserved};
 });
}

export async function listPortableRecoveries(userData:string):Promise<DataBackupRecovery[]> {
 const bridge=path.join(userData,'portable-project-capsules');await plainDirectory(bridge);
 const names=await fs.readdir(bridge).catch((e)=>{if(e.code==='ENOENT')return [];throw e;});
 const result:DataBackupRecovery[]=[];
 for(const name of names.sort()){
   const match=/^(agent|detective)-([a-f0-9]{64})\.zip$/.exec(name);if(!match)continue;
   const kind=match[1] as Kind,id=match[2];
   const {directory}=await portableRecoveryPath(userData,kind,id);
   if(!(await exists(directory)))continue;
   // A past import is not evidence that current user data still matches it.
   result.push({kind,id,path:directory,status:'available'});
 }
 return result;
}
