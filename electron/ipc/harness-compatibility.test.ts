import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {copyHarnessProbeHome,userPluginFingerprint,candidateRuntimeLink} from './harness-compatibility';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-probe-home-'))await fs.rm(root,{recursive:true,force:true});});
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-probe-home-'));roots.push(root);const home=path.join(root,'user-home'),candidate=path.join(root,'candidate'),probe=path.join(root,'probe/user-home');await fs.mkdir(path.dirname(probe),{recursive:true});
 const write=async(p:string,s:string)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,s)};
 await write(path.join(home,'profiles/node_modules/custom/index.js'),'custom code');await write(path.join(home,'profiles/default.yml'),'custom plugin enabled');
 await write(path.join(home,'sessions/test.json'),'user conversation');return {root,home,candidate,probe,write};}
it('fingerprints unknown code without treating a non-bundled hash as incompatibility',async()=>{
 const f=await fixture(),manifest={files:{}} as any;
 const before=await userPluginFingerprint(f.root,null,manifest);expect(before).toMatch(/^[a-f0-9]{64}$/);
 await f.write(path.join(f.home,'profiles/node_modules/custom/index.js'),'user changed code');
 expect(await userPluginFingerprint(f.root,null,manifest)).not.toBe(before);
});
it('copies actual plugins/configuration/conversations into an independent probe home',async()=>{
 const f=await fixture();await copyHarnessProbeHome(f.root,f.probe,f.candidate);
 expect(await fs.readFile(path.join(f.probe,'profiles/node_modules/custom/index.js'),'utf8')).toBe('custom code');
 expect(await fs.readFile(path.join(f.probe,'profiles/default.yml'),'utf8')).toBe('custom plugin enabled');
 await f.write(path.join(f.probe,'sessions/test.json'),'probe changes');
 expect(await fs.readFile(path.join(f.home,'sessions/test.json'),'utf8')).toBe('user conversation');
});
it('remaps launcher runtime links to candidate SDK; does not follow external links',async()=>{
 const f=await fixture(),old=path.join(f.root,'versions/old/runtime/node_modules/sdk'),next=path.join(f.candidate,'runtime/node_modules/sdk');
 await f.write(path.join(old,'index.js'),'old sdk');await f.write(path.join(next,'index.js'),'new sdk');
 await fs.symlink(old,path.join(f.home,'profiles/node_modules/sdk'),process.platform==='win32'?'junction':'dir');
 await copyHarnessProbeHome(f.root,f.probe,f.candidate);
 expect(await fs.realpath(path.join(f.probe,'profiles/node_modules/sdk'))).toBe(await fs.realpath(next));
 expect(await fs.realpath(path.join(f.home,'profiles/node_modules/sdk'))).toBe(await fs.realpath(old));
 const external=path.join(f.root,'external');await f.write(path.join(external,'index.js'),'external');await fs.symlink(external,path.join(f.home,'profiles/node_modules/external'),process.platform==='win32'?'junction':'dir');
 await expect(userPluginFingerprint(f.root,null,{files:{}} as any)).rejects.toThrow('external');
 await expect(copyHarnessProbeHome(f.root,path.join(f.root,'blocked-home'),f.candidate)).rejects.toThrow('external');
 expect(await fs.readFile(path.join(external,'index.js'),'utf8')).toBe('external');
});
it('reports nested links with the exact plugin/file instead of overwriting them',async()=>{
 const f=await fixture();await fs.mkdir(f.candidate);await fs.symlink(f.candidate,path.join(f.home,'profiles/node_modules/custom/link'),process.platform==='win32'?'junction':'dir');
 await expect(userPluginFingerprint(f.root,null,{files:{}} as any)).rejects.toThrow('custom/link');
});
it('resolves hoisted SDKs inside the candidate and retains absent old dependencies',async()=>{
 const f=await fixture(),old=path.join(f.root,'versions/old/runtime/node_modules/app/node_modules/sdk'),next=path.join(f.candidate,'runtime/node_modules/sdk');
 await f.write(path.join(old,'index.js'),'old');await f.write(path.join(next,'index.js'),'new');
 await fs.symlink(old,path.join(f.home,'profiles/node_modules/sdk'),process.platform==='win32'?'junction':'dir');
 const legacy=path.join(f.root,'versions/old/runtime/node_modules/legacy');await f.write(path.join(legacy,'index.js'),'retained');
 await fs.symlink(legacy,path.join(f.home,'profiles/node_modules/legacy'),process.platform==='win32'?'junction':'dir');
 await copyHarnessProbeHome(f.root,f.probe,f.candidate);
 expect(await fs.realpath(path.join(f.probe,'profiles/node_modules/sdk'))).toBe(await fs.realpath(next));
 expect(await fs.realpath(path.join(f.probe,'profiles/node_modules/legacy'))).toBe(await fs.realpath(legacy));
 expect(await candidateRuntimeLink(f.candidate,path.join('old','runtime','node_modules','not-in-candidate'))).toBe(null);
 expect(await candidateRuntimeLink(f.candidate,path.join('..','external','runtime','node_modules','sdk'))).toBe(null);
});
