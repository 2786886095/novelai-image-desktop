import {test} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const {decidePrompt}=await import(process.env.JEV_MODULE?pathToFileURL(process.env.JEV_MODULE).href:new URL('../plugins/studio-library/jev.js',import.meta.url).href);
const input=()=>({format:'hybrid',mode:'text',description:'白发女孩撑伞',plan:'侧面展示伞柄，伞柄位于身前，外套作次要服装。',candidates:[
 {tag:'1girl',category:'count',explicit:true,evidence:'女孩'},
 {tag:'white_hair',category:'appearance',explicit:true,evidence:'白发',emphasis:'focal',reason:'明确主体特征'},
 {tag:'holding_umbrella',category:'action',explicit:true,evidence:'撑伞'},
 {tag:'from_side',category:'camera',facet:'viewpoint',explicit:false,emphasis:'focal',reason:'展示伞柄与身体关系'},
 {tag:'coat',category:'clothing',explicit:false,emphasis:'subtle',reason:'补充服装不抢主体'}
 ],relations:[{text:'the handle is held in front of her torso',origin:'completion',evidence:'伞柄位于身前',dependsOn:['t0','t2'],after:'t2'}]});
const lookup=async tag=>[{tag}];
test('disabled Jev still returns mixed prompt and weights without any Jev request or fabricated scores',async()=>{
 let requests=0;const config={enabled:false,apiKey:'must-not-be-sent'},before=JSON.stringify(config);
 const out=await decidePrompt(input(),{config,lookup,fetchImpl:async()=>{requests++;throw Error('Unexpected API call')}});
 assert.equal(requests,0);assert.equal(out.jevUsed,false);assert.equal(out.decisionEngine,'local');assert.equal(out.model,null);assert.equal(out.usage,null);
 assert.ok(out.selected.every(c=>c.score===null));assert.ok(out.naturalLanguage.every(r=>r.score===null));
 assert.match(out.positivePrompt,/the handle is held in front of her torso/);assert.match(out.positivePrompt,/1\.1::from side::/);assert.match(out.positivePrompt,/0\.9::coat::/);
 assert.ok(out.warnings.some(s=>s.includes('未经 Jev')));assert.equal(JSON.stringify(config),before);
});
test('disabled mode works with no API key but still checks mature tags',async()=>{
 const out=await decidePrompt(input(),{config:{enabled:false},lookup});assert.equal(out.jevUsed,false);
 await assert.rejects(decidePrompt(input(),{config:{enabled:false},lookup:async()=>[]}),/词典/);
});
test('off mode keeps structural conflict removal and dependent relation pruning',async()=>{
 const x=input();x.candidates[1].group='hair';x.candidates.push({tag:'black_hair',category:'appearance',explicit:false,group:'hair'});x.plan+='黑发补充';
 x.relations.push({text:'dark hair covers her shoulder',origin:'completion',evidence:'黑发补充',dependsOn:['t5'],after:'t5'});
 const out=await decidePrompt(x,{config:{enabled:false},lookup});assert.ok(out.omitted.includes('black hair'));assert.equal(out.omittedRelations.length,1);
 assert.ok(!out.positivePrompt.includes('dark hair'));
});
test('off mode does not bypass required image evidence or required mixed-language data',async()=>{
 const x=input();x.mode='image';await assert.rejects(decidePrompt(x,{config:{enabled:false},lookup}));
 const y=input();y.relations=[];await assert.rejects(decidePrompt(y,{config:{enabled:false},lookup}));
});
test('enabled mode with key performs one request and reports actual Jev evaluation',async()=>{
 let calls=0;const out=await decidePrompt(input(),{config:{enabled:true,apiKey:'TEST'},lookup,fetchImpl:async(_url,o)=>{
  calls++;const body=JSON.parse(o.body);return {ok:true,json:async()=>({model:'test-model',usage:{input_tokens:1},answers:Object.fromEntries(Object.keys(body.questions).map(id=>[id,{type:'score',score:2}]))})};
 }});
 assert.equal(calls,1);assert.equal(out.jevUsed,true);assert.equal(out.decisionEngine,'jev');assert.equal(out.model,'test-model');assert.ok(out.selected.every(c=>c.score===2));
});
test('enabled mode with missing key or remote errors does not silently switch modes',async()=>{
 let calls=0;await assert.rejects(decidePrompt(input(),{config:{enabled:true,apiKey:''},lookup,fetchImpl:async()=>{calls++}}));assert.equal(calls,0);
 await assert.rejects(decidePrompt(input(),{config:{enabled:true,apiKey:'TEST'},lookup,fetchImpl:async()=>{calls++;return {ok:false,status:503}}}),/503/);assert.equal(calls,1);
});
test('off mode honors cancellation without requesting Jev',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(decidePrompt(input(),{config:{enabled:false},signal:controller.signal,lookup,fetchImpl:async()=>{calls++}}));assert.equal(calls,0);
});
test('fresh settings default off and saved switch survives reload without deleting key',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jev-choice-')),prior=process.env.DSH_HOME;process.env.DSH_HOME=dir;
 try{
  const {readJevConfig,saveJevConfig,jevStatus}=await import('../plugins/studio-library/jev-config.js');
  const initial=await jevStatus();assert.equal(initial.enabled,false);
  const enabled=await saveJevConfig({revision:initial.revision,enabled:true,apiKey:'TEST_NOT_REAL'});assert.equal(enabled.enabled,true);
  const disabled=await saveJevConfig({revision:enabled.revision,enabled:false});assert.equal(disabled.enabled,false);assert.equal(disabled.configured,true);
  assert.equal((await readJevConfig()).apiKey,'TEST_NOT_REAL');assert.equal((await readJevConfig()).enabled,false);
  await assert.rejects(saveJevConfig({revision:enabled.revision,enabled:true}),/配置已变化/);
  assert.equal((await readJevConfig()).enabled,false);
 }finally{if(prior===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=prior;
  // Delete only known test files in the verified temp directory.
  if(path.dirname(dir)!==os.tmpdir())throw Error('Unexpected test directory');await fs.unlink(path.join(dir,'studio-jev.json'));await fs.rmdir(dir);
 }
});
test('product instruction uses the same mixed tool in either mode and explains no Jev fees',async()=>{
 const tools=await fs.readFile('harness/plugins/studio-tools/index.js','utf8'),ui=await fs.readFile('harness/plugins/studio-library/jev-client.js','utf8');
 assert.match(tools,/whether Jev is enabled or disabled/);assert.match(ui,/关闭后仍生成混合提示词/);assert.match(ui,/不产生 Jev 接口费用/);
});
