import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import JSZip from 'jszip';
import sharp from 'sharp';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DEFAULT_PARAMS} from '../../src/types';

const state=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),write:vi.fn(),history:vi.fn(),settings:{} as any}));
vi.mock('electron',()=>({app:{getPath:()=>state.settings.outputDir},nativeImage:{},dialog:{}}));
vi.mock('axios',()=>({default:{post:state.post,get:state.get,isCancel:()=>false}}));
vi.mock('./store',()=>({getToken:()=> 'fixture-token',getSettings:()=>state.settings,addHistory:state.history,getAccountSummary:()=>({}),setAccountSummary:vi.fn()}));
vi.mock('./proxy',()=>({proxyConfig:()=>({proxy:false}),proxyConfigForUrl:async()=>({proxy:false})}));
vi.mock('./image-output',()=>({writeUniqueImageFile:state.write}));
import {generateImage} from './nai';
import {cancelAllJobs} from './job-registry';

let root:string, images:Buffer[], zip:Buffer;
const params={...DEFAULT_PARAMS,positivePrompt:'forest',seedMode:'fixed' as const,seed:42};
beforeEach(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'native-partial-save-'));
 state.settings={outputDir:root,imageBaseUrl:'https://image.novelai.net',apiBaseUrl:'https://api.novelai.net',streamPreviewEnabled:false,keepImageMetadata:true,imageNameTemplate:'{date}-{seq}'};
 state.post.mockReset();state.get.mockReset().mockRejectedValue(Error('fixture account unavailable'));state.history.mockReset();state.write.mockReset();
 const real=await vi.importActual<typeof import('./image-output')>('./image-output');state.write.mockImplementation(real.writeUniqueImageFile);
 images=await Promise.all(['#abc','#def','#123'].map(background=>sharp({create:{width:8,height:8,channels:3,background}}).png().toBuffer()));
 const archive=new JSZip();images.forEach((bytes,i)=>archive.file(`${i}.png`,bytes));zip=await archive.generateAsync({type:'nodebuffer'});
 state.post.mockResolvedValue({data:zip});
});
afterEach(async()=>{cancelAllJobs();await fs.rm(root,{recursive:true,force:true});});

async function assertSaved(result:Awaited<ReturnType<typeof generateImage>>,count:number){
 expect(result.items).toHaveLength(count);
 for(let i=0;i<count;i++)expect(await fs.readFile(result.items[i].filePath)).toEqual(images[i]);
 expect(new Set(result.items.map(item=>item.id)).size).toBe(count);
 expect(result.actualSeed).toBe(42);
}
it('baseline: returns and indexes first durable image when the second save fails',async()=>{
 const real=await vi.importActual<typeof import('./image-output')>('./image-output');
 state.write.mockImplementationOnce(real.writeUniqueImageFile).mockRejectedValueOnce(Error('ENOSPC fixture'));
 const result=await generateImage(params);
 expect(result.ok).toBe(false);await assertSaved(result,1);
 expect(state.history).toHaveBeenCalledExactlyOnceWith(result.items);
 expect(state.write).toHaveBeenCalledTimes(2);expect(state.post).toHaveBeenCalledOnce();
 expect(result.message).toContain('1/3');expect(result.message).toContain('没有自动重新生成');
});
it('baseline: retains all durable outputs when history persistence fails',async()=>{
 state.history.mockImplementation(()=>{throw Error('history locked');});
 const result=await generateImage(params);
 expect(result.ok).toBe(false);await assertSaved(result,3);
 expect(state.history).toHaveBeenCalledOnce();expect(state.post).toHaveBeenCalledOnce();
 expect(result.message).toContain('历史');expect(result.message).toContain('3/3');
});

