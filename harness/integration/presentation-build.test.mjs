import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const prepare=require('../../scripts/prepare-agent-presentation.cjs');
test('all presentation builders run, failure aborts instead of retaining a stale bundle',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-build-presentation-'));
 try {
  await fs.mkdir(path.join(dir,'harness'));
  for(const name of ['library','responsive','brand'])await fs.writeFile(path.join(dir,`harness/build-${name}.mjs`),`import fs from 'node:fs';fs.appendFileSync('calls.txt','${name}\\n');`);
  prepare(dir);assert.equal(await fs.readFile(path.join(dir,'calls.txt'),'utf8'),'library\nresponsive\nbrand\n');
  await fs.writeFile(path.join(dir,'calls.txt'),'');
  await fs.writeFile(path.join(dir,'harness/build-library.mjs'),'process.exit(7);');
  assert.throws(()=>prepare(dir));assert.equal(await fs.readFile(path.join(dir,'calls.txt'),'utf8'),'');
 }finally{assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true});}
});
test('desktop, Android APK and downloadable components all build fresh presentation',async()=>{
 for(const file of ['scripts/configure-windows-archive.cjs','harness/build-component.mjs','mobile/android/app/build.gradle','harness/android/build-rootfs.sh'])assert.match(await fs.readFile(file,'utf8'),/prepare-agent-presentation/);
 assert.match(await fs.readFile('mobile/android/app/build.gradle','utf8'),/dependsOn\(buildAgentPresentation\)/);
 assert.match(await fs.readFile('.github/workflows/build-mobile.yml','utf8'),/Install Agent presentation build dependencies/);
});
