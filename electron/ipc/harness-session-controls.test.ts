import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {createSessionControls} from './harness-session-controls';
it('isolates styles, defaults to automatic, persists explicit session choices, bounds concurrent quota, cancels only owner',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-session-'));let stopped=0;
 try{
 const presets=[{id:'p',name:'测试风格',prompt:'watercolor',group:'Default',rating:0,previewImages:[]}];
 const c=createSessionControls(root,()=>presets as any,()=>stopped++);
 const req=(tool:string,sessionId:string,args={})=>({tool,sessionId,args});
 expect((await c.read('A')).mode).toBe('auto');
 expect((await c.execute(req('studio_set_session_style','A',{presetId:'p'}))).ok).toBe(true);
 expect((await c.read('A')).style?.prompt).toBe('watercolor');expect((await c.read('B')).style).toBe(null);
 expect(await c.authorize(req('langbai_generate_image','B'))).toBe(true);
 expect((await c.execute(req('studio_generation_policy','A',{mode:'auto',limit:2}))).ok).toBe(true);
 const results=await Promise.allSettled([1,2,3].map(()=>c.authorize(req('langbai_generate_image','A',{count:1}))));
 expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(2);expect((await c.read('A')).remaining).toBe(0);
 expect((await createSessionControls(root,()=>presets as any).read('A')).mode).toBe('auto');
 expect((await createSessionControls(root,()=>presets as any).read('A')).style?.id).toBe('p');
 const signal=c.begin('A');expect(()=>c.begin('B')).toThrow();
 await c.execute(req('studio_stop_generation','B'));expect(stopped).toBe(0);expect(signal.aborted).toBe(false);
 await c.execute(req('studio_stop_generation','A'));expect(stopped).toBe(1);expect(signal.aborted).toBe(true);c.end('A');
 expect((await c.execute(req('studio_generation_policy','A',{mode:'auto',limit:-1}))).ok).toBe(false);
 expect((await c.execute(req('studio_session_state','../escape'))).ok).toBe(false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
it('returns actual registered preview images, never accepts caller file paths',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-preview-'));
 try{const file=path.join(root,'preview.png');await sharp({create:{width:640,height:800,channels:3,background:'#acf'}}).png().toFile(file);
 const c=createSessionControls(root,()=>[{id:'p',name:'p',prompt:'p',previewImages:[{id:'im',name:'image',filePath:file}]}] as any);
 const result=await c.execute({tool:'studio_style_preview',args:{presetId:'p'},sessionId:'ui'});expect(result.ok).toBe(true);const data=result.data as any;expect(data.dataUrl).toMatch(/^data:image\/jpeg;base64,/);expect(JSON.stringify(data)).not.toContain(root);
 const info=await sharp(Buffer.from(data.dataUrl.split(',')[1],'base64')).metadata();expect(info.height).toBeLessThanOrEqual(320);
 expect((await c.execute({tool:'studio_style_preview',args:{presetId:'unknown',filePath:file}})).ok).toBe(false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

it('owned stop overrides global cancellation and stale lease end cannot clear a replacement',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-session-'));let global=0,owned=0;
 try{const c=createSessionControls(root,()=>[],()=>{global++;});const old=c.begin('A',()=>{owned++;});c.end('A',old);const fresh=c.begin('A',()=>{owned++;});c.end('A',old);expect(()=>c.begin('B')).toThrow();
 await c.execute({tool:'studio_stop_generation',sessionId:'B',args:{}});expect(owned).toBe(0);
 await c.execute({tool:'studio_stop_generation',sessionId:'A',args:{}});expect(owned).toBe(1);expect(global).toBe(0);expect(fresh.aborted).toBe(true);c.end('A',fresh);const b=c.begin('B');c.end('B',b);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
