import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {withStudioLedger,hasUserPresetChanges} from './preset-preservation.js';
test('preserves user edits, additions, deletions and legacy presets',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-preset-test-'));
 try{
  assert.equal(await hasUserPresetChanges(root),true);
  const files=withStudioLedger({'agent.cordis.yml':'original','preset.yml':'preset'});
  for(const[name,text]of Object.entries(files))await fs.writeFile(path.join(root,name),text);
  assert.equal(await hasUserPresetChanges(root),false);
  await fs.writeFile(path.join(root,'agent.cordis.yml'),'custom');assert.equal(await hasUserPresetChanges(root),true);
  await fs.writeFile(path.join(root,'agent.cordis.yml'),'original');await fs.writeFile(path.join(root,'notes.txt'),'mine');assert.equal(await hasUserPresetChanges(root),true);
  await fs.unlink(path.join(root,'notes.txt'));await fs.unlink(path.join(root,'preset.yml'));assert.equal(await hasUserPresetChanges(root),true);
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-preset-test-'))await fs.rm(root,{recursive:true,force:true});}
});
