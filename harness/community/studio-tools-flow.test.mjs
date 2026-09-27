import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import os from 'node:os';
test('compile-and-generate uses confirmed bridge path once; prompt-only never generates; preview failures preserve success',async()=>{
 const originalFetch=globalThis.fetch,oldEnv={...process.env};
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-image-tool-test-'));process.env.DSH_HOME=dir;
 process.env.STUDIO_DSH_TOOLS=path.resolve('.tmp/harness-component014/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js');process.env.STUDIO_BRIDGE_URL='http://127.0.0.1:1';process.env.STUDIO_BRIDGE_TOKEN='test-only';delete process.env.STUDIO_WORKSPACE;
 const tools=new Map(),requests=[];
 globalThis.fetch=async(url,o)=>{const req=JSON.parse(o.body);requests.push(req);assert.equal(o.headers.Authorization,'Bearer test-only');return {ok:true,json:async()=>req.tool==='langbai_search_tags'?{ok:true,data:[{tag:req.args.query}]}:{ok:true,data:{count:1},generatedImages:[{filePath:path.join(dir,'not-present.png'),mime:'image/png'}]}};};
 try{
 let source=await fs.readFile('harness/plugins/studio-tools/index.js','utf8');source=source.replaceAll("'@langbai/dsh-studio-library/jev'",JSON.stringify(pathToFileURL(path.resolve('harness/plugins/studio-library/jev.js')).href)).replaceAll("'@langbai/dsh-studio-library/jev-config'",JSON.stringify(pathToFileURL(path.resolve('harness/plugins/studio-library/jev-config.js')).href));
 const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 await module.apply({tools:{register:t=>tools.set(t.name,t)},get:()=>undefined});
 const t=tools.get('langbai_decide_prompt');
 const args={workflow:'advanced-jev',description:'女孩回望镜头',candidates:[{tag:'1girl',category:'count',explicit:true,evidence:'女孩'},{tag:'looking_back',category:'pose',explicit:true,evidence:'回望'}],relations:[{text:'she turns her head back toward the viewer',origin:'explicit',evidence:'回望镜头',dependsOn:['t0','t1']} ]};
 const exec={callId:'test-1',agent:{session:{id:'session-test'}}};
 const a=await t.execute({args},exec);assert.ok(a.positivePrompt);assert.equal(requests.filter(r=>r.tool==='langbai_generate_image').length,0);
 const input={args:{...args,generate:{count:1,width:832,height:1216}}};const e={...exec,callId:'test-2'};
 const result=await t.execute(input,e);await t.execute(input,e);
 const calls=requests.filter(r=>r.tool==='langbai_generate_image');assert.equal(calls.length,1);assert.equal(calls[0].callId,'test-2-generate');assert.equal(calls[0].sessionId,'session-test');assert.equal(calls[0].args.positivePrompt,a.positivePrompt);assert.ok(result.generation.ok);assert.match(result.generation.previewWarnings[0],/不要因此重复收费生图/);
 assert.deepEqual(t.output.render({},result).filter(b=>b.type==='image'),[]);
 }finally{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});
