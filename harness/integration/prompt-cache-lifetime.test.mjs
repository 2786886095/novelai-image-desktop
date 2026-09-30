import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {startHarnessBridge}=require('../../dist-electron/electron/ipc/harness-bridge.js');

test('more than 128 template generations continue; evicted calls replay the durable receipt without recharging',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-cache-lifetime-'));
 const env={...process.env};let executions=0;
 const bridge=await startHarnessBridge({journal:path.join(dir,'journal'),tools:['studio_generate_from_description'],execute:async()=>{executions++;return {ok:true,title:'fixture',output:'done',data:{positivePrompt:'fixture template prompt'}};}});
 try{
  Object.assign(process.env,bridge.env,{DSH_HOME:dir,STUDIO_DSH_TOOLS:path.resolve('.tmp/harness-component015/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js')});delete process.env.STUDIO_WORKSPACE;
  let source=await fs.readFile('harness/plugins/studio-tools/index.js','utf8');
  for(const name of ['jev','jev-config'])source=source.replaceAll(`'@langbai/dsh-studio-library/${name}'`,JSON.stringify(pathToFileURL(path.resolve(`harness/plugins/studio-library/${name}.js`)).href));
  const file=path.join(dir,'plugin.mjs');await fs.writeFile(file,source);
  const plugin=await import(pathToFileURL(file).href),tools=new Map();
  await plugin.apply({tools:{register:t=>tools.set(t.name,t)},get:()=>undefined});
  const tool=tools.get('langbai_prepare_image_prompt'),args={text:'fixture scene',generate:{count:1}};
  const exec=i=>({callId:'call-'+i,agent:{session:{id:'fixture-session'}}});
  for(let i=0;i<140;i++)assert.equal((await tool.execute({args},exec(i))).ok,true);
  assert.equal(executions,140);
  assert.equal((await tool.execute({args},exec(0))).ok,true);assert.equal(executions,140);
  await assert.rejects(tool.execute({args:{...args,text:'changed'}},exec(1)),/different input/);
  await assert.rejects(tool.execute({args:{...args,text:'changed'}},exec(139)),/参数已变化/);
  assert.equal(executions,140);
 }finally{await bridge.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);await fs.rm(dir,{recursive:true,force:true});}
});
