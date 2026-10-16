import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startMacNativeStallDiagnostics} from './desktop-native-diagnostics.mjs';

test('no mac native sampling can run on Windows, Linux, or a non-CI personal Mac', async () => {
  for (const [hostPlatform,githubActions] of [['win32','true'],['linux','true'],['darwin',undefined],['darwin','false']]) {
    let scheduled = false;
    const stop=startMacNativeStallDiagnostics({run:'unused',timeout:240000,hostPlatform,githubActions,schedule:()=>{scheduled=true;}});
    await stop();assert.equal(scheduled,false);
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
