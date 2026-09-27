import {test} from 'node:test';import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {publishAndroid} from '../hardlink-publish.mjs';
test('SELinux fallback publishes complete file and does not overwrite existing sessions',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-publish-'));
  const source=path.join(dir,'tmp'),target=path.join(dir,'session.jsonl');
  const io={...fs,link:async()=>{throw Object.assign(new Error('SELinux'),{code:'EPERM'});}};
  await fs.writeFile(source,'session-original\n');await publishAndroid(source,target,io);
  assert.equal(await fs.readFile(target,'utf8'),'session-original\n');
  await fs.writeFile(source,'replacement');
  await assert.rejects(publishAndroid(source,target,io),{code:'EEXIST'});
  assert.equal(await fs.readFile(target,'utf8'),'session-original\n');
  assert.equal(await fs.readFile(source,'utf8'),'replacement');
});
test('unknown errors and stale locks stop rather than replaying or deleting data',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-publish-'));const target=path.join(dir,'session');
  await fs.writeFile(path.join(dir,'tmp'),'pending');
  await fs.mkdir(target+'.studio-publish-lock');
  const io={...fs,link:async()=>{throw Object.assign(new Error(),{code:'EPERM'});}};
  await assert.rejects(publishAndroid(path.join(dir,'tmp'),target,io),{code:'EEXIST'});
  await assert.rejects(publishAndroid('a','b',{link:async()=>{throw Object.assign(new Error(),{code:'EIO'});}}),{code:'EIO'});
});
