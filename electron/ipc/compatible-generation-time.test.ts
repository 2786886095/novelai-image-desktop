import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const fixture=vi.hoisted(()=>({settings:{} as any,history:[] as any[],generate:vi.fn()}));
vi.mock('./store',()=>({getSettings:()=>fixture.settings,getHistoryGroups:()=>[],addHistory:(items:any[])=>fixture.history.push(...items),setCompatibleImageSettings:vi.fn(),setSetting:vi.fn()}));
vi.mock('./openai-images',()=>({generateCompatibleImages:fixture.generate}));
vi.mock('./proxy',()=>({proxyConfigForUrl:vi.fn()}));
import {generateConfiguredImages} from './compatible-generation';
let root:string,bytes:Buffer;
beforeEach(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'favorites-completion-fixture-'));
 bytes=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).png().toBuffer();
 fixture.settings={outputDir:root,imageProvider:'openai-images',imageApiKey:'fixture-only',compatibleImage:{baseUrl:'https://fixture.invalid/v1',model:'nai-diffusion-5-full',size:'1024x1024',responseFormat:'auto',extensions:{}}};
 fixture.history=[];fixture.generate.mockReset();
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T01:00:00.000Z'));
});
afterEach(async()=>{vi.useRealTimers();if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('favorites-completion-fixture-'))throw Error('unsafe fixture path');await fs.rm(root,{recursive:true,force:true});});
it.each([true,false])('timestamps saved compatible output after result receipt, including partial batch complete=%s',async complete=>{
 fixture.generate.mockImplementation(async()=>{vi.setSystemTime(new Date('2026-10-14T01:00:30.000Z'));return {images:[bytes],submitted:true,complete,cancelled:!complete};});
 const result=await generateConfiguredImages({prompt:'fixture',n:1});
 expect(result.items).toHaveLength(1);expect(result.ok).toBe(complete);expect(fixture.generate).toHaveBeenCalledOnce();
 const item=result.items[0];expect(item.createdAt).toBe('2026-10-14T01:00:00.000Z');
 expect(item.generatedAt).toBe('2026-10-14T01:00:30.000Z');expect(item.generatedAtSource).toBe('local-completion');
 expect(item.generatedImageSha256).toBe(crypto.createHash('sha256').update(await fs.readFile(item.filePath)).digest('hex'));
 expect(fixture.history[0]).toEqual(item);
});
