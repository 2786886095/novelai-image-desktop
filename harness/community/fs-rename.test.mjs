import {test} from 'node:test';import assert from 'node:assert/strict';
import {retryingRename,adaptRename} from './fs-rename.mjs';
test('Windows transient rename retries same paths without replaying writes',async()=>{
 const calls=[],waits=[];let attempts=0;
 await retryingRename(async(...args)=>{calls.push(args);if(attempts++<2)throw Object.assign(Error('locked'),{code:'EPERM'});},{platform:'win32',sleep:async ms=>waits.push(ms)})('temporary','destination');
 assert.deepEqual(waits,[100,200]);assert.deepEqual(calls,Array(3).fill(['temporary','destination']));
});
test('rename retry is bounded; permanent and non-Windows failures propagate unchanged',async()=>{
 for(const [platform,code,expected] of [['win32','EPERM',8],['win32','EACCES',8],['win32','EBUSY',8],['win32','ENOSPC',1],['win32','ENOENT',1],['linux','EPERM',1]]){
  let calls=0;const error=Object.assign(Error(code),{code});
  await assert.rejects(retryingRename(async()=>{calls++;throw error;},{platform,sleep:async()=>{}})('a','b'),e=>e===error);assert.equal(calls,expected);
 }
});
test('adapter changes only filesystem rename binding and fails closed for unexpected upstream',()=>{
 const source="import { mkdir, rename, rm } from 'node:fs/promises'\nawait rename(a,b)";
 const changed=adaptRename(source);assert.match(changed,/import \{rename\} from '\.\/studio-fs-rename.mjs'/);assert.match(changed,/await rename\(a,b\)/);assert.doesNotMatch(changed,/mkdir, rename/);assert.throws(()=>adaptRename('unrelated'),/no longer matches/);
});
