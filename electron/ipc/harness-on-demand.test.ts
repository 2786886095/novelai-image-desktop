import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {HarnessEngine} from './harness-engine';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-demand-'));roots.push(root);
 const downloaded=path.join(root,'downloaded');await fs.mkdir(downloaded);
 const files:Record<string,string>={};
 for(const name of ['node.exe','bin.js']){await fs.writeFile(path.join(downloaded,name),name);files[name]=crypto.createHash('sha256').update(name).digest('hex');}
 const manifest={format:1,protocol:1,version:'0.1.7',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'bin.js',files};
 await fs.writeFile(path.join(downloaded,'manifest.json'),JSON.stringify(manifest));
 const download=vi.fn().mockResolvedValue(downloaded);
 const engine=new HarnessEngine({root:path.join(root,'home'),seed:path.join(root,'absent-seed'),workspace:root,updateSource:download,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
 return {root,engine,download,downloaded,manifest};
}
it('small desktop distribution does not bundle the runtime or depend on a build-machine seed',async()=>{
 const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
 expect(pkg.build.win.extraResources.some((r:{to:string})=>r.to==='harness-seed')).toBe(false);
});
it('start never downloads implicitly and preserves the home',async()=>{
 const {root,engine,download}=await fixture();
 await fs.mkdir(path.join(root,'home'),{recursive:true});await fs.writeFile(path.join(root,'home','user-data.txt'),'keep');
 download.mockRejectedValueOnce(Error('offline'));
 await engine.start();expect(download).not.toHaveBeenCalled();
 expect(engine.snapshot().phase).toBe('error');expect(engine.snapshot().logs.some(x=>x.text.includes('安装'))).toBe(true);
 expect(await fs.readFile(path.join(root,'home','user-data.txt'),'utf8')).toBe('keep');
 await expect(fs.access(path.join(root,'home','active.json'))).rejects.toThrow();
});
it('an incomplete old bundled seed falls back to verified independent download',async()=>{
 const {root,engine,download,downloaded,manifest}=await fixture();
 const seed=path.join(root,'absent-seed');await fs.mkdir(seed);await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
 const source=await (engine as any).availableSource(null,new AbortController().signal);
 expect(source).toBe(downloaded);expect(download).toHaveBeenCalledOnce();
});
it('tampered remote source is rejected, never bypassing integrity checks',async()=>{
 const {engine,downloaded}=await fixture();await fs.writeFile(path.join(downloaded,'node.exe'),'tampered');
 await expect((engine as any).availableSource(null,new AbortController().signal)).rejects.toThrow('integrity');
});
it('cancellation stops before fallback download',async()=>{
 const {engine,download}=await fixture();const abort=new AbortController();abort.abort();
 await expect((engine as any).availableSource(null,abort.signal)).rejects.toThrow();expect(download).not.toHaveBeenCalled();
});
