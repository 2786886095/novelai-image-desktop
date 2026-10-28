import {afterEach,beforeEach,expect,it} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import JSZip from 'jszip';
import {PORTABLE_ERRORS,exportPortableProjects,inspectPortableProjects,restorePortableProjects,validateCapsule,registerPortableBusy,assertPortableIdle,withPortableLock,listPortableRecoveries,portableSummaries,activatePortableRecovery,portableRecoveryPath} from './portable-projects';
let root:string;
const all=new Set(['styleLab']);
const sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
async function put(name:string,text:string){const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text);return p;}
// Synthetic Artist Detective run: one result image, its status and the runtime binding.
async function detectiveRun(base:string,image='synthetic image'){
 const png=await put(base+'/runs/a/result.png',image);
 await put(base+'/runs/a/status.json',JSON.stringify({stage:'complete',completed:1}));
 await put(base+'/artist-detective-runtime.json',JSON.stringify({directory:path.dirname(png)}));
 return png;
}
async function capsule(kind:string,files:Record<string,string>){
 const zip=new JSZip();const entries=Object.entries(files).map(([name,text])=>{const data=Buffer.from(text);zip.file('files/'+name,data);return {name,bytes:data.length,hash:sha(data)};});
 zip.file('manifest.json',JSON.stringify({version:1,kind,files:entries,omitted:[]}));return zip.generateAsync({type:'nodebuffer'});
}
const capsuleNames=(zip:JSZip)=>Object.entries(zip.files).filter(([,file])=>!file.dir).map(([name])=>name);
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'portable-projects-'));registerPortableBusy(()=>false);});
afterEach(async()=>{registerPortableBusy(()=>false);if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('portable-projects-'))throw Error('Invalid cleanup');await fs.rm(root,{recursive:true,force:true});});
it('exports Artist Detective results only with explicit style lab selection',async()=>{
 await detectiveRun('.');
 const excluded=new JSZip();await exportPortableProjects(root,excluded,new Set(['agentWorkspace','tavernAgent']));expect(Object.keys(excluded.files)).toHaveLength(0);
 const zip=new JSZip();await exportPortableProjects(root,zip,all);const capsules=await inspectPortableProjects(zip,all);expect(capsules).toHaveLength(1);expect(capsules[0].manifest.kind).toBe('detective');expect(capsules[0].contents.get('run/result.png')!.toString()).toBe('synthetic image');
 expect(capsuleNames(zip).every(name=>/^portable-projects\/detective-[a-f0-9]{64}\.zip$/.test(name))).toBe(true);
 expect(await inspectPortableProjects(zip,new Set(['agentWorkspace','tavernAgent']))).toEqual([]);
});
it('restores fresh results, stages a complete copy beside existing results and repeats idempotently',async()=>{
 await detectiveRun('source');const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);const capsules=await inspectPortableProjects(zip,all);
 const fresh=path.join(root,'fresh');const [restored]=await restorePortableProjects(fresh,capsules);expect(restored.status).toBe('restored');
 const bound=JSON.parse(await fs.readFile(path.join(fresh,'artist-detective-runtime.json'),'utf8'));expect(bound.directory).toBe(path.join(restored.path,'run'));expect(await fs.readFile(path.join(bound.directory,'result.png'),'utf8')).toBe('synthetic image');
 const current=await detectiveRun('existing','USER CURRENT');const before=await fs.readFile(path.join(root,'existing/artist-detective-runtime.json'),'utf8');
 const [staged]=await restorePortableProjects(path.join(root,'existing'),capsules);expect(staged.status).toBe('staged');
 expect(await fs.readFile(path.join(root,'existing/artist-detective-runtime.json'),'utf8')).toBe(before);expect(await fs.readFile(current,'utf8')).toBe('USER CURRENT');expect(await fs.readFile(path.join(staged.path,'run/result.png'),'utf8')).toBe('synthetic image');
 await restorePortableProjects(path.join(root,'existing'),capsules); // idempotent
});
it('moves reference/results and rebinds image paths without inheriting pid, models or runtime',async()=>{
 const png=await put('source/runs/a/result.png','synthetic image');const ref=await put('reference.png','synthetic reference');
 await put('source/runs/a/search/round-1.json',JSON.stringify({results:[{renders:[{image:png,score:.5}]}]}));await put('source/runs/a/status.json',JSON.stringify({stage:'running',pid:888,completed:1}));await put('source/artist-detective-runtime.json',JSON.stringify({python:'old.exe',assets:'old-assets',directory:path.dirname(png),image:ref}));
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);const capsules=await inspectPortableProjects(zip,all);
 await put('target/artist-detective-runtime.json',JSON.stringify({python:'LOCAL.exe',assets:'LOCAL-assets'}));await restorePortableProjects(path.join(root,'target'),capsules);
 const config=JSON.parse(await fs.readFile(path.join(root,'target/artist-detective-runtime.json'),'utf8'));expect(config.python).toBe('LOCAL.exe');expect(config.pid).toBeUndefined();expect(await fs.readFile(config.image,'utf8')).toBe('synthetic reference');
 const record=JSON.parse(await fs.readFile(path.join(config.directory,'search/round-1.json'),'utf8'));expect(await fs.readFile(record.results[0].renders[0].image,'utf8')).toBe('synthetic image');expect(JSON.parse(await fs.readFile(path.join(config.directory,'status.json'),'utf8')).stage).toBe('imported');
});
it('does not traverse symlinked directories',async()=>{
 await put('outside/secret.png','NOT EXPORTED');const own=await detectiveRun('.');await fs.symlink(path.join(root,'outside'),path.join(path.dirname(own),'linked'),process.platform==='win32'?'junction':'dir');
 const zip=new JSZip();await exportPortableProjects(root,zip,all);const [capsule]=await inspectPortableProjects(zip,all);expect([...capsule.contents.keys()].sort()).toEqual(['run/result.png','run/status.json']);
});
it.each(['run/../escape.png','/run/absolute.png','C:/run/absolute.png','run/CON.png','run/a/../b.png','run/a\\b.png','run/a./b.png'])('rejects invalid portable path %s',async name=>{
 await expect(validateCapsule(await capsule('detective',{[name]:'x'}))).rejects.toThrow();
});
it('accepts a valid detective capsule but rejects unexpected files and removed Agent component capsules',async()=>{
 await expect(validateCapsule(await capsule('detective',{'run/ok.png':'x'}))).resolves.toMatchObject({manifest:{kind:'detective'}});
 await expect(validateCapsule(await capsule('detective',{'profiles/custom.yml':'x'}))).rejects.toThrow(PORTABLE_ERRORS.unexpectedFile);
 await expect(validateCapsule(await capsule('agent',{'profiles/custom.yml':'x'}))).rejects.toThrow(PORTABLE_ERRORS.unsupported);
});
it('rejects tampering before creating destination files',async()=>{
 await detectiveRun('.');const zip=new JSZip();await exportPortableProjects(root,zip,all);const [entry]=Object.keys(zip.files).filter(n=>n.endsWith('.zip'));zip.file(entry,Buffer.from('bad'));await expect(inspectPortableProjects(zip,all)).rejects.toThrow();
});
it('blocks concurrent startup, running workspaces, and releases locks after errors',async()=>{
 registerPortableBusy(()=>true);await expect(withPortableLock(async()=>{})).rejects.toThrow(PORTABLE_ERRORS.detectiveRunning);registerPortableBusy(()=>false);
 await withPortableLock(async()=>expect(()=>assertPortableIdle()).toThrow(PORTABLE_ERRORS.busy));expect(()=>assertPortableIdle()).not.toThrow();
 await expect(withPortableLock(async()=>{throw Error('synthetic');})).rejects.toThrow('synthetic');expect(()=>assertPortableIdle()).not.toThrow();
});

