import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../../../',import.meta.url);
const read=async p=>fs.readFile(new URL(p,root),'utf8');
test('Android stages all relative imports needed by the shared library host',async()=>{
  const gradle=await read('mobile/android/app/build.gradle');
  const index=await read('harness/plugins/studio-library/index.js');
  for(const match of index.matchAll(/from ['"]\.\/([^'"]+)['"]/g))assert.ok(gradle.includes(`'${match[1]}'`),`Missing Android asset: ${match[1]}`);
});
test('Android managed library uses the same disable-and-insert rule as desktop',async()=>{
  const native=await read('mobile/android/app/src/main/kotlin/com/codex/novelai/novelai_mobile/agent/LocalAgentRuntime.kt');
  assert.ok(native.includes('studio-library\\n  disabled: true\\n- insert:\\n    - id: studio-library-managed'));
  assert.ok(native.includes('(libraryNames+extra)'));
  assert.ok(native.includes('custom.readBytes().contentEquals(original.readBytes())'));
  const desktop=await read('electron/ipc/harness-engine.ts');
  assert.ok(desktop.includes('studio-library-managed'));assert.ok(desktop.includes('panel-layout-store.js'));
});
test('candidate seed migrator ships in rootfs and executes before active descriptor changes',async()=>{
  assert.ok((await read('harness/android/build-rootfs.sh')).includes('seed-upgrade.mjs'));
  assert.ok((await read('harness/android/seed-home.mjs')).includes("import {seedEntry} from './seed-upgrade.mjs'"));
  const source=await read('mobile/android/app/src/main/kotlin/com/codex/novelai/novelai_mobile/agent/LocalAgentRuntime.kt');
  const confirm=source.slice(source.indexOf('private fun confirm('),source.indexOf('private fun backup('));
  assert.ok(confirm.indexOf('backup();')<confirm.indexOf('runShort(p.slot,staged'));
  assert.ok(confirm.indexOf('runShort(p.slot,staged')<confirm.indexOf('AgentHomeActivation.activate'));
  assert.ok(confirm.includes('homeFingerprint()==p.before'));assert.ok(confirm.includes('preserved.toPath()'));
  assert.ok(source.includes('val previous=if(data!=home)'));
});
