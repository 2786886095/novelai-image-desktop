import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createDecisionJournal} from '../plugins/studio-tools/index.js';

// Exercise the real registered tool, not a separate cache implementation.
test('advanced Jev has no lifetime quota and durable analysis replay never repeats a paid decision',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-jev-receipts-'));
 const env={...process.env},originalFetch=globalThis.fetch;
 let decisions=0,generations=0;
 const generated=new Map();
 try{
  const sdk=path.join(dir,'sdk.mjs'),jev=path.join(dir,'jev.mjs'),config=path.join(dir,'config.mjs');
  await fs.writeFile(sdk,'export const defineTool=x=>x;');
  await fs.writeFile(jev,'export const HYBRID_INSTRUCTIONS="",PROMPT_ARGUMENTS={properties:{}};export const decidePrompt=(...a)=>globalThis.__studioJevTest(...a);');
  await fs.writeFile(config,'export const readJevConfig=async()=>({}),jevStatus=async()=>({});');
  Object.assign(process.env,{DSH_HOME:dir,STUDIO_DSH_TOOLS:sdk,STUDIO_BRIDGE_URL:'http://fixture.invalid',STUDIO_BRIDGE_TOKEN:'test-only'});
  delete process.env.STUDIO_WORKSPACE;
  globalThis.__studioJevTest=async args=>{decisions++;if(args.description==='uncertain')throw Error('connection lost after submission');return {ok:true,positivePrompt:args.description};};
  globalThis.fetch=async(_url,options)=>{
   const data=JSON.parse(options.body),key=data.sessionId+':'+data.callId;
   if(!generated.has(key)){generations++;generated.set(key,{ok:true,output:'fixture image'});}
   return {ok:true,json:async()=>generated.get(key)};
  };
  let source=await fs.readFile('harness/plugins/studio-tools/index.js','utf8');
  source=source.replaceAll("'@langbai/dsh-studio-library/jev'",JSON.stringify(pathToFileURL(jev).href)).replaceAll("'@langbai/dsh-studio-library/jev-config'",JSON.stringify(pathToFileURL(config).href));
  const file=path.join(dir,'plugin.mjs');await fs.writeFile(file,source);
  const {apply}=await import(pathToFileURL(file).href);
  const boot=async()=>{const tools=new Map();await apply({tools:{register:t=>tools.set(t.name,t)},get:()=>undefined});return tools.get('langbai_decide_prompt');};
  let tool=await boot();
  const args={workflow:'advanced-jev',description:'fixture',generate:{count:1}};
  const exec=i=>({callId:'call-'+i,agent:{session:{id:'fixture-session'}}});
  for(let i=0;i<140;i++)assert.equal((await tool.execute({args},exec(i))).ok,true);
  assert.equal(decisions,140);assert.equal(generations,140);
  await tool.execute({args},exec(0));assert.equal(decisions,140);assert.equal(generations,140);
  await assert.rejects(tool.execute({args:{...args,description:'changed'}},exec(0)),/参数已变化/);
  await assert.rejects(tool.execute({args:{...args,description:'changed'}},exec(139)),/参数已变化/);
  // Fresh plugin instance simulates a cold cache; filesystem receipts remain.
  tool=await boot();await tool.execute({args},exec(0));assert.equal(decisions,140);assert.equal(generations,140);
  await Promise.all(Array.from({length:8},()=>tool.execute({args},exec(140))));
  assert.equal(decisions,141);assert.equal(generations,141);
  const uncertain={...args,description:'uncertain'};
  await assert.rejects(tool.execute({args:uncertain},exec(141)),/connection lost/);
  tool=await boot();await assert.rejects(tool.execute({args:uncertain},exec(141)),/未确认完成/);
  assert.equal(decisions,142);assert.equal(generations,141);
  console.log('JEV: 140/140; restart replay=0 additional decisions/images; concurrent=1; uncertain replay=blocked');
 }finally{
  globalThis.fetch=originalFetch;delete globalThis.__studioJevTest;
  for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);
  await fs.rm(dir,{recursive:true,force:true});
 }
});

test('durable Jev receipts survive a new Node process; uncertain/corrupt receipts fail closed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-jev-journal-'));
 try{
  const journal=createDecisionJournal(dir);let calls=0;
  const result=await journal('session','id',{b:2,a:1},async()=>{calls++;return {positivePrompt:'kept'};});
  result.positivePrompt='mutated outside';
  assert.equal((await journal('session','id',{a:1,b:2},()=>{throw Error('duplicate');})).positivePrompt,'kept');
  assert.equal(calls,1);
  const moduleUrl=pathToFileURL(path.resolve('harness/plugins/studio-tools/index.js')).href;
  const child=execFileSync(process.execPath,['--input-type=module','-e',`import {createDecisionJournal} from ${JSON.stringify(moduleUrl)};const r=await createDecisionJournal(${JSON.stringify(dir)})('session','id',{a:1,b:2},()=>{throw Error('recharged')});console.log(r.positivePrompt);`],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(child.trim(),'kept');
  const file=path.join(dir,'studio-jev-receipts',(await fs.readdir(path.join(dir,'studio-jev-receipts')))[0]);
  await fs.writeFile(file,'corrupt');
  await assert.rejects(createDecisionJournal(dir)('session','id',{a:1,b:2},()=>{throw Error('duplicate');}),/回执损坏/);
  await assert.rejects(createDecisionJournal('')('session','id',{},()=>{throw Error('duplicate');}),/DSH_HOME/);
  console.log('COLD NODE REPLAY: kept; paid work=0; corrupt receipt=blocked');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('separate journal instances race only one decision; cancelled or failed result is never auto-retried',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-jev-race-'));
 try{
  const one=createDecisionJournal(dir),two=createDecisionJournal(dir);let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  let entered;const started=new Promise(resolve=>{entered=resolve;});
  const pending=one('session','race',{},async()=>{calls++;entered();await gate;return {ok:true};});
  await started;
  await assert.rejects(two('session','race',{},async()=>{calls++;return {ok:true};}),/未确认完成/);
  release();await pending;assert.equal(calls,1);
  await assert.rejects(one('session','failed',{},async()=>{throw Error('cancelled');}),/cancelled/);
  await assert.rejects(createDecisionJournal(dir)('session','failed',{},async()=>{calls++;return {ok:true};}),/未确认完成/);
  assert.equal(calls,1);
  // A reused call ID in a different session is independent, not a collision.
  await two('other-session','race',{},async()=>{calls++;return {ok:true};});assert.equal(calls,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
