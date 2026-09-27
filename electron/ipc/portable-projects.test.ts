import {afterEach,beforeEach,expect,it} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import JSZip from 'jszip';
import {exportPortableProjects,inspectPortableProjects,restorePortableProjects,validateCapsule,registerPortableBusy,assertPortableIdle,withPortableLock,listPortableRecoveries,portableSummaries,activatePortableRecovery,portableRecoveryPath} from './portable-projects';
let root:string;
const all=new Set(['tavernAgent','styleLab']);
async function put(name:string,text:string){const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text);return p;}
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'portable-projects-'));registerPortableBusy(()=>false);});
afterEach(async()=>{registerPortableBusy(()=>false);if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('portable-projects-'))throw Error('Invalid cleanup');await fs.rm(root,{recursive:true,force:true});});
it('exports native profiles only only with explicit native workspace selection',async()=>{
 await put('TavernAgent/user-home/profiles/custom.yml','SYNTHETIC configuration');
 const excluded=new JSZip();await exportPortableProjects(root,excluded,new Set(['agentWorkspace']));expect(Object.keys(excluded.files)).toHaveLength(0);
 const zip=new JSZip();await exportPortableProjects(root,zip,all);const capsules=await inspectPortableProjects(zip,all);expect(capsules).toHaveLength(1);expect(capsules[0].contents.get('profiles/custom.yml')!.toString()).toBe('SYNTHETIC configuration');
 expect(await inspectPortableProjects(zip,new Set(['agentWorkspace']))).toEqual([]);
});
it('restores fresh native profiles, preserves existing plugins and stages conflicting complete recovery copies',async()=>{
 await put('source/TavernAgent/user-home/profiles/node_modules/custom/index.js','export const synthetic = 1;');const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);const capsules=await inspectPortableProjects(zip,all);
 const fresh=path.join(root,'fresh');await restorePortableProjects(fresh,capsules);expect(await fs.readFile(path.join(fresh,'TavernAgent/user-home/profiles/node_modules/custom/index.js'),'utf8')).toContain('synthetic');
 await put('existing/TavernAgent/user-home/profiles/node_modules/custom/index.js','USER CUSTOM');const paths=await restorePortableProjects(path.join(root,'existing'),capsules);expect(await fs.readFile(path.join(root,'existing/TavernAgent/user-home/profiles/node_modules/custom/index.js'),'utf8')).toBe('USER CUSTOM');expect(await fs.readFile(path.join(paths[0].path,'profiles/node_modules/custom/index.js'),'utf8')).toContain('synthetic');
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
it('does not traverse symlinked files or directories',async()=>{
 await put('outside/secret.txt','NOT EXPORTED');await put('TavernAgent/user-home/own.txt','own');await fs.symlink(path.join(root,'outside'),path.join(root,'TavernAgent/user-home/linked'),process.platform==='win32'?'junction':'dir');
 const zip=new JSZip();await exportPortableProjects(root,zip,all);const [capsule]=await inspectPortableProjects(zip,all);expect([...capsule.contents.keys()]).toEqual(['own.txt']);expect(capsule.manifest.omitted).toContain('linked');
});
it.each(['../escape','/absolute','C:/absolute','CON.txt','a/../b','a\\b','a.'])('rejects invalid portable path %s',async name=>{
 const zip=new JSZip();const data=Buffer.from('x');zip.file('files/'+name,data);zip.file('manifest.json',JSON.stringify({version:1,kind:'agent',files:[{name,bytes:1,hash:crypto.createHash('sha256').update(data).digest('hex')}]}));await expect(validateCapsule(await zip.generateAsync({type:'nodebuffer'}))).rejects.toThrow();
});
it('rejects tampering before creating destination files',async()=>{
 await put('TavernAgent/user-home/own.txt','own');const zip=new JSZip();await exportPortableProjects(root,zip,all);const [entry]=Object.keys(zip.files).filter(n=>n.endsWith('.zip'));zip.file(entry,Buffer.from('bad'));await expect(inspectPortableProjects(zip,all)).rejects.toThrow();
});
it('blocks concurrent startup, running workspaces, and releases locks after errors',async()=>{
 registerPortableBusy(()=>true);await expect(withPortableLock(async()=>{})).rejects.toThrow('Stop');registerPortableBusy(()=>false);
 await withPortableLock(async()=>expect(()=>assertPortableIdle()).toThrow());expect(()=>assertPortableIdle()).not.toThrow();
 await expect(withPortableLock(async()=>{throw Error('synthetic');})).rejects.toThrow('synthetic');expect(()=>assertPortableIdle()).not.toThrow();
});

it('native categories are independent from legacy categories and application credentials',async()=>{
 await put('TavernAgent/user-home/profiles/custom.json','{}');
 const zip=new JSZip();await exportPortableProjects(root,zip,new Set(['tavernAgent']));
 expect(await portableSummaries(zip)).toEqual([{category:'tavernAgent',items:1,bytes:2}]);
 expect(await inspectPortableProjects(zip,new Set(['agentWorkspace','apiCredentials','workspaceData']))).toEqual([]);
 expect(await inspectPortableProjects(zip,new Set(['tavernAgent']))).toHaveLength(1);
});
it('explicit activation preserves current native workspace without changing component or starting a process',async()=>{
 await put('source/TavernAgent/user-home/profiles/custom.json','INCOMING');
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);
 const capsules=await inspectPortableProjects(zip,all);
 await put('target/TavernAgent/user-home/profiles/custom.json','CURRENT');
 await put('target/TavernAgent/active.json','{"slot":"unchanged"}');
 const [recovery]=await restorePortableProjects(path.join(root,'target'),capsules);expect(recovery.status).toBe('staged');
 const result=await activatePortableRecovery(path.join(root,'target'),'agent',recovery.id);
 expect(await fs.readFile(path.join(root,'target/TavernAgent/user-home/profiles/custom.json'),'utf8')).toBe('INCOMING');
 expect(await fs.readFile(path.join(result.preserved,'user-home/profiles/custom.json'),'utf8')).toBe('CURRENT');
 expect(await fs.readFile(path.join(root,'target/TavernAgent/active.json'),'utf8')).toBe('{"slot":"unchanged"}');
});
it('activation refuses busy workspaces, forged identifiers and tampered capsules before touching current data',async()=>{
 await put('source/TavernAgent/user-home/profiles/custom.json','INCOMING');
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);
 const capsules=await inspectPortableProjects(zip,all),target=path.join(root,'target');
 await put('target/TavernAgent/user-home/keep.txt','CURRENT');
 const [r]=await restorePortableProjects(target,capsules);
 registerPortableBusy(()=>true);
 await expect(activatePortableRecovery(target,'agent',r.id)).rejects.toThrow('Stop');
 registerPortableBusy(()=>false);
 await expect(portableRecoveryPath(target,'agent','../escape')).rejects.toThrow('identity');
 await fs.writeFile(path.join(target,'portable-project-capsules',capsules[0].name),'tampered');
 await expect(activatePortableRecovery(target,'agent',r.id)).rejects.toThrow();
 expect(await fs.readFile(path.join(target,'TavernAgent/user-home/keep.txt'),'utf8')).toBe('CURRENT');
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
 await expect(activatePortableRecovery(target,'detective',r.id)).rejects.toThrow('changed');
});

it('ordinary data-only exports are not blocked by a running native Agent',async()=>{
 registerPortableBusy(()=>true);
 await expect(exportPortableProjects(root,new JSZip(),new Set(['imageHistory']))).resolves.toBeUndefined();
});

it('recovery copies remain discoverable after reopening settings without claiming to still be active',async()=>{
 await put('source/TavernAgent/user-home/profiles/custom.json','{}');
 const zip=new JSZip();await exportPortableProjects(path.join(root,'source'),zip,all);
 const target=path.join(root,'target'),capsules=await inspectPortableProjects(zip,all);
 const [r]=await restorePortableProjects(target,capsules);expect(r.status).toBe('restored');
 expect(await listPortableRecoveries(target)).toEqual([{...r,status:'available'}]);
});
