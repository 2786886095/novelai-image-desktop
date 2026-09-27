import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {seedEntry,seedDigest} from '../seed-upgrade.mjs';

async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-seed-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const old=path.join(dir,'old'),next=path.join(dir,'next'),user=path.join(dir,'copy');
  for(const [root,text] of [[old,'old'],[next,'fixed'],[user,'old']]){
    await fs.mkdir(root);await fs.writeFile(path.join(root,'index.js'),text);
    await fs.writeFile(path.join(root,'package.json'),'{"version":"1.0.0"}');
  }
  return {dir,old,next,user};
}
test('candidate migrates an unchanged official package even at the same upstream version',async t=>{
  const {old,next,user}=await fixture(t),before=await seedDigest(old);
  assert.equal(await seedEntry(next,user,old),'updated');
  assert.equal(await seedDigest(user),await seedDigest(next));
  assert.equal(await seedDigest(old),before);
});
for(const change of ['edited','added','deleted'])test(`retains entire ${change} user package`,async t=>{
  const {old,next,user}=await fixture(t);
  if(change==='edited')await fs.writeFile(path.join(user,'index.js'),'user code');
  if(change==='added')await fs.writeFile(path.join(user,'my-plugin.js'),'user code');
  if(change==='deleted')await fs.unlink(path.join(user,'package.json'));
  const before=await seedDigest(user);
  assert.equal(await seedEntry(next,user,old),'retained');assert.equal(await seedDigest(user),before);
});
test('normal launch never overwrites an existing official package without upgrade context',async t=>{
  const {next,user}=await fixture(t),before=await seedDigest(user);
  assert.equal(await seedEntry(next,user),'retained');assert.equal(await seedDigest(user),before);
});
test('first installation copies missing packages; retry is idempotent',async t=>{
  const {next,dir}=await fixture(t),user=path.join(dir,'new');
  assert.equal(await seedEntry(next,user),'copied');
  assert.equal(await seedDigest(user),await seedDigest(next));
  assert.equal(await seedEntry(next,user),'retained');
});
test('failed candidate copy preserves original package',async t=>{
  const {old,user,dir}=await fixture(t),before=await seedDigest(user);
  await assert.rejects(seedEntry(path.join(dir,'missing-source'),user,old));
  assert.equal(await seedDigest(user),before);
  assert.equal((await fs.readdir(dir)).filter(n=>n.includes('.seed-')||n.includes('.prior-')).length,0);
});
test('linked custom package is not followed or overwritten',async t=>{
  const {old,next,user,dir}=await fixture(t),link=path.join(dir,'linked');
  await fs.symlink(user,link,process.platform==='win32'?'junction':'dir');
  const before=await seedDigest(user);
  assert.equal(await seedEntry(next,link,old),'retained');assert.equal(await seedDigest(user),before);
});
