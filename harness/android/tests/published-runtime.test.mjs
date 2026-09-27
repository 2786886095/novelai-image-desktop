import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {reusePublishedRuntime} from '../resolve-published-runtime.mjs';
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
