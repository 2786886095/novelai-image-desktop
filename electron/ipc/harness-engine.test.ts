import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:(_file:unknown,_args:unknown,_options:unknown,callback:(e:null,stdout:string,stderr:string)=>void)=>callback(null,'probe passed','')}));
import {HarnessEngine} from './harness-engine';
const roots:string[]=[];
it('seeds browser preview separately and preserves user edits on later starts',async()=>{
 const {engine,seed,home}=await setup();const plugin=path.join(seed,'plugins/studio-preview');await fs.mkdir(plugin,{recursive:true});await fs.writeFile(path.join(plugin,'index.js'),'original preview');
 await (engine as any).seedUserFiles(seed);
 const target=path.join(home,'user-home/profiles/node_modules/@langbai/dsh-studio-preview/index.js');expect(await fs.readFile(target,'utf8')).toBe('original preview');
 const patch=path.join(home,'user-home/studio-preview.patch.yml');expect(await fs.readFile(patch,'utf8')).toContain('@langbai/dsh-studio-preview');
 await fs.writeFile(target,'user customized');await fs.writeFile(patch,'user patch');await (engine as any).seedUserFiles(seed);
 expect(await fs.readFile(target,'utf8')).toBe('user customized');expect(await fs.readFile(patch,'utf8')).toBe('user patch');
});
afterEach(async()=>{for(const root of roots.splice(0))if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-engine-test-'))await fs.rm(root,{recursive:true,force:true});});
async function setup(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-engine-test-'));roots.push(root);
  const seed=path.join(root,'seed');const home=path.join(root,'home');
  const files:Record<string,string>={};
  for(const name of ['node.exe','runtime/bin.js','plugins/studio-brand/index.js','plugins/studio-tools/index.js']){
    const p=path.join(seed,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,'fixture '+name);
    files[name]=crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
  }
  const manifest={format:1,protocol:1,version:'0.1.0',upstream:'test',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files};
  await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
  const engine=new HarnessEngine({root:home,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
  return{root,seed,home,manifest,engine};
}
describe('Independent component update and non-overwrite contract',()=>{
  it('preserves user plugin modifications and creates backup before compatible upgrade',async()=>{
    const {seed,home,manifest,engine}=await setup();await engine.update();expect(engine.snapshot().phase).toBe('stopped');
    const plugin=path.join(home,'user-home/profiles/node_modules/@langbai/dsh-studio-brand/index.js');
    await fs.writeFile(plugin,'user custom brand');const before=await fs.readFile(path.join(home,'active.json'),'utf8');
    const retained=path.join(home,'retained-sdk');await fs.mkdir(retained);await fs.writeFile(path.join(retained,'index.js'),'retained SDK');
    const sdk=path.join(home,'user-home/profiles/node_modules/sdk');await fs.symlink(retained,sdk,process.platform==='win32'?'junction':'dir');
    manifest.version='0.1.1';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
    await engine.update();expect(engine.snapshot().version).toBe('0.1.1');
    expect(await fs.readFile(plugin,'utf8')).toBe('user custom brand');
    expect(await fs.readFile(path.join(home,'previous.json'),'utf8')).toBe(before);
    const backups=await fs.readdir(path.join(home,'backups'));expect(backups).toHaveLength(1);
    expect(await fs.readFile(path.join(home,'backups',backups[0],'profiles/node_modules/@langbai/dsh-studio-brand/index.js'),'utf8')).toBe('user custom brand');
    expect(await fs.readFile(path.join(sdk,'index.js'),'utf8')).toBe('retained SDK');
    const backupManifest=JSON.parse(await fs.readFile(path.join(home,'backups',backups[0],'.studio-backup-links.json'),'utf8'));expect(backupManifest.links.some((link:{path:string})=>link.path.endsWith('sdk'))).toBe(true);
    expect(await fs.readFile(path.join(home,'backups',backups[0],'.studio-backup-active.json'),'utf8')).toBe(before);
    await fs.writeFile(plugin,'current before restore');
    await engine.restoreBackup(path.join(home,'backups',backups[0]));
    expect(engine.snapshot().phase).toBe('stopped');expect(engine.snapshot().version).toBe('0.1.0');
    expect(await fs.readFile(plugin,'utf8')).toBe('user custom brand');
    const saved=await fs.readdir(path.join(home,'restore-preserved'));expect(saved).toHaveLength(1);
    expect(await fs.readFile(path.join(home,'restore-preserved',saved[0],'user-home/profiles/node_modules/@langbai/dsh-studio-brand/index.js'),'utf8')).toBe('current before restore');
    expect(await fs.readFile(path.join(sdk,'index.js'),'utf8')).toBe('retained SDK');
  });
  it('leaves active version and user files unchanged if an update fails integrity',async()=>{
    const {seed,home,manifest,engine}=await setup();await engine.update();const before=await fs.readFile(path.join(home,'active.json'),'utf8');
    manifest.version='0.1.1';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(seed,'node.exe'),'tampered');
    await engine.update();expect(engine.snapshot().phase).toBe('error');expect(await fs.readFile(path.join(home,'active.json'),'utf8')).toBe(before);
  });
  it('bounds log memory and removes secrets',async()=>{
    const {engine}=await setup();for(let i=0;i<900;i++)engine.log('token=secret '+i);
    expect(engine.snapshot().logs).toHaveLength(800);expect(JSON.stringify(engine.snapshot())).not.toContain('secret');
  });
});

it('upgrades an installed older bundle from the software seed even without a remote release',async()=>{
 const {root,seed,home,manifest,engine}=await setup();await engine.update();
 const old=await fs.readFile(path.join(home,'active.json'),'utf8');
 manifest.version='0.1.1';manifest.upstream='0.1.7-rc.2';await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
 const remote=vi.fn().mockResolvedValue(null);
 const next=new HarnessEngine({root:home,seed,workspace:root,updateSource:remote,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
 await next.update();expect(remote).not.toHaveBeenCalled();expect(next.snapshot().version).toBe('0.1.1');expect(await fs.readFile(path.join(home,'previous.json'),'utf8')).toBe(old);
 await next.update();expect(remote).toHaveBeenCalledOnce();expect(next.snapshot().phase).toBe('stopped');
});
