import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('extension navigation and native selects replace sidebar/native select controls',async()=>{
 const code=await fs.readFile('harness/plugins/studio-library/client.js','utf8');
 assert.match(code,/shell\.overlay/);assert.doesNotMatch(code,/sidebar\.footer\.action/);
 assert.doesNotMatch(code,/h\('select'/);assert.match(code,/StudioSelect/);
 assert.match(code,/showDetails\s*\?/);
});
test('polling is serialized, visibility-aware and stops publishing after disposal',async()=>{
 const {startPolling}=await import('../plugins/studio-library/client-state.js');
 const queue=[];let calls=0,published=0,visible=false,resolve;
 const stop=startPolling({read:()=>{calls++;return new Promise(r=>resolve=r)},publish:()=>published++,onError:()=>{},isVisible:()=>visible,setTimer:fn=>(queue.push(fn),queue.length),clearTimer:()=>{}});
 await queue.shift()();assert.equal(calls,0);visible=true;
 const pending=queue.shift()();assert.equal(calls,1);assert.equal(queue.length,0);stop();resolve({revision:1});await pending;assert.equal(published,0);assert.equal(queue.length,0);
});
test('unchanged revisions retain a stable React snapshot',async()=>{
 const {foldSnapshot}=await import('../plugins/studio-library/client-state.js');
 const before={revision:'a',capturedAt:1};assert.equal(foldSnapshot(before,{revision:'a',capturedAt:2}),before);assert.equal(foldSnapshot(before,{revision:'b'}).revision,'b');
});

test('native pages are mirrored into a uniquely owned extension slot',async()=>{
 const ui=await fs.readFile('harness/plugins/studio-library/client.js','utf8');assert.doesNotMatch(ui,/'settings\.(section|plugins\.tab)':/);assert.match(ui,/'studio\.extensions\.page':/);
 for(const file of ['mindspace-dsh-session-memory/lib/client.js','dsh-plugin-mgr/dist/client.js'])assert.match(await fs.readFile('.tmp/harness-community/packages/'+file,'utf8'),/name: "studio\.extensions\.page"/);
});
