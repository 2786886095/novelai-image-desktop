// Real download/install/start/restart against an isolated profile. No model or paid image calls.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {HarnessEngine}=require('../dist-electron/electron/ipc/harness-engine.js');
const {downloadCompatibleHarness}=require('../dist-electron/electron/ipc/harness-update.js');
const {startHarnessBridge}=require('../dist-electron/electron/ipc/harness-bridge.js');
(async()=>{
 const base=path.resolve(process.argv[2]??'artifacts/repair-2.4.1/live-agent');await fs.mkdir(base,{recursive:true});
 const root=await fs.mkdtemp(path.join(base,'profile-'));let downloads=0,opened=0;
 const result={root,checks:[],paidCalls:0};
 const engine=new HarnessEngine({root,seed:path.join(root,'no-bundled-seed'),workspace:root,
  updateSource:(signal,log)=>{downloads++;return downloadCompatibleHarness(root,signal,log);},
  openBrowser:async url=>{
   // Node fetch does not retain cookies on redirects; emulate the browser bootstrap explicitly.
   const first=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
   let response=first;
   if(first.status>=300&&first.status<400){
    const cookies=first.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const next=new URL(first.headers.get('location'),url);assert.equal(next.origin,new URL(url).origin);
    response=await fetch(next,{headers:{Cookie:cookies},signal:AbortSignal.timeout(15000)});
   }
   assert.equal(response.status,200);opened++;
  },
  bridge:()=>startHarnessBridge({journal:path.join(root,'test-journal'),tools:[],execute:async()=>{throw Error('No tools may execute in startup validation');}}),
  previewSource:path.resolve('harness/plugins/studio-preview'),librarySource:path.resolve('harness/plugins/studio-library'),toolsSource:path.resolve('harness/plugins/studio-tools'),responsiveSource:path.resolve('harness/plugins/studio-responsive')});
 const stop=setTimeout(()=>void engine.stop(),210000);
 try{
  await engine.start();await fs.writeFile(path.join(root,'first-start.json'),JSON.stringify(engine.snapshot(),null,2));
  assert.equal(engine.snapshot().phase,'running');assert.equal(opened,1);assert.equal(downloads,1);result.checks.push('real download + verified install + authenticated HTTP 200');
  assert.deepEqual(await fs.readdir(path.join(root,'downloads')),[]);result.checks.push('successful activation removes only the owned temporary download copy');
  await engine.stop();
  const sentinel=path.join(root,'user-home','user-preservation.txt');await fs.writeFile(sentinel,'user-owned sentinel');
  await engine.start();assert.equal(engine.snapshot().phase,'running');assert.equal(opened,2);assert.equal(downloads,1);
  assert.equal(await fs.readFile(sentinel,'utf8'),'user-owned sentinel');result.checks.push('restart reuses installed runtime without download; user file retained');
  result.version=engine.snapshot().version;result.pass=true;
 }finally{clearTimeout(stop);await engine.stop();await fs.writeFile(path.join(base,'verification.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
