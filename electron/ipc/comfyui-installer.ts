import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { ComfyManagedEnvironment, ComfySetupPhase } from '../../src/comfyui/setup-contract';
import { assertSafeComfyLocation, assertNoComfyPathLinks, locationContains, type ComfyLocationPolicy } from './comfyui-location-policy';
import { inspectComfyArchive, extractComfyArchive, hashComfyFile, throwIfComfyAborted, type ComfyArchiveManifest, type ComfyArchiveLimits } from './comfyui-archive';

export interface ComfyInstallPackageOptions {
  archivePath: string; target: string; policy: ComfyLocationPolicy; acknowledgeUnverifiedSource: boolean;
  signal?: AbortSignal; executorPath?: string; limits?: Partial<ComfyArchiveLimits>;
  onPhase?: (phase: ComfySetupPhase, message?: string) => void;
  onProgress?: (completed: number, total: number) => void;
  register?: (environment: ComfyManagedEnvironment) => Promise<void>;
}
export interface ComfyInstallFailure extends Error { stagePath?: string; promotedEnvironment?: ComfyManagedEnvironment }
const STAGING_MARKER = '.langbai-comfy-staging.json';
export const COMFY_ENVIRONMENT_MARKER = '.langbai-environment.json';
interface StagingMarker { schema: 1; jobId: string; stage: string; target: string }
async function writeJsonNew(file: string, data: unknown): Promise<void> { const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(data,null,2)+'\n');await handle.sync();}finally{await handle.close();} }
export async function removeOwnedComfyStaging(stage: string, jobId: string): Promise<void> {
  if(!/^[0-9a-f-]{36}$/.test(jobId)||path.basename(stage)!==`.langbai-comfy-staging-${jobId}`)throw new Error('COMFY_INSTALL_STAGING_OWNERSHIP');
  await assertNoComfyPathLinks(stage);const markerPath=path.join(stage,STAGING_MARKER);
  const stat=await fs.lstat(markerPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw new Error('COMFY_INSTALL_STAGING_OWNERSHIP');
  const marker=JSON.parse(await fs.readFile(markerPath,'utf8')) as StagingMarker;
  if(marker.schema!==1||marker.jobId!==jobId||marker.stage!==stage)throw new Error('COMFY_INSTALL_STAGING_OWNERSHIP');
  async function remove(dir: string): Promise<void> { for(const name of await fs.readdir(dir)){const file=path.join(dir,name);const entry=await fs.lstat(file);if(entry.isSymbolicLink())throw new Error('COMFY_INSTALL_STAGING_LINK');if(entry.isDirectory())await remove(file);else if(entry.isFile())await fs.unlink(file);else throw new Error('COMFY_INSTALL_STAGING_SPECIAL');}await fs.rmdir(dir); }
  await remove(stage);
}
function structuralPaths(manifest:ComfyArchiveManifest):{base:string;comfy:string;python:string;launcher:string}{
  const names=new Set(manifest.entries.filter(e=>!e.directory).map(e=>e.name));
  const candidates=[...names].filter(n=>/(?:^|\/)ComfyUI\/main\.py$/.test(n));
  if(candidates.length!==1)throw new Error('COMFY_INSTALL_STRUCTURE_MAIN');
  const main=candidates[0],base=main.slice(0,-'ComfyUI/main.py'.length),comfy=base+'ComfyUI/';
  const python=[base+'python/python.exe',base+'python_embeded/python.exe'].filter(n=>names.has(n));
  const launcher=base+'绘世启动器.exe';
  if(python.length!==1||!names.has(launcher)||!names.has(comfy+'nodes.py')||!names.has(comfy+'folder_paths.py')||![...names].some(n=>n.startsWith(comfy+'comfy/')))throw new Error('COMFY_INSTALL_STRUCTURE');
  // Never discard unreviewed siblings outside the detected bundle wrapper.
  if(manifest.entries.some(e=>base&&!e.name.startsWith(base)&&e.name!==base.slice(0,-1)))throw new Error('COMFY_INSTALL_STRUCTURE_MULTIPLE_ROOTS');
  return {base,comfy,python:python[0],launcher};
}
async function assertMZ(file:string):Promise<void>{const h=await fs.open(file,'r');try{const b=Buffer.alloc(2);if((await h.read(b,0,2,0)).bytesRead!==2||b.toString('ascii')!=='MZ')throw new Error('COMFY_INSTALL_STRUCTURE_EXECUTABLE');}finally{await h.close();}}
async function verifyExtractedTree(root:string,manifest:ComfyArchiveManifest):Promise<void>{
  const expected=new Map(manifest.entries.map(e=>[e.name,e]));let count=0;
  async function walk(dir:string):Promise<void>{for(const name of await fs.readdir(dir)){const file=path.join(dir,name),stat=await fs.lstat(file);if(stat.isSymbolicLink())throw new Error('COMFY_INSTALL_EXTRACTED_LINK');const relative=path.relative(root,file).split(path.sep).join('/');if(!locationContains(root,await fs.realpath(file)))throw new Error('COMFY_INSTALL_EXTRACTED_ESCAPE');if(stat.isDirectory())await walk(file);else{const entry=expected.get(relative);if(!stat.isFile()||!entry||entry.directory||stat.size!==entry.size)throw new Error('COMFY_INSTALL_EXTRACTED_MISMATCH');count++;}}}
  await walk(root);if(count!==manifest.entries.filter(e=>!e.directory).length)throw new Error('COMFY_INSTALL_EXTRACTED_MISSING');
}
/** Import only. Does not run bundled Python, launcher, scripts, pip, git, or model downloaders. */
export async function installComfyPackage(options:ComfyInstallPackageOptions):Promise<ComfyManagedEnvironment>{
  if(options.acknowledgeUnverifiedSource!==true)throw new Error('COMFY_INSTALL_SOURCE_ACK_REQUIRED');
  const jobId=randomUUID();let stage:string|undefined,promoted:ComfyManagedEnvironment|undefined;
  const phase=(value:ComfySetupPhase,message?:string)=>options.onPhase?.(value,message);
  try{
    throwIfComfyAborted(options.signal);phase('preflight');const location=await assertSafeComfyLocation(options.target,options.policy);
    phase('hashing');const manifest=await inspectComfyArchive(options.archivePath,{signal:options.signal,executorPath:options.executorPath,limits:options.limits});
    const structure=structuralPaths(manifest);
    if(manifest.entries.some(e=>path.join(location.parent,`.langbai-comfy-staging-${jobId}`,'content',...e.name.split('/')).length>240))throw new Error('COMFY_INSTALL_PATH_LENGTH');
    const disk=await fs.statfs(location.parent);const available=Number(disk.bavail)*Number(disk.bsize);
    if(!Number.isFinite(available)||available<manifest.totalBytes+Math.max(64*1024**2,manifest.totalBytes*0.05))throw new Error('COMFY_INSTALL_DISK_SPACE');
    // The staging directory is a freshly-created sibling: same volume, never an existing environment.
    stage=path.join(location.parent,`.langbai-comfy-staging-${jobId}`);await fs.mkdir(stage,{mode:0o700});
    await writeJsonNew(path.join(stage,STAGING_MARKER),{schema:1,jobId,stage,target:location.target} satisfies StagingMarker);
    const content=path.join(stage,'content');await fs.mkdir(content,{mode:0o700});phase('extracting');
    await extractComfyArchive(manifest,content,{signal:options.signal,executorPath:options.executorPath,limits:options.limits,onProgress:options.onProgress});
    throwIfComfyAborted(options.signal);phase('validating');await verifyExtractedTree(content,manifest);
    const bundle=path.join(content,...structure.base.split('/').filter(Boolean));
    const python=path.join(content,...structure.python.split('/')),launcher=path.join(content,...structure.launcher.split('/')),main=path.join(content,...(structure.comfy+'main.py').split('/'));
    await assertMZ(python);await assertMZ(launcher);
    const [pythonSha256,launcherSha256,mainSha256]=await Promise.all([hashComfyFile(python,options.signal),hashComfyFile(launcher,options.signal),hashComfyFile(main,options.signal)]);
    const now=new Date().toISOString();
    const env:ComfyManagedEnvironment={id:jobId,root:location.target,python:path.join(location.target,path.relative(bundle,python)),launcherPath:path.join(location.target,path.relative(bundle,launcher)),launcherSha256,modelDirectory:path.join(location.target,'ComfyUI','models'),createdAt:now};
    // This is a local fingerprint, explicitly not publisher authentication or proof that code is safe.
    const receipt={schema:1,jobId,environment:env,source:'user-import',officialHash:null,acknowledgeUnverifiedSource:true,archiveSha256:manifest.sha256,archiveBytes:manifest.bytes,archiveWarnings:manifest.warnings,pythonSha256,launcherSha256,mainSha256,treeDigest:createHash('sha256').update(JSON.stringify(manifest.entries.map(e=>({name:e.name,size:e.size})))).digest('hex'),executedBundledPrograms:false,modelWeights:manifest.entries.filter(e=>/\.(?:safetensors|ckpt|gguf|pt|pth|bin)$/i.test(e.name)&&e.size>16*1024**2).map(e=>({name:e.name,size:e.size}))};
    if(await fs.lstat(path.join(bundle,COMFY_ENVIRONMENT_MARKER)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw new Error('COMFY_INSTALL_RECEIPT_COLLISION');
    await writeJsonNew(path.join(bundle,COMFY_ENVIRONMENT_MARKER),receipt);
    throwIfComfyAborted(options.signal);const rechecked=await assertSafeComfyLocation(location.target,options.policy);
    if(rechecked.parent!==location.parent)throw new Error('COMFY_INSTALL_PARENT_CHANGED');
    if(rechecked.existingEmpty)await fs.rmdir(location.target); // rmdir refuses nonempty; never recursive.
    // Windows rename refuses an existing directory. The immediate second check also protects other hosts.
    if(await fs.lstat(location.target).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw new Error('COMFY_INSTALL_TARGET_EXISTS');
    await fs.rename(bundle,location.target);promoted=env;
    // Cancellation after promotion must not erase a complete environment. Registration can be retried.
    if(options.register)await options.register(env);
    await removeOwnedComfyStaging(stage,jobId);stage=undefined;phase('completed');return env;
  }catch(error){
    const failure=(error instanceof Error?error:new Error(String(error))) as ComfyInstallFailure;
    if(stage){failure.stagePath=stage;try{await writeJsonNew(path.join(stage,'FAILURE.json'),{jobId,message:failure.message,promotedEnvironment:promoted||null,cancelled:!!options.signal?.aborted,at:new Date().toISOString()});}catch{/* Never conceal the original error or expand the write boundary. */}}
    if(promoted)failure.promotedEnvironment=promoted;
    phase(options.signal?.aborted&&!promoted?'cancelled':'failed',failure.message);throw failure;
  }
}
