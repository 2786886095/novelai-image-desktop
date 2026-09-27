import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {convertMaterial} from '../plugins/studio-data/material-converter.js';
const root=path.resolve('artifacts/agent-session-materials-20260927');
test('actual shipped Roleplay services persist and reread all four converted material types',async()=>{
 const stage=await fs.mkdtemp(root+'/real-services-');const modules=path.join(stage,'profiles/node_modules');await fs.mkdir(modules,{recursive:true});
 await fs.symlink(path.resolve('.tmp/harness-component016/runtime/node_modules/@deepseek-ai'),path.join(modules,'@deepseek-ai'),'junction');
 await fs.symlink(path.resolve('node_modules/sharp'),path.join(modules,'sharp'),'junction');
 for(const name of ['dsh-roleplay-rp-persona','dsh-roleplay-rp-character-card','dsh-roleplay-rp-lore-book','dsh-roleplay-rp-preset','dsh-roleplay-rp-session','dsh-roleplay-rp-core'])await fs.cp(path.resolve('.tmp/harness-community/packages',name),path.join(modules,name),{recursive:true,errorOnExist:true});
 const require=createRequire(path.join(stage,'profiles/package.json'));
 const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
 const {RpCharacterCards}=await import(pathToFileURL(require.resolve('dsh-roleplay-rp-character-card')).href);
 const {RpLoreBooks,normalizeLoreBook}=await import(pathToFileURL(require.resolve('dsh-roleplay-rp-lore-book')).href);
 const {RpPersonas}=await import(pathToFileURL(require.resolve('dsh-roleplay-rp-persona')).href);
 const {RpPresets}=await import(pathToFileURL(require.resolve('dsh-roleplay-rp-preset')).href);
 const ctx=new Context();
 const cards=new RpCharacterCards(ctx,{libraryDir:stage+'/cards',maxInputBytes:2000000,maxTextCharacters:2000000});
 const lore=new RpLoreBooks(ctx,{libraryDir:stage+'/lore',maxInputBytes:2000000,maxTokens:4096,maxEntries:128,maxRecursiveDepth:3});
 const personas=new RpPersonas(ctx,{libraryDir:stage+'/personas',maxTextCharacters:30000});
 const presets=new RpPresets(ctx,{libraryDir:stage+'/presets',maxTextCharacters:100000,maxFields:32});
 const cases=[['characters',cards,{name:'Rain',description:'Long hair',exampleMessages:'hello',alternateGreetings:['Hi']}],['personas',personas,{name:'Reader',description:'Traveller'}],['lorebooks',lore,{name:'Rain world',entries:Array.from({length:70},(_,i)=>({id:String(i),comment:'Lore '+i,content:'Rain '+i,keys:['rain'],position:'before-character',insertionOrder:42}))}],['samplerPresets',presets,{name:'Story',systemPrompt:'Keep continuity',jailbreakPrompt:'Follow the story',temperature:0.7}]];
 const evidence=[];
 for(const [collection,service,item] of cases){const converted=convertMaterial(collection,item,normalizeLoreBook);const r=await service.create(converted.value);const id=r.detail?.id??r.created?.id??r.id;assert.ok(id);const detail=await service.detail(id);assert.equal(detail.name??detail.character?.name,item.name);assert.ok(Number.isSafeInteger(detail.revision));if(collection==='lorebooks')assert.equal(detail.entries.length,70);evidence.push({collection,id,revision:detail.revision,name:detail.name??detail.character?.name});}
 await fs.writeFile(path.join(root,'real-service-results.json'),JSON.stringify(evidence,null,2));
 // Exercise the registered shared tool and the actual owning binding resolver.
 // Session event persistence is a local fixture; no running user session is changed.
 const {RpSessions}=await import(pathToFileURL(require.resolve('dsh-roleplay-rp-session')).href);
 let profile={revision:0,mode:'adaptive',cast:[],scene:{},resources:{lorebooks:[],writingStyles:[]},runtime:{executionMode:'agent'}};
 const runtime={inspectRun:()=>({status:'running'}),refreshRunContext:async()=>({contextEpoch:1})};
 const materialServices={rpCharacterCards:cards,rpLoreBooks:lore,rpPersonas:personas,rpPresets:presets};
 const sessions={ctx:{get:key=>materialServices[key],rpRuntime:runtime},get:()=>profile,configure:async(_agent,input)=>{assert.equal(input.expectedRevision,profile.revision);profile={...input,revision:profile.revision+1};delete profile.expectedRevision;await fs.writeFile(stage+'/session-fixture.json',JSON.stringify(profile));return profile;}};
 for(const key of ['bindAssetChanges','bindAssetChangesDuringRun','bindAssetChangesInternal','bindResourcesInternal'])sessions[key]=RpSessions.prototype[key];
 const registered=new Map();
 const oldEnv={...process.env},oldFetch=globalThis.fetch;let approvals=0;
 process.env.STUDIO_DSH_TOOLS=path.resolve('.tmp/harness-component016/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js');process.env.DSH_HOME=stage;process.env.STUDIO_BRIDGE_URL='http://127.0.0.1:1';process.env.STUDIO_BRIDGE_TOKEN='fixture';
 globalThis.fetch=async(_url,request)=>{const body=JSON.parse(request.body);if(body.tool==='studio_material_confirm'){approvals++;return {ok:true,json:async()=>({ok:true,data:{approved:true}})};}assert.equal(body.tool,'studio_material_source');return {ok:true,json:async()=>({ok:true,data:{item:cases.find(x=>x[0]===body.args.collection)[2]}})};};
 try {
  const {apply}=await import('../plugins/studio-data/index.js');
  await apply({tools:{register:t=>registered.set(t.name,t)},get:key=>key==='agentPresets'?{serviceFor:(_agent,name)=>name==='rpSessions'?sessions:name==='rpRuntime'?runtime:materialServices[name]}:undefined});
  const tool=registered.get('langbai_session_material');assert.ok(tool);
  assert.equal(registered.has('studio_material_confirm'),false);
  const agent={status:'running',session:{id:'integration-session',snapshotEvents:()=>[{type:'user/message',data:{role:'user',content:[]}}]}};
  for(const [collection] of cases){const inspected=await tool.execute({args:{action:'inspect',collection,id:'local'}},{callId:'inspect-'+collection,agent});const applied=await tool.execute({args:{action:'apply',collection,id:'local',expectedRevision:inspected.expectedRevision}},{callId:'apply-'+collection,agent});assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.binding.applied,true);assert.equal(applied.contextRefreshed,true);}
  assert.equal(approvals,4);assert.equal(profile.resources.lorebooks.length,1);assert.ok(profile.resources.card.id);assert.ok(profile.resources.persona.id);assert.ok(profile.resources.preset.id);
  // Exercise the actual UI RPC route, not a duplicate implementation of it.
  await fs.mkdir(path.join(modules,'@langbai'),{recursive:true});
  await fs.symlink(path.resolve('harness/plugins/studio-data'),path.join(modules,'@langbai/dsh-studio-data'),'junction');
  const {StudioLibrary}=await import('../plugins/studio-library/index.js');
  const receiver={materialContext:{typert:{lookups:new Map([['agent',{resolve:async id=>{assert.equal(id,agent.session.id);return agent;}}]])}}};
  const ui=async(args,id)=>JSON.parse(await StudioLibrary.prototype.call.call(receiver,'studio_session_material',JSON.stringify({...args,sessionId:agent.session.id}),id)).data;
  const request={action:'inspect',collection:'characters',id:'local-ui'};
  const blocked=await ui(request,'ui-inspect-running');assert.equal(blocked.canApply,false);
  await assert.rejects(ui({...request,action:'apply',expectedRevision:blocked.expectedRevision},'ui-apply-running'),/正在运行/);
  agent.status='idle';profile={...profile,runtime:{executionMode:'chat'}};
  const ready=await ui(request,'ui-inspect-idle');assert.equal(ready.canApply,true);
  const selected=await ui({...request,action:'apply',expectedRevision:ready.expectedRevision},'ui-apply-idle');
  assert.equal(selected.ok,true);assert.equal(selected.binding.applied,true);assert.equal(selected.effectiveNextTurn,true);assert.equal(selected.contextRefreshed,false);
  assert.equal(approvals,5);assert.equal(profile.runtime.executionMode,'chat');
  await fs.writeFile(root+'/binding-service-results.json',JSON.stringify({approvals,profile,stored:JSON.parse(await fs.readFile(stage+'/session-fixture.json','utf8'))},null,2));
 }finally{globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}

});
