import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import type {DataBackupRecovery} from '../../src/types';

// Portable data is never a runtime installer. No junctions, processes or engine
// slots cross the boundary. Archives from older versions may also carry capsules
// of the removed local Agent component; those are ignored, never restored.
export const CAPSULE_ROOT = 'portable-projects/';
const MAX_FILE = 256 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;
const MAX_FILES = 20000;
type Kind = 'detective';
type Entry = {name:string; hash:string; bytes:number};
type Manifest = {version:1; kind:Kind; files:Entry[]; omitted:string[]};
const hash = (b:Buffer) => crypto.createHash('sha256').update(b).digest('hex');
// Failures people see: data-backup shows them after its own Chinese context and the
// Artist Detective IPC rejects with them. Match these constants, not their wording.
export const PORTABLE_ERRORS = {
  busy: '正在备份或恢复数据，请等待完成后再试。',
  detectiveRunning: '请先停止目标画风自动迭代（Artist Detective），再备份或恢复画风结果。',
  invalidPath: '画风结果包含无效的文件路径。',
  linkedDestination: '画风结果的保存目录不能包含链接（符号链接或目录联接）。',
  duplicatePath: '画风结果包含重复的文件路径。',
  workspaceTooLarge: '画风结果超过备份的大小或文件数量上限。',
  fileTooLarge: '画风结果中有文件超过大小上限。',
  changedDuringBackup: '备份期间画风结果发生了变化，请重新备份。',
  archiveTooLarge: '画风结果包过大。',
  invalidManifest: '画风结果包缺少有效的清单。',
  unsupported: '不支持此画风结果包（版本或类型不符）。',
  invalidSize: '画风结果包记录的文件大小无效。',
  sizeMismatch: '画风结果包中的文件大小与清单不符。',
  integrity: '画风结果包完整性校验失败。',
  unexpectedFile: '画风结果包含不属于 Artist Detective 的文件。',
  pathConflict: '画风结果包的文件路径相互冲突。',
  invalidCapsuleFile: '恢复目录中的画风结果包无效。',
  capsuleNameMismatch: '恢复目录中画风结果包的文件名与内容不符。',
  invalidEntry: '备份中的画风结果条目无效。',
  capsuleTooLarge: '备份中的画风结果包过大。',
  capsuleIntegrity: '备份中的画风结果包完整性校验失败。',
  recoveryCopyModified: '已有的画风恢复副本被修改过，未覆盖。',
  storedCapsuleIntegrity: '已保存的画风结果包完整性校验失败。',
  invalidRecoveryIdentity: '恢复副本标识无效。',
  invalidRecoveryCapsule: '恢复副本的画风结果包无效。',
  recoveryIntegrity: '恢复副本完整性校验失败。',
  invalidRecoveryResult: '恢复副本中的结果文件无效。',
  recoveryResultChanged: '恢复副本中的结果文件已被修改，未切换。',
} as const;
const busyChecks = new Map<string,()=>boolean>();
let locked = false;
export function registerPortableBusy(check:()=>boolean, name='detective') { busyChecks.set(name,check); }
export function assertPortableIdle() { if (locked) throw Error(PORTABLE_ERRORS.busy); }
export async function withPortableLock<T>(operation:()=>Promise<T>):Promise<T> {
  if (locked || [...busyChecks.values()].some(check=>check())) throw Error(PORTABLE_ERRORS.detectiveRunning);
  locked = true;
  try { return await operation(); } finally { locked = false; }
}
function relative(name:string) {
  if (!name || name.length>512 || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(p=>!p || p==='.' || p==='..' || /[. ]$/.test(p) || /[\x00-\x1f<>"|?*]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error(PORTABLE_ERRORS.invalidPath);
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
    if(st && !systemAlias && (st.isSymbolicLink() || !st.isDirectory())) throw Error(PORTABLE_ERRORS.linkedDestination);
    if(path.dirname(current)===current) break;
  }
}
async function pack(kind:Kind, sources:{root:string;prefix:string;filter?:(name:string)=>boolean}[], extra:Map<string,Buffer>) {
  const zip=new JSZip(), files:Entry[]=[], omitted:string[]=[], seen=new Set<string>(); let total=0;
  const add=(name:string,bytes:Buffer)=>{
    relative(name); const key=name.toLowerCase(); if(seen.has(key)) throw Error(PORTABLE_ERRORS.duplicatePath); seen.add(key);
    total+=bytes.length; if(bytes.length>MAX_FILE || total>MAX_TOTAL || files.length>=MAX_FILES) throw Error(PORTABLE_ERRORS.workspaceTooLarge);
    files.push({name,hash:hash(bytes),bytes:bytes.length}); zip.file(`files/${name}`,bytes,{compression:'STORE',date:new Date('2000-01-01T00:00:00Z'),createFolders:false});
  };
  for(const source of sources) {
    const walk=async(file:string,name:string):Promise<void>=>{
      const st=await exists(file); if(!st)return;
      if(st.isSymbolicLink()) { omitted.push(name); return; }
      if(st.isDirectory()) { for(const n of (await fs.readdir(file)).sort()) await walk(path.join(file,n),name?`${name}/${n}`:n); }
      else if(st.isFile() && (!source.filter || source.filter(name))) {
        if(st.size>MAX_FILE)throw Error(PORTABLE_ERRORS.fileTooLarge);
        const data=await fs.readFile(file), after=await fs.stat(file);
        if(st.size!==after.size || st.mtimeMs!==after.mtimeMs)throw Error(PORTABLE_ERRORS.changedDuringBackup);
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
  if(bytes.length>MAX_TOTAL+10*1024*1024)throw Error(PORTABLE_ERRORS.archiveTooLarge);
  const zip=await JSZip.loadAsync(bytes); const mf=zip.file('manifest.json');
  if(!mf || (mf as any)._data?.uncompressedSize>8*1024*1024)throw Error(PORTABLE_ERRORS.invalidManifest);
  const manifest=JSON.parse(await mf.async('string')) as Manifest;
  if(manifest.version!==1 || manifest.kind!=='detective' || expected && manifest.kind!==expected || !Array.isArray(manifest.files) || manifest.files.length>MAX_FILES)throw Error(PORTABLE_ERRORS.unsupported);
  const contents=new Map<string,Buffer>(),seen=new Set<string>(); let total=0;
  for(const entry of manifest.files) {
    relative(entry.name); if(seen.has(entry.name.toLowerCase()))throw Error(PORTABLE_ERRORS.duplicatePath); seen.add(entry.name.toLowerCase());
    if(!Number.isSafeInteger(entry.bytes) || entry.bytes<0 || entry.bytes>MAX_FILE || (total+=entry.bytes)>MAX_TOTAL)throw Error(PORTABLE_ERRORS.invalidSize);
    const file=zip.file(`files/${entry.name}`);
    if(!file || (file as any)._data?.uncompressedSize!==entry.bytes)throw Error(PORTABLE_ERRORS.sizeMismatch);
    const data=await file.async('nodebuffer'); if(data.length!==entry.bytes || hash(data)!==entry.hash)throw Error(PORTABLE_ERRORS.integrity);
    if(!/^(?:reference\.(?:png|jpg|jpeg|webp)|run\/(?:.*\.(?:png|jpg|jpeg|webp)|status\.json|fixed-prompt\.json|search\/(?:round-\d+|finalists)\.json))$/i.test(entry.name))throw Error(PORTABLE_ERRORS.unexpectedFile);
    contents.set(entry.name,data);
  }
  // A file may not be the parent of another file, even across case variants.
  for(const name of seen) for(let i=name.indexOf('/');i>=0;i=name.indexOf('/',i+1))if(seen.has(name.slice(0,i)))throw Error(PORTABLE_ERRORS.pathConflict);
  return {manifest,contents,id:hash(bytes)};
}
export async function exportPortableProjects(userData:string, zip:JSZip, selection:Set<string>) {
  if(!selection.has('styleLab'))return;
  return withPortableLock(()=>exportProjects(userData,zip));
}
async function exportProjects(userData:string, zip:JSZip) {
  const add=async(kind:Kind,bytes:Buffer|null)=>{if(bytes)zip.file(`${CAPSULE_ROOT}${kind}-${hash(bytes)}.zip`,bytes,{compression:'STORE'});};
  let config:any={};try{config=JSON.parse(await fs.readFile(path.join(userData,'artist-detective-runtime.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(config.pid) { try{process.kill(config.pid,0);throw Error(PORTABLE_ERRORS.detectiveRunning);}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;} }
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
  // Capsules brought through a mobile device or conflicting local restore are
  // retained byte-for-byte on every re-export.
  const bridge=path.join(userData,'portable-project-capsules');
  await plainDirectory(bridge);
  for(const name of await fs.readdir(bridge).catch((e)=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(!/^detective-[a-f0-9]{64}\.zip$/.test(name))continue;
    const st=await fs.lstat(path.join(bridge,name));if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_TOTAL+10*1024*1024)throw Error(PORTABLE_ERRORS.invalidCapsuleFile);
    const bytes=await fs.readFile(path.join(bridge,name)); const valid=await validateCapsule(bytes,'detective');
    if(name!==`detective-${valid.id}.zip`)throw Error(PORTABLE_ERRORS.capsuleNameMismatch);
    zip.file(CAPSULE_ROOT+name,bytes,{compression:'STORE'});
  }
}
export async function inspectPortableProjects(zip:JSZip, selection:Set<string>) {
  const capsules=[];
  for(const [name,file] of Object.entries(zip.files)) {
    if(file.dir || !name.startsWith(CAPSULE_ROOT))continue;
    const match=/^portable-projects\/(agent|detective)-([a-f0-9]{64})\.zip$/.exec(name); if(!match)throw Error(PORTABLE_ERRORS.invalidEntry);
    if(match[1]!=='detective' || !selection.has('styleLab'))continue;
    if((file as any)._data?.uncompressedSize>MAX_TOTAL+10*1024*1024)throw Error(PORTABLE_ERRORS.capsuleTooLarge);
    const bytes=await file.async('nodebuffer'), valid=await validateCapsule(bytes,'detective');
    if(valid.id!==match[2])throw Error(PORTABLE_ERRORS.capsuleIntegrity);
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
      const root=path.join(userData,'artist-detective-imports',capsule.id);
      await plainDirectory(root);await fs.mkdir(root,{recursive:true});
      // Always stage a complete, immutable recovery copy. Existing active data wins.
      for(const [name,original] of capsule.contents) {
        let data=original;
        if(name.endsWith('.json')) {
          const rebase=(v:any):any=>Array.isArray(v)?v.map(rebase):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,rebase(w)])):typeof v==='string'&&v.startsWith('portable:')?path.join(root,'run',relative(v.slice(9))):v;
          data=Buffer.from(JSON.stringify(rebase(JSON.parse(data.toString('utf8')))));
        }
        const target=path.join(root,name);await plainDirectory(path.dirname(target));await fs.mkdir(path.dirname(target),{recursive:true});
        const old=await exists(target);if(old){if(!old.isFile()||old.isSymbolicLink()||!(await fs.readFile(target)).equals(data))throw Error(PORTABLE_ERRORS.recoveryCopyModified);}
        else await fs.writeFile(target,data,{flag:'wx'});
      }
      const file=path.join(userData,'artist-detective-runtime.json');let c:any={};try{c=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      const fresh=!c.directory || !(await exists(c.directory));
      if(fresh) {
        c.directory=path.join(root,'run');c.image=[...capsule.contents.keys()].find(n=>n.startsWith('reference.'));if(c.image)c.image=path.join(root,c.image);delete c.pid;
        await fs.writeFile(file,JSON.stringify(c));
      }
      recoveryPaths.push({kind,id:capsule.id,path:root,status:fresh?'restored':'staged'});
      const bridge=path.join(userData,'portable-project-capsules');await plainDirectory(bridge);await fs.mkdir(bridge,{recursive:true});
      const target=path.join(bridge,capsule.name);if(!(await exists(target)))await fs.writeFile(target,capsule.bytes,{flag:'wx'});
      else {const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink()||!(await fs.readFile(target)).equals(capsule.bytes))throw Error(PORTABLE_ERRORS.storedCapsuleIntegrity);}
    }
    return recoveryPaths;
  });
}

export async function portableSummaries(zip:JSZip) {
  const capsules=await inspectPortableProjects(zip,new Set(['styleLab']));
  return capsules.length ? [{
    category:'styleLab' as const,
    items:capsules.reduce((n,c)=>n+c.manifest.files.length,0),
    bytes:capsules.reduce((n,c)=>n+c.manifest.files.reduce((a,f)=>a+f.bytes,0),0),
  }] : [];
}
/** Resolve only immutable, verified capsules previously imported by this app. */
export async function portableRecoveryPath(userData:string,kind:Kind,id:string) {
  if(kind!=='detective'||!/^[a-f0-9]{64}$/.test(id))throw Error(PORTABLE_ERRORS.invalidRecoveryIdentity);
  const bridge=path.join(userData,'portable-project-capsules');await plainDirectory(bridge);
  const file=path.join(bridge,kind+'-'+id+'.zip'),st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_TOTAL+10*1024*1024)throw Error(PORTABLE_ERRORS.invalidRecoveryCapsule);
  const bytes=await fs.readFile(file),valid=await validateCapsule(bytes,kind);
  if(valid.id!==id)throw Error(PORTABLE_ERRORS.recoveryIntegrity);
  const directory=path.join(userData,'artist-detective-imports',id);
  await plainDirectory(directory);
  return {directory,valid};
}
/** Explicit activation: retain current state, never execute or start imported code. */
export async function activatePortableRecovery(userData:string,kind:Kind,id:string) {
 return withPortableLock(async()=>{
  const {directory,valid}=await portableRecoveryPath(userData,kind,id);
  // Rebuild from verified bytes, not possibly user-edited recovery files.
  const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
  // Validate staged result bytes (with rebased paths) before binding the project.
  for(const [name,original] of valid.contents) {
    const target=path.join(directory,name);await plainDirectory(path.dirname(target));
    const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink())throw Error(PORTABLE_ERRORS.invalidRecoveryResult);
    let expected=original;
    if(name.endsWith('.json')){
      const rebase=(v:any):any=>Array.isArray(v)?v.map(rebase):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,rebase(w)])):typeof v==='string'&&v.startsWith('portable:')?path.join(directory,'run',relative(v.slice(9))):v;
      expected=Buffer.from(JSON.stringify(rebase(JSON.parse(original.toString('utf8')))));
    }
    if(!(await fs.readFile(target)).equals(expected))throw Error(PORTABLE_ERRORS.recoveryResultChanged);
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
   const match=/^detective-([a-f0-9]{64})\.zip$/.exec(name);if(!match)continue;
   const kind:Kind='detective',id=match[1];
   const {directory}=await portableRecoveryPath(userData,kind,id);
   if(!(await exists(directory)))continue;
   // A past import is not evidence that current user data still matches it.
   result.push({kind,id,path:directory,status:'available'});
 }
 return result;
}
