import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:(_f:unknown,_a:unknown,_o:unknown,cb:(e:null,stdout:string,stderr:string)=>void)=>cb(null,'ok','')}));
import {HarnessEngine} from './harness-engine';
import {pluginFingerprint} from './harness-plugin-update';
import {userPluginFingerprint} from './harness-compatibility';
const roots:string[]=[];const sha=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
afterEach(async()=>{vi.restoreAllMocks();for(const r of roots.splice(0))if(path.dirname(r)===os.tmpdir()&&path.basename(r).startsWith('plugin-tx-'))await fs.rm(r,{recursive:true,force:true});});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'plugin-tx-'));roots.push(root);
 const write=async(n:string,s:string)=>{const f=path.join(root,n);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,s);};
 const manifest={format:1,protocol:1,version:'0.1.7',upstream:'0.2.0-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files:{'node.exe':sha('fixture node'),'runtime/bin.js':sha('fixture cli')}};
 for(const name of ['plugins/studio-brand/index.js','plugins/studio-tools/index.js']){(manifest.files as Record<string,string>)[name]=sha('fixture plugin');await write('versions/old/'+name,'fixture plugin');await write('candidate/'+name,'fixture plugin');}
 await write('versions/old/node.exe','fixture node');await write('versions/old/runtime/bin.js','fixture cli');await write('versions/old/manifest.json',JSON.stringify(manifest));await write('active.json',JSON.stringify({slot:'old'}));
 const profile='- insert:\n    - id: demo\n      name: demo-plugin\n';await write('user-home/studio.patch.yml',profile);await write('user-home/profiles/node_modules/demo-plugin/package.json',JSON.stringify({name:'demo-plugin',version:'1.0.0'}));await write('user-home/sessions/keep.json','conversation');
 const next=JSON.stringify({name:'demo-plugin',version:'1.1.0'});const change={name:'demo-plugin',fromVersion:'1.0.0',version:'1.1.0',canDisable:false,reason:'fixture',action:'upgrade',directory:'profiles/node_modules/demo-plugin',beforeHash:await pluginFingerprint(path.join(root,'user-home/profiles/node_modules/demo-plugin')),profiles:[{file:'studio.patch.yml',hash:sha(profile),kind:'row',id:'demo',index:0}]};
 const candidate={...manifest,files:{...manifest.files,'plugin-updates/demo-plugin/package.json':sha(next)},pluginChanges:[change]};
 await write('candidate/node.exe','fixture node');await write('candidate/runtime/bin.js','fixture cli');await write('candidate/plugin-updates/demo-plugin/package.json',next);await write('candidate/manifest.json',JSON.stringify(candidate));
 const engine=new HarnessEngine({root,seed:path.join(root,'versions/old'),workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
 const active=await fs.readFile(path.join(root,'active.json'),'utf8');return {root,engine,active,write,candidate,manifest};
}
it('backs up before download, probes before install, retains runtime/config and can restore the old plugin',async()=>{
 const f=await fixture(),events:string[]=[];
 vi.spyOn(f.engine as any,'probePreparedBundle').mockImplementation(async()=>{events.push('probe');expect((await fs.readdir(path.join(f.root,'backups'))).length).toBe(1);});
 const install=(f.engine as any).install.bind(f.engine);vi.spyOn(f.engine as any,'install').mockImplementation(async(...args:unknown[])=>{events.push('install');return install(...args);});
 await f.engine.updatePlugins(async()=>{events.push('download');expect((await fs.readdir(path.join(f.root,'backups'))).length).toBe(1);return path.join(f.root,'candidate');},new AbortController().signal);
 expect(events).toEqual(['download','probe','install']);expect(f.engine.snapshot().phase).toBe('stopped');
 const pkg=()=>fs.readFile(path.join(f.root,'user-home/profiles/node_modules/demo-plugin/package.json'),'utf8').then(JSON.parse);expect((await pkg()).version).toBe('1.1.0');
 expect(await fs.readFile(path.join(f.root,'user-home/sessions/keep.json'),'utf8')).toBe('conversation');
 const slot=JSON.parse(await fs.readFile(path.join(f.root,'active.json'),'utf8')).slot;const m=JSON.parse(await fs.readFile(path.join(f.root,'versions',slot,'manifest.json'),'utf8'));expect(m.upstream).toBe('0.2.0-rc.2');
 const backup=(await fs.readdir(path.join(f.root,'backups')))[0];await f.engine.restoreBackup(path.join(f.root,'backups',backup));expect((await pkg()).version).toBe('1.0.0');
});
it.each(['failed','changed','cancelled'])('does not commit a %s candidate',async mode=>{
 const f=await fixture(),controller=new AbortController();const install=vi.spyOn(f.engine as any,'install');
 vi.spyOn(f.engine as any,'probePreparedBundle').mockImplementation(async()=>{if(mode==='failed')throw Error('probe failure');if(mode==='changed')await f.write('user-home/studio.patch.yml','- id: demo\n  disabled: true\n');if(mode==='cancelled')controller.abort();});
 await expect(f.engine.updatePlugins(async()=>path.join(f.root,'candidate'),controller.signal)).rejects.toThrow();expect(install).not.toHaveBeenCalled();expect(await fs.readFile(path.join(f.root,'active.json'),'utf8')).toBe(f.active);
 expect(JSON.parse(await fs.readFile(path.join(f.root,'user-home/profiles/node_modules/demo-plugin/package.json'),'utf8')).version).toBe('1.0.0');
});
it('rejects an update while live without stopping or downloading',async()=>{const f=await fixture();(f.engine as any).child={};const download=vi.fn();const stop=vi.spyOn(f.engine,'stop');await expect(f.engine.updatePlugins(download,new AbortController().signal)).rejects.toThrow('正在运行');expect(download).not.toHaveBeenCalled();expect(stop).not.toHaveBeenCalled();(f.engine as any).child=null;});
it('includes profile configuration in the compatibility fingerprint',async()=>{const f=await fixture();const before=await userPluginFingerprint(f.root,null,f.manifest as any);await f.write('user-home/profiles/web/cordis.patch.yml','- id: changed\n  name: plugin\n');expect(await userPluginFingerprint(f.root,null,f.manifest as any)).not.toBe(before);});
it('rejects a running-but-degraded candidate in the isolated probe',async()=>{const f=await fixture();vi.spyOn(HarnessEngine.prototype,'start').mockImplementation(async function(this:HarnessEngine){(this as any).phase='running';this.log('dsh: disabling profile plugin row "demo": incompatible');});vi.spyOn(HarnessEngine.prototype,'stop').mockResolvedValue();await expect((f.engine as any).probePreparedBundle(path.join(f.root,'candidate'),new AbortController().signal)).rejects.toThrow('启动检查未通过');expect(await fs.readFile(path.join(f.root,'active.json'),'utf8')).toBe(f.active);});