it('returns an empty failed result and never indexes when the first file fails',async()=>{
 state.write.mockRejectedValueOnce(Error('ENOSPC'));
 const result=await generateImage(params);
 expect(result.ok).toBe(false);await assertSaved(result,0);expect(result.message).toContain('0/3');
 expect(state.history).not.toHaveBeenCalled();expect(state.write).toHaveBeenCalledOnce();expect(state.post).toHaveBeenCalledOnce();
});
it('directory creation failure is a storage failure so queues stop after the paid response',async()=>{
 const notDirectory=path.join(root,'not-a-directory');await fs.writeFile(notDirectory,'fixture');state.settings.outputDir=notDirectory;
 const result=await generateImage(params);expect(result.ok).toBe(false);expect(result.failureKind).toBe('storage');await assertSaved(result,0);
 expect(state.write).not.toHaveBeenCalled();expect(state.history).not.toHaveBeenCalled();expect(state.post).toHaveBeenCalledOnce();
});
it('reports both file and history failure without losing the committed prefix or retrying',async()=>{
 const real=await vi.importActual<typeof import('./image-output')>('./image-output');
 state.write.mockImplementationOnce(real.writeUniqueImageFile).mockRejectedValueOnce(Error('disk full'));
 state.history.mockImplementation(()=>{throw Error('history locked');});
 const result=await generateImage(params);
 expect(result.ok).toBe(false);await assertSaved(result,1);expect(result.message).toContain('剩余空间');expect(result.message).toContain('历史');
 expect(state.history).toHaveBeenCalledOnce();expect(state.post).toHaveBeenCalledOnce();
});
it('successful saves return all outputs and one history commit',async()=>{
 const result=await generateImage(params);
 expect(result.ok).toBe(true);await assertSaved(result,3);expect(state.history).toHaveBeenCalledExactlyOnceWith(result.items);
});
it('temporary output failure preserves paths but does not pollute history',async()=>{
 const real=await vi.importActual<typeof import('./image-output')>('./image-output');
 state.write.mockImplementationOnce(real.writeUniqueImageFile).mockRejectedValueOnce(Error('disk full'));
 const result=await generateImage(params,undefined,{temporary:true});
 expect(result.ok).toBe(false);await assertSaved(result,1);expect(state.history).not.toHaveBeenCalled();
 expect(result.items[0].filePath.startsWith(root+path.sep)).toBe(true);
});
it('cancellation during save does not discard an already returned paid response',async()=>{
 const controller=new AbortController();const real=await vi.importActual<typeof import('./image-output')>('./image-output');
 state.write.mockImplementationOnce(async(...args:Parameters<typeof real.writeUniqueImageFile>)=>{const file=await real.writeUniqueImageFile(...args);controller.abort();return file;});
 const result=await generateImage(params,undefined,{signal:controller.signal});
 expect(result.ok).toBe(true);await assertSaved(result,3);expect(state.post).toHaveBeenCalledOnce();
});
it('falsy thrown history errors still produce failure with all saved files',async()=>{
 state.history.mockImplementation(()=>{throw null;});
 const result=await generateImage(params);expect(result.ok).toBe(false);await assertSaved(result,3);
});
it('real HTTP ZIP and disk writes retain the first image after a later filesystem failure',async()=>{
 const axios=(await vi.importActual<typeof import('axios')>('axios')).default;
 let posts=0;const server=http.createServer((req,res)=>{if(req.method==='POST')posts++;req.resume();res.writeHead(200,{'Content-Type':'application/zip'});res.end(zip);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('missing port');
 state.settings.imageBaseUrl=`http://127.0.0.1:${address.port}`;state.post.mockImplementation((...args:Parameters<typeof axios.post>)=>axios.post(...args));
 const real=await vi.importActual<typeof import('./image-output')>('./image-output');
 state.write.mockImplementationOnce(real.writeUniqueImageFile).mockImplementationOnce(async(dir,base,ext,bytes)=>{
   const notDirectory=path.join(root,'not-a-directory');await fs.writeFile(notDirectory,'fixture');return real.writeUniqueImageFile(notDirectory,base,ext,bytes);
 });
 try{const result=await generateImage(params);expect(result.ok).toBe(false);await assertSaved(result,1);expect(posts).toBe(1);expect(state.history).toHaveBeenCalledExactlyOnceWith(result.items);}
 finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
