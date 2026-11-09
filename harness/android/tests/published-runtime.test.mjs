import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {reusePublishedRuntime,officialRuntimeAssetFetcher} from '../resolve-published-runtime.mjs';
const lock={format:1,protocol:1,version:'0.1.7',upstream:'0.1.7-rc.2',platform:'android',arch:'arm64',minSdk:26};
const data=Buffer.from('verified public runtime');const meta={...lock,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),url:'https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v0.1.7/agent-rootfs.zip'};
async function fixture(fn){const out=await fs.mkdtemp(path.join(os.tmpdir(),'studio-published-'));try{await fn(out);}finally{assert.equal(path.dirname(out),os.tmpdir());await fs.rm(out,{recursive:true,force:true});}}
const fetcher=async url=>url.endsWith('.json')?Response.json(meta):new Response(data);
test('reuses the exact public archive, never a nondeterministic rebuild',()=>fixture(async out=>{
 let checked='';assert.equal(await reusePublishedRuntime({lock,out,fetcher,checkSource:tag=>{checked=tag;}}),true);assert.equal(checked,'agent-v0.1.7');assert.deepEqual(await fs.readFile(path.join(out,'agent-rootfs.zip')),data);const seed=JSON.parse(await fs.readFile(path.join(out,'seed.json')));assert.equal(seed.sha256,meta.sha256);assert.equal(seed.url,undefined);
}));
test('rejects tampered bytes and does not write a usable descriptor',()=>fixture(async out=>{
 await assert.rejects(reusePublishedRuntime({lock,out,fetcher:async url=>url.endsWith('.json')?Response.json(meta):new Response('bad'),checkSource:()=>{}}),/hash\/size/);await assert.rejects(fs.stat(path.join(out,'seed.json')),/ENOENT/);
}));
test('same version with changed runtime source must not silently use old bytes',()=>fixture(async out=>{
 await assert.rejects(reusePublishedRuntime({lock,out,fetcher,checkSource:()=>{throw Error('source changed');}}),/source changed/);
}));
test('only a missing public descriptor requests a new component build',()=>fixture(async out=>{
 assert.equal(await reusePublishedRuntime({lock,out,fetcher:async()=>new Response('',{status:404}),checkSource:()=>{}}),false);
 await assert.rejects(reusePublishedRuntime({lock,out,fetcher:async()=>new Response('',{status:500}),checkSource:()=>{}}),/request failed/);
}));

const api='https://api.github.com/repos/2786886095/novelai-image-desktop/releases/';
const base=meta.url.replace('agent-rootfs.zip','');
const descriptor=Buffer.from(JSON.stringify(meta));
const publicAssets=[
 {id:100,name:'android-agent.json',browser_download_url:base+'android-agent.json',size:descriptor.length,digest:'sha256:'+createHash('sha256').update(descriptor).digest('hex')},
 {id:200,name:'agent-rootfs.zip',browser_download_url:meta.url},
];
test('official API fallback recovers 504s without weakening descriptor or archive verification',()=>fixture(async out=>{
 const calls=[];const http=async(url,options)=>{
  calls.push([url,options.headers?.Accept]);
  if(url.startsWith(base))return new Response('temporary gateway failure',{status:504});
  if(url===api+'tags/agent-v0.1.7')return Response.json({tag_name:'agent-v0.1.7',assets:publicAssets});
  if(url===api+'assets/100')return new Response(descriptor);
  if(url===api+'assets/200')return new Response(data);
  throw Error('Unexpected URL: '+url);
 };
 let checked=false;
 assert.equal(await reusePublishedRuntime({lock,out,fetcher:officialRuntimeAssetFetcher(lock.version,http),checkSource:tag=>{assert.equal(tag,'agent-v0.1.7');checked=true;}}),true);
 assert(checked);
 assert.deepEqual(await fs.readFile(path.join(out,'agent-rootfs.zip')),data);
 assert.deepEqual(calls,[[base+'android-agent.json',undefined],[api+'tags/agent-v0.1.7','application/vnd.github+json'],[api+'assets/100','application/octet-stream'],[meta.url,undefined],[api+'assets/200','application/octet-stream']]);
}));
test('official API fallback rejects a mismatched descriptor checksum',async()=>{
 const http=async url=>url.startsWith(base)?new Response('',{status:504}):url.includes('/tags/')?Response.json({tag_name:'agent-v0.1.7',assets:publicAssets}):new Response('tampered');
 const get=officialRuntimeAssetFetcher(lock.version,http);
 await assert.rejects(get(base+'android-agent.json'),/descriptor checksum mismatch/);
 await assert.rejects(get('https://example.org/android-agent.json'),/Unexpected Android Agent asset URL/);
});
