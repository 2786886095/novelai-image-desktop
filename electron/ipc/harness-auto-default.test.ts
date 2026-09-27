import {it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSessionControls} from './harness-session-controls';
it('defaults to unlimited automatic generation, persists explicit stop and supports finite limits',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-auto-default-'));
 try{
 const c=createSessionControls(root,()=>[]);
 const req=(tool:string,args={})=>({tool,args,sessionId:'test'});
 expect(await c.read('test')).toMatchObject({mode:'auto',limit:0,remaining:0});
 for(let i=0;i<130;i++)expect(await c.authorize(req('langbai_generate_image',{count:8}))).toBe(true);
 expect((await c.read('test')).remaining).toBe(0);
 await c.execute(req('studio_stop_generation'));
 const restarted=createSessionControls(root,()=>[]);
 expect(await restarted.authorize(req('langbai_generate_image'))).toBe(false);
 await restarted.execute(req('studio_generation_policy',{mode:'auto',limit:2}));
 expect(await restarted.authorize(req('langbai_generate_image',{count:2}))).toBe(true);
 await expect(restarted.authorize(req('langbai_generate_image'))).rejects.toThrow();
 await restarted.execute(req('studio_generation_policy',{mode:'auto',limit:0}));
 expect(await restarted.authorize(req('langbai_generate_image',{count:8}))).toBe(true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
