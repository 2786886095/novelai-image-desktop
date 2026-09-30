import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startHarnessBridge} from './harness-bridge';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
it('durably saves the reply before handing execution to the app, even if the handoff closes the bridge',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-handoff-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 let finished!:()=>void;const done=new Promise<void>(resolve=>finished=resolve);
 const afterResponse=vi.fn(async(_request:unknown,_result:unknown,delivered:boolean)=>{
  try{
   expect(delivered).toBe(true);
   const names=await fs.readdir(root);expect(names).toHaveLength(1);
   expect(JSON.parse(await fs.readFile(path.join(root,names[0]),'utf8')).state).toBe('complete');
   await bridge.close();
  }finally{finished();}
 });
 const bridge=await startHarnessBridge({journal:root,tools:['langbai_software_action'],execute:async()=>({ok:true,title:'queued',output:'queued'}),afterResponse});cleanup.push(bridge.close);
 const res=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:`Bearer ${bridge.env.STUDIO_BRIDGE_TOKEN}`},body:JSON.stringify({tool:'langbai_software_action',args:{action:'component.uninstall'},callId:'one',sessionId:'s'})});
 expect((await res.json()).ok).toBe(true);
 await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('handoff did not run')),1000))]);
 expect(afterResponse).toHaveBeenCalledTimes(1);
});
