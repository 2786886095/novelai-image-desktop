import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import os from 'node:os';
import {normalizeCandidates} from '../plugins/studio-library/jev.js';
test('all evidence issues identify candidate index/tag before any remote call',()=>{
 assert.throws(()=>normalizeCandidates({description:'女孩',candidates:[{tag:'1girl',category:'count',explicit:true,evidence:'girl'},{tag:'smile',category:'expression',explicit:true}]}),e=>/candidates\[0\].evidence.*1girl/.test(e.message)&&/candidates\[1\].evidence.*smile/.test(e.message));
 assert.equal(normalizeCandidates({description:'女孩',candidates:[{tag:'1girl',category:'count',explicit:true,evidence:'女孩'}]})[0].evidence,'女孩');
});
test('software template conversion/reverse, one-shot generation, failures and cancel',async()=>{
 const originalFetch=globalThis.fetch,oldEnv={...process.env};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-template-test-'));
 process.env.DSH_HOME=dir;process.env.STUDIO_DSH_TOOLS=path.resolve('.tmp/harness-component015/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js');process.env.STUDIO_BRIDGE_URL='http://127.0.0.1:1';process.env.STUDIO_BRIDGE_TOKEN='test-only';delete process.env.STUDIO_WORKSPACE;
 const tools=new Map(),calls=[];let fail=false,empty=false;
 globalThis.fetch=async(url,o)=>{const req=JSON.parse(o.body);calls.push(req);return {ok:true,json:async()=>fail?{ok:false,output:'conversion failed'}:req.tool==='studio_generate_from_description'?{ok:true,data:{count:1,positivePrompt:'from software template'}}:req.tool==='langbai_generate_image'?{ok:true,data:{count:1}}:fail?{ok:false,output:'conversion failed'}:{ok:true,data:empty?{}:{[req.tool==='langbai_reverse_prompt'?'prompt':'result']:'from software template',template:{mode:req.args.mode??'mixed'}}}}};
 try {
  let source=await fs.readFile('harness/plugins/studio-tools/index.js','utf8');source=source.replaceAll("'@langbai/dsh-studio-library/jev'",JSON.stringify(pathToFileURL(path.resolve('harness/plugins/studio-library/jev.js')).href)).replaceAll("'@langbai/dsh-studio-library/jev-config'",JSON.stringify(pathToFileURL(path.resolve('harness/plugins/studio-library/jev-config.js')).href));
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));await module.apply({tools:{register:t=>tools.set(t.name,t)},get:()=>undefined});
  const t=tools.get('langbai_prepare_image_prompt');assert.ok(t);
  let seq=0;const exec=()=>({callId:'template-'+(++seq),agent:{session:{id:'current-session'}}});
  const first=await t.execute({args:{text:'女孩'}},exec());assert.equal(first.positivePrompt,'from software template');assert.equal(calls[0].tool,'langbai_convert_prompt');assert.equal(calls[0].args.mode,undefined);assert.equal(calls.length,1);
  await t.execute({args:{imageAttachmentId:'reference-1',text:'只看服装',mode:'natural',templateVersion:'v4.5'}},exec());assert.equal(calls[1].tool,'langbai_reverse_prompt');assert.equal(calls[1].args.mode,'natural');assert.equal(calls[1].args.templateVersion,'v4.5');
  const args={text:'女孩',generate:{count:1}},e=exec();await Promise.all([t.execute({args},e),t.execute({args},e)]);assert.equal(calls.filter(r=>r.tool==='studio_generate_from_description').length,1);assert.equal(calls.at(-1).sessionId,'current-session');assert.equal(calls.at(-1).args.text,'女孩');assert.ok(!('stylePrompt' in calls.at(-1).args));
  await assert.rejects(t.execute({args:{...args,text:'different'}},e),/参数已变化/);
  fail=true;assert.equal((await t.execute({args},exec())).ok,false);fail=false;
  empty=true;await assert.rejects(t.execute({args:{text:'女孩'}},exec()),/未返回有效提示词/);empty=false;
  const abort=new AbortController();abort.abort();await assert.rejects(t.execute({args},{...exec(),signal:abort.signal}),/取消/);
  assert.equal(calls.filter(r=>r.tool==='studio_generate_from_description').length,2);assert.equal(calls.filter(r=>r.tool==='langbai_search_tags').length,0);
  const legacy=await tools.get('langbai_decide_prompt').execute({args:{description:'旧预设场景',candidates:[],relations:[]}},exec());assert.equal(legacy.positivePrompt,'from software template');assert.equal(calls.at(-1).tool,'langbai_convert_prompt');
  const direct=tools.get('langbai_generate_image');const before=calls.length;
  await direct.execute({args:{positivePrompt:'旧会话直接要求雨夜撑伞',count:1}},exec());
  assert.equal(calls[before].tool,'studio_generate_from_description');assert.equal(calls[before].args.text,'旧会话直接要求雨夜撑伞');
  assert.equal(calls.length,before+1);assert.equal(calls[before].args.generate.count,1);
  fail=true;const paidBefore=calls.filter(r=>r.tool==='studio_generate_from_description').length;
  assert.equal((await direct.execute({args:{positivePrompt:'新场景'}},exec())).ok,false);
  assert.equal(calls.filter(r=>r.tool==='studio_generate_from_description').length,paidBefore+1);
  const scoped={...exec(),agent:{session:{id:'current-session',deriveMessages:()=>[{id:'user-turn',role:'user',content:[{type:'text',text:'单人白发红眼，保持全身'}]}]}}};
  await t.execute({args},scoped);const once=calls.length;await t.execute({args:{...args,text:'retry'}},{...scoped,callId:'retry-new-id'});assert.equal(calls.length,once,'Failed user turn must not ask again');assert.match(calls.at(-1).args.text,/白发红眼/);

 }finally{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});
