import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {removeHarnessComponent} from './harness-component-removal';
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-removal-perf-'));roots.push(root);
 const slot=path.join(root,'versions','0.1.7-old'),hash=crypto.createHash('sha256').update('owned').digest('hex');
 const files:Record<string,string>={'node.exe':hash,'runtime/bin.js':hash};
 for(let i=0;i<512;i++)files[`runtime/node_modules/deep/old/removed/package/${i}.js`]=hash;
 await fs.mkdir(path.join(slot,'runtime'),{recursive:true});await fs.writeFile(path.join(slot,'node.exe'),'owned');await fs.writeFile(path.join(slot,'runtime/bin.js'),'owned');
 await fs.writeFile(path.join(slot,'manifest.json'),JSON.stringify({format:1,protocol:1,version:'0.1.7',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files}));
 await fs.writeFile(path.join(root,'active.json'),JSON.stringify({slot:'0.1.7-old'}));return {root,slot};
}
it('already removed runtime entries cost one lstat each, not a repeated ancestor walk',async()=>{
 const {root,slot}=await fixture();const spy=vi.spyOn(fs,'lstat');
 await fs.writeFile(path.join(slot,'user-custom.txt'),'retain');
 const result=await removeHarnessComponent(root);
 expect(result.removed).toBe(2);expect(await fs.readFile(path.join(slot,'user-custom.txt'),'utf8')).toBe('retain');
 expect(spy.mock.calls.length).toBeLessThan(600);
});
it.each(['before','scan'])('cancellation %s preflight leaves active descriptor and executable intact',async when=>{
 const {root,slot}=await fixture(),controller=new AbortController();if(when==='before')controller.abort();
 await expect(removeHarnessComponent(root,controller.signal,()=>controller.abort())).rejects.toThrow();
 expect(await fs.readFile(path.join(slot,'node.exe'),'utf8')).toBe('owned');expect(await fs.readFile(path.join(root,'active.json'),'utf8')).toContain('0.1.7-old');
});
it('drains bounded parallel removals without deleting unknown or modified files',async()=>{
 const {root,slot}=await fixture();const unlink=fs.unlink.bind(fs);let pending=0,peak=0;
 vi.spyOn(fs,'unlink').mockImplementation(async file=>{pending++;peak=Math.max(peak,pending);try{await new Promise(r=>setTimeout(r,2));await unlink(file);}finally{pending--;}});
 const result=await removeHarnessComponent(root);expect(result.removed).toBe(2);expect(peak).toBeGreaterThan(1);expect(peak).toBeLessThanOrEqual(8);expect(pending).toBe(0);
 expect(await fs.readFile(path.join(slot,'manifest.json'),'utf8')).toContain('files');
});