it('the style lab category is independent from legacy categories and application credentials',async()=>{
 await detectiveRun('.');
 const zip=new JSZip();await exportPortableProjects(root,zip,new Set(['styleLab']));
 const [exported]=await inspectPortableProjects(zip,all);expect(exported.manifest.files).toHaveLength(2);
 expect(await portableSummaries(zip)).toEqual([{category:'styleLab',items:2,bytes:exported.manifest.files.reduce((n,f)=>n+f.bytes,0)}]);
 expect(await inspectPortableProjects(zip,new Set(['agentWorkspace','tavernAgent','apiCredentials','workspaceData']))).toEqual([]);
 expect(await inspectPortableProjects(zip,new Set(['styleLab']))).toHaveLength(1);
});
it('activation refuses busy runs, forged identifiers, removed kinds and tampered capsules before touching current data',async()=>{
 await detectiveRun('source');
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);
 const capsules=await inspectPortableProjects(zip,all),target=path.join(root,'target');
 await detectiveRun('target','CURRENT');const before=await fs.readFile(path.join(target,'artist-detective-runtime.json'),'utf8');
 const [r]=await restorePortableProjects(target,capsules);expect(r.status).toBe('staged');
 registerPortableBusy(()=>true);
 await expect(activatePortableRecovery(target,'detective',r.id)).rejects.toThrow(PORTABLE_ERRORS.detectiveRunning);
 registerPortableBusy(()=>false);
 await expect(portableRecoveryPath(target,'detective','../escape')).rejects.toThrow(PORTABLE_ERRORS.invalidRecoveryIdentity);
 await expect(portableRecoveryPath(target,'agent' as any,r.id)).rejects.toThrow(PORTABLE_ERRORS.invalidRecoveryIdentity);
 await fs.writeFile(path.join(target,'portable-project-capsules',capsules[0].name),'tampered');
 await expect(activatePortableRecovery(target,'detective',r.id)).rejects.toThrow();
 expect(await fs.readFile(path.join(target,'artist-detective-runtime.json'),'utf8')).toBe(before);
});
it('style activation retains previous binding and rejects edited recovery images',async()=>{
 const image=await put('source/run/output.png','PNG FIXTURE');
 await put('source/run/status.json','{"stage":"complete","completed":1}');
 await put('source/artist-detective-runtime.json',JSON.stringify({directory:path.dirname(image),image}));
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,new Set(['styleLab']));
 const capsules=await inspectPortableProjects(zip,all),target=path.join(root,'target');
 const current=await put('target/current/original.png','CURRENT');
 await put('target/artist-detective-runtime.json',JSON.stringify({directory:path.dirname(current),python:'LOCAL',assets:'LOCAL'}));
 const [r]=await restorePortableProjects(target,capsules);expect(r.status).toBe('staged');
 const result=await activatePortableRecovery(target,'detective',r.id);
 const after=JSON.parse(await fs.readFile(path.join(target,'artist-detective-runtime.json'),'utf8'));
 expect(after.python).toBe('LOCAL');expect(after.directory).toBe(path.join(r.path,'run'));
 expect(JSON.parse(await fs.readFile(path.join(result.preserved,'artist-detective-runtime.json'),'utf8')).directory).toBe(path.dirname(current));
 await fs.writeFile(path.join(r.path,'run/output.png'),'EDITED');
 await expect(activatePortableRecovery(target,'detective',r.id)).rejects.toThrow(PORTABLE_ERRORS.recoveryResultChanged);
});

