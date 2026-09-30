vi.mock('./download-request',()=>({updateFetch:(...args:any[])=>globalThis.fetch(args[0],args[1])}));
import {afterEach,expect,it,vi} from 'vitest';
import {componentDownloadDeadline,downloadCompatibleHarness} from './harness-update';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import JSZip from 'jszip';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('allows continuously progressing downloads longer than the former five-minute cap',()=>{
 vi.useFakeTimers();const d=componentDownloadDeadline(new AbortController().signal);
 try{for(let minute=0;minute<12;minute++){vi.advanceTimersByTime(60000);d.progress();expect(d.signal.aborted).toBe(false);}}finally{d.dispose();}expect(vi.getTimerCount()).toBe(0);
});
it('fails stalled connections, bounds total time even with progress, and disposes timers',()=>{
 vi.useFakeTimers();const d=componentDownloadDeadline(new AbortController().signal,100,1000);vi.advanceTimersByTime(100);expect(d.signal.aborted).toBe(true);d.dispose();
 const total=componentDownloadDeadline(new AbortController().signal,100,300);for(let i=0;i<6;i++){vi.advanceTimersByTime(50);total.progress();}expect(total.signal.aborted).toBe(true);total.dispose();expect(vi.getTimerCount()).toBe(0);
});
it('preserves an immediate user stop, including an already-aborted signal',()=>{
 vi.useFakeTimers();const c=new AbortController(),d=componentDownloadDeadline(c.signal);c.abort(Error('user stopped'));expect(d.signal.reason.message).toBe('user stopped');d.progress();d.dispose();const next=componentDownloadDeadline(c.signal);expect(next.signal.aborted).toBe(true);next.dispose();expect(vi.getTimerCount()).toBe(0);
});
for(const mode of ['range','ignored-range','bad-range','aborted','repeated-failure'] as const)it('bounded transport recovery: '+mode,async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'component-range-test-'));const hash=(x:Buffer|string)=>crypto.createHash('sha256').update(x).digest('hex');
 const manifest={format:1,protocol:1,version:'0.1.7',upstream:'test',platform:process.platform,arch:process.arch,node:'node.exe',cli:'bin.js',files:{'node.exe':hash('node'),'bin.js':hash('cli')}};
 const zip=new JSZip();zip.file('manifest.json',JSON.stringify(manifest));zip.file('node.exe','node');zip.file('bin.js','cli');const bytes=await zip.generateAsync({type:'nodebuffer'});const half=Math.floor(bytes.length/2);
 const selected={version:'0.1.7',tag:'agent-v0.1.7',bytes:bytes.length,asset:{name:'fixture.zip',size:bytes.length,digest:'sha256:'+hash(bytes),url:'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/123'}};
 let count=0;const stop=new AbortController();const fetcher=vi.fn(async(_url:string,options:any)=>{
  count++;
  if(mode==='repeated-failure')throw new TypeError('network disconnected');
  if(count===1){let sent=false;return new Response(new ReadableStream({pull(c){if(!sent){sent=true;c.enqueue(bytes.subarray(0,half));}else{if(mode==='aborted')stop.abort(Error('user stopped'));c.error(new TypeError('connection terminated'));}}}));}
  expect(options.headers.Range).toBe(`bytes=${half}-`);
  if(mode==='ignored-range')return new Response(bytes);
  return new Response(bytes.subarray(half),{status:206,headers:{'content-range':`bytes ${mode==='bad-range'?0:half}-${bytes.length-1}/${bytes.length}`}});
 });vi.stubGlobal('fetch',fetcher);
 try{
  const work=downloadCompatibleHarness(root,stop.signal,()=>{},selected);
  if(mode==='bad-range'){await expect(work).rejects.toThrow('范围');expect(count).toBe(2);}
  else if(mode==='aborted'){await expect(work).rejects.toThrow('user stopped');expect(count).toBe(1);}
  else if(mode==='repeated-failure'){await expect(work).rejects.toThrow('disconnected');expect(count).toBe(3);}
  else{const out=await work;expect(await fs.readFile(path.join(out!,'node.exe'),'utf8')).toBe('node');expect(count).toBe(2);}
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
