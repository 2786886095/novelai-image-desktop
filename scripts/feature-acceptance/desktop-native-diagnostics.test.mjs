import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {startMacNativeStallDiagnostics} from './desktop-native-diagnostics.mjs';

test('no mac native sampling can run on Windows, Linux, or a non-CI personal Mac', async () => {
  // Undefined would select the real parent GITHUB_ACTIONS default on a CI runner.
  // Null is an explicit non-CI fixture; the actual absent default is tested below.
  for (const [hostPlatform,githubActions] of [['win32','true'],['linux','true'],['darwin',null],['darwin','false']]) {
    let scheduled = false;
    const stop=startMacNativeStallDiagnostics({run:'unused',timeout:240000,hostPlatform,githubActions,schedule:()=>{scheduled=true;}});
    await stop();assert.equal(scheduled,false);
  }
});

test('the real CI environment default is isolated in child processes without invoking a native sampler', async t => {
  const parentValue=process.env.GITHUB_ACTIONS;
  const moduleUrl=new URL('./desktop-native-diagnostics.mjs',import.meta.url).href;
  const script=`import {startMacNativeStallDiagnostics} from ${JSON.stringify(moduleUrl)};
let scheduled=false,commandCalled=false;
const stop=startMacNativeStallDiagnostics({run:'unused',timeout:240000,hostPlatform:'darwin',
schedule:()=>{scheduled=true;return{};},cancel:()=>{},command:async()=>{commandCalled=true;}});
await stop();console.log(JSON.stringify({scheduled,commandCalled}));`;
  for(const [label,value,expected] of [['absent',undefined,false],['false','false',false],['true','true',true]]) {
    await t.test(label,()=>{
      const env={...process.env};
      if(value===undefined)delete env.GITHUB_ACTIONS;else env.GITHUB_ACTIONS=value;
      const child=spawnSync(process.execPath,['--input-type=module','--eval',script],{env,encoding:'utf8',timeout:10000,windowsHide:true});
      assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);
      assert.equal(child.stderr,'');assert.deepEqual(JSON.parse(child.stdout),{scheduled:expected,commandCalled:false});
      assert.equal(process.env.GITHUB_ACTIONS,parentValue);
    });
  }
});

test('only a durable actual mac app PID is sampled before the unchanged 240s deadline', async () => {
  const run=fs.mkdtempSync(path.join(os.tmpdir(),'mac-stack-controller-test-'));
  fs.writeFileSync(path.join(run,'BOOTSTRAP_PHASES.jsonl'),JSON.stringify({platform:'darwin',pid:4321,step:'set-native-token',stage:'begin'})+'\n');
  let trigger,scheduledDelay,argv,options,cancelled=false;
  const stop=startMacNativeStallDiagnostics({run,timeout:240000,hostPlatform:'darwin',githubActions:'true',
    schedule:(fn,delay)=>{trigger=fn;scheduledDelay=delay;return{unref(){}};},cancel:()=>{cancelled=true;},
    command:async (a,o)=>{argv=a;options=o;return {exitStatus:0,stdout:'fixture controller test only',stderr:''};}});
  assert.equal(scheduledDelay,200000);trigger();await stop();
  assert.equal(cancelled,true);assert.equal(argv[0],'/usr/bin/sample');assert.equal(argv[1],'4321');
  assert.equal(argv[2],'3');assert.equal(options.timeout,10000);
  const report=JSON.parse(fs.readFileSync(path.join(run,'MAC_NATIVE_STALL_DIAGNOSTICS.json')));
  assert.equal(report.diagnosticOnly,true);assert.equal(report.nativePid,4321);
  assert.equal(report.full195Certified,undefined);
});

test('an absent/invalid native bootstrap PID cannot fall back to a guessed process', async () => {
  const run=fs.mkdtempSync(path.join(os.tmpdir(),'mac-stack-failclosed-test-'));
  let trigger,called=false;
  const stop=startMacNativeStallDiagnostics({run,timeout:240000,hostPlatform:'darwin',githubActions:'true',schedule:fn=>{trigger=fn;return{};},cancel:()=>{},
    command:async()=>{called=true;}});
  trigger();await stop();assert.equal(called,false);
  assert.match(JSON.parse(fs.readFileSync(path.join(run,'MAC_NATIVE_STALL_DIAGNOSTICS.json'))).failure,/ENOENT/);
});