it('ordinary data-only exports are not blocked by a running Artist Detective',async()=>{
 registerPortableBusy(()=>true);
 await expect(exportPortableProjects(root,new JSZip(),new Set(['imageHistory']))).resolves.toBeUndefined();
});

it('recovery copies remain discoverable after reopening settings without claiming to still be active',async()=>{
 await detectiveRun('source');
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);
 const target=path.join(root,'target'),capsules=await inspectPortableProjects(zip,all);
 const [r]=await restorePortableProjects(target,capsules);expect(r.status).toBe('restored');
 expect(await listPortableRecoveries(target)).toEqual([{...r,status:'available'}]);
});

it('legacy Agent component capsules from older archives are ignored, never restored or re-exported',async()=>{
 const legacy=await capsule('agent',{'profiles/custom.yml':'LEGACY AGENT PROFILE'}),name=`agent-${sha(legacy)}.zip`;
 const old=new JSZip();old.file('portable-projects/'+name,legacy);
 expect(await inspectPortableProjects(old,new Set(['styleLab','tavernAgent']))).toEqual([]);
 expect(await portableSummaries(old)).toEqual([]);
 await fs.mkdir(path.join(root,'portable-project-capsules'),{recursive:true});await fs.writeFile(path.join(root,'portable-project-capsules',name),legacy);
 expect(await listPortableRecoveries(root)).toEqual([]);
 const zip=new JSZip();await exportPortableProjects(root,zip,new Set(['styleLab','tavernAgent']));expect(capsuleNames(zip)).toEqual([]);
 await expect(fs.stat(path.join(root,'TavernAgent'))).rejects.toMatchObject({code:'ENOENT'});
});
it('reports every failure in Chinese from one table',async()=>{
 // data-backup and the Artist Detective IPC show these after their own Chinese context.
 const source=await fs.readFile(path.join('electron','ipc','portable-projects.ts'),'utf8');
 expect(source.match(/Error\((?!PORTABLE_ERRORS\.)[^)]*\)/g)).toBeNull();
 for(const message of Object.values(PORTABLE_ERRORS))expect(message).toMatch(/[\u4e00-\u9fff]/);
 await expect(validateCapsule(await capsule('detective',{'run/../x.png':'x'}))).rejects.toThrow(PORTABLE_ERRORS.invalidPath);
});
