import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:(_f:unknown,_a:unknown,_o:unknown,cb:Function)=>cb(null,'ok','')}));
import {HarnessEngine} from './harness-engine';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-confirm-'))await fs.rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-confirm-'));roots.push(root);
 const seed=path.join(root,'seed'),home=path.join(root,'home'),files:Record<string,string>={};
 for(const name of ['node.exe','runtime/bin.js','plugins/studio-brand/index.js','plugins/studio-tools/index.js']){
  const dest=path.join(seed,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,name);files[name]=crypto.createHash('sha256').update(name).digest('hex');
 }
 const manifest={format:1,protocol:1,version:'0.1.0',upstream:'0.1.5',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files};
 await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
 const engine=new HarnessEngine({root:home,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
 await engine.update();
 manifest.version='0.1.1';manifest.upstream='0.1.7';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
 vi.spyOn(engine,'checkUpdates').mockImplementation(async()=>{(engine as any).updateInfo={official:'0.1.7',component:'0.1.1',errors:[],plugins:{},checkedAt:new Date().toISOString()};});
 const probe=vi.spyOn(engine as any,'probePreparedBundle').mockResolvedValue(undefined);
 return {engine,home,seed,manifest,probe};
}
it.each(['component','official'] as const)('%s checks first, requires one-use confirmation, preserves original until approved',async kind=>{
 const {engine,home,probe}=await fixture(),before=await fs.readFile(path.join(home,'active.json'),'utf8');
 const plan=await engine.prepareUpdate(kind);expect(plan.status).toBe('ready');expect(probe).toHaveBeenCalledOnce();
 expect(await fs.readFile(path.join(home,'active.json'),'utf8')).toBe(before);
 await expect(fs.access(path.join(home,'backups'))).rejects.toThrow();
 await engine.applyPreparedUpdate(plan.token!);expect(engine.snapshot().version).toBe('0.1.1');
 expect((await fs.readdir(path.join(home,'backups'))).length).toBe(1);
 await expect(engine.applyPreparedUpdate(plan.token!)).rejects.toThrow();
});
it('does not approve mismatched official version',async()=>{
 const {engine,probe}=await fixture();vi.mocked(engine.checkUpdates).mockImplementation(async()=>{(engine as any).updateInfo={official:'0.1.8'};});
 expect((await engine.prepareUpdate('official')).status).toBe('blocked');expect(probe).not.toHaveBeenCalled();
});
it('custom plugins require a successful candidate probe and remain intact after approval',async()=>{
 const {engine,probe,home}=await fixture();probe.mockRejectedValueOnce(Error('candidate failed'));
 expect((await engine.prepareUpdate('component')).status).toBe('blocked');
 const plugin=path.join(home,'user-home/profiles/node_modules/mine/index.js');await fs.mkdir(path.dirname(plugin),{recursive:true});await fs.writeFile(plugin,'user plugin');
 probe.mockRejectedValueOnce(Error('custom plugin boot failed'));
 expect((await engine.prepareUpdate('component')).status).toBe('blocked');expect(await fs.readFile(plugin,'utf8')).toBe('user plugin');
 const plan=await engine.prepareUpdate('component');expect(plan.status).toBe('ready');
 await engine.applyPreparedUpdate(plan.token!);expect(engine.snapshot().version).toBe('0.1.1');
 expect(await fs.readFile(plugin,'utf8')).toBe('user plugin');
});
it('changed plugins invalidate approval; existing active version remains',async()=>{
 const {engine,home}=await fixture();const plan=await engine.prepareUpdate('official');expect(plan.status).toBe('ready');
 await fs.writeFile(path.join(home,'user-home/profiles/node_modules/@langbai/dsh-studio-brand/index.js'),'changed');
 await engine.applyPreparedUpdate(plan.token!);expect(engine.snapshot().phase).toBe('error');
 expect(engine.snapshot().version).toBe('0.1.0');
});
it('renderer offers confirmation for both routes and removes check-only copy',async()=>{
 const source=await fs.readFile('src/HarnessPage.tsx','utf8');expect(source).toContain("prepare('official')");expect(source).toContain("prepare('component')");expect(source).toContain('await confirmAction');expect(source).not.toContain('仅检测 · 不直接安装');
});

it('official-only update preserves component version and backs up before activation',async()=>{
 const {engine,home,seed,manifest}=await fixture();manifest.version='0.1.0';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
 const before=await fs.readFile(path.join(home,'active.json'),'utf8');
 const proposal=await engine.prepareUpdate('official',async()=>seed);expect(proposal.status).toBe('ready');expect(proposal.version).toBe('0.1.0');
 expect(await fs.readFile(path.join(home,'active.json'),'utf8')).toBe(before);
 await engine.applyPreparedUpdate(proposal.token!);expect(engine.snapshot()).toMatchObject({version:'0.1.0',installedUpstream:'0.1.7'});expect((await fs.readdir(path.join(home,'backups'))).length).toBe(1);
});
it('official compatibility failure preserves the original active slot',async()=>{
 const {engine,home,seed,manifest,probe}=await fixture();manifest.version='0.1.0';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));probe.mockRejectedValue(Error('incompatible'));
 const before=await fs.readFile(path.join(home,'active.json'),'utf8');expect((await engine.prepareUpdate('official',async()=>seed)).status).toBe('blocked');expect(await fs.readFile(path.join(home,'active.json'),'utf8')).toBe(before);
});
it('a component reinstall cannot downgrade an independently upgraded runtime',async()=>{
 const {engine,home,seed,manifest}=await fixture();manifest.upstream='0.1.4';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
 const before=await fs.readFile(path.join(home,'active.json'),'utf8');const result=await engine.prepareUpdate('component',async()=>seed,true);expect(result.status).toBe('blocked');expect(result.message).toContain('较旧');expect(await fs.readFile(path.join(home,'active.json'),'utf8')).toBe(before);
});
