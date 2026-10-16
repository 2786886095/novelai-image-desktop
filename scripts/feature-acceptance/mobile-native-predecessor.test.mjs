import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyMobilePredecessor,verifyColdNativeRestart} from './mobile-native-predecessor.mjs';
const source = 'a'.repeat(40), profile = 'b'.repeat(64);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-predecessor-test-')), dir = path.join(root, 'text15');fs.mkdirSync(dir);
  const checks = Array.from({length:15}, (_, i) => ({feature:'text',scenario:'s'+i,sourceSha:source,platform:'android',profileSha:profile,exitStatus:0,mockOnly:false,skipped:false,paidCalls:0}));
  const previous = {entry:'text15',sourceSha:source,platform:'android',device:'emulator-5554',appId:'com.langbai.novelai_mobile',isolated:true,expectedChecks:15,exitStatus:0,failure:null,checks,
    nativeBegin:{testEntry:'text15',sourceSha:source,profileSha:profile,expectedChecks:15,nativePid:1234},
    nativeCompletion:{checks:15,exitStatus:0,sourceSha:source,platform:'android',profileSha:profile}};
  const qualified = {schema:'client-feature-scenarios/v1',sourceQualified:true,sourceSha:source,platform:'android',profileSha256:profile,exitStatus:0,isolated:true,mockedModules:false,checks};
  const input = {entry:'skill_reopen1',sourceSha:source,platform:'android',device:'emulator-5554',appId:'com.langbai.novelai_mobile',isolated:true,profileSha256:profile,expectedChecks:1,outputRoot:path.join(root,'skill_reopen1'),predecessorReceipt:path.join(dir,'native-mobile-receipt.json')};
  const save = () => {fs.writeFileSync(input.predecessorReceipt,JSON.stringify(previous));fs.writeFileSync(path.join(dir,'native-mobile-scenarios-receipt.json'),JSON.stringify(qualified));};save();
  return {previous,qualified,input,save};
}

test('only the exact source-qualified preceding fifteen-check native process unlocks cold data preservation', () => {
  const f=fixture(), result=verifyMobilePredecessor(f.input,profile);
  assert.equal(result.nativePid,1234); assert.equal(result.sourceQualified,true);
  assert.equal(result.nativeReceiptSha256.length,64);assert.equal(result.qualifiedReceiptSha256.length,64);
  assert.equal(verifyMobilePredecessor({entry:'core19',preserveData:true},profile),null);
  assert.throws(()=>verifyMobilePredecessor({...f.input,entry:'core19'},profile),/only accepted/);
});

test('wrong source/device/platform, partial/native failed, wrong predecessor, unqualified source and missing PID fail closed', () => {
  for (const change of [p=>p.sourceSha='c'.repeat(40),p=>p.device='emulator-5556',p=>p.platform='ios',p=>p.entry='text16',
    p=>p.checks.pop(),p=>p.nativeCompletion.checks=14,p=>p.exitStatus=1,p=>p.nativeBegin.nativePid=null]) {
    const f=fixture();change(f.previous);f.save();assert.throws(()=>verifyMobilePredecessor(f.input,profile));
  }
  const unqualified=fixture();unqualified.qualified.sourceQualified=false;unqualified.save();assert.throws(()=>verifyMobilePredecessor(unqualified.input,profile));
  const missing=fixture();fs.unlinkSync(path.join(path.dirname(missing.input.predecessorReceipt),'native-mobile-scenarios-receipt.json'));
  assert.throws(()=>verifyMobilePredecessor(missing.input,profile),/ENOENT/);
});

test('a different actual app PID is mandatory; a Flutter controller PID is not substituted', () => {
  const f=fixture(), predecessor=verifyMobilePredecessor(f.input,profile);
  const begin={testEntry:'skill_reopen1',sourceSha:source,platform:'android',profileSha:profile,expectedChecks:1,nativePid:4321};
  const result=verifyColdNativeRestart(predecessor,begin,{platform:'android',observedAndroidPid:4321});
  assert.equal(result.differentNativeProcessObserved,true);
  assert.throws(()=>verifyColdNativeRestart(predecessor,{...begin,nativePid:1234},{platform:'android',observedAndroidPid:1234}),/reused/);
  assert.throws(()=>verifyColdNativeRestart(predecessor,begin,{platform:'android',observedAndroidPid:9999}),/actual adb pidof/);
  assert.throws(()=>verifyColdNativeRestart(predecessor,{...begin,nativePid:undefined}),/missing/);
  assert.equal(verifyColdNativeRestart(null,null),null);
});
