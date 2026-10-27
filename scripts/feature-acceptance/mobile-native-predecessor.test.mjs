import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyMobilePredecessor,verifyColdNativeRestart} from './mobile-native-predecessor.mjs';
const source = 'a'.repeat(40), profile = 'b'.repeat(64);
function fixture(coldEntry='skill_reopen1') {
  const prior=coldEntry==='japanese_comic_reopen2'?'japanese_comic8':'text15',warmChecks=prior==='text15'?15:8,coldChecks=prior==='text15'?1:2;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-predecessor-test-')), dir = path.join(root, prior);fs.mkdirSync(dir);
  const checks = Array.from({length:warmChecks}, (_, i) => ({feature:'text',scenario:'s'+i,sourceSha:source,platform:'android',profileSha:profile,exitStatus:0,mockOnly:false,skipped:false,paidCalls:0}));
  const previous = {entry:prior,sourceSha:source,platform:'android',device:'emulator-5554',appId:'com.langbai.novelai_mobile',isolated:true,expectedChecks:warmChecks,exitStatus:0,failure:null,checks,
    nativeBegin:{testEntry:prior,sourceSha:source,profileSha:profile,expectedChecks:warmChecks,nativePid:1234},
    nativeCompletion:{checks:warmChecks,exitStatus:0,sourceSha:source,platform:'android',profileSha:profile}};
  const qualified = {schema:'client-feature-scenarios/v1',sourceQualified:true,sourceSha:source,platform:'android',profileSha256:profile,exitStatus:0,isolated:true,mockedModules:false,checks};
  const input = {entry:coldEntry,sourceSha:source,platform:'android',device:'emulator-5554',appId:'com.langbai.novelai_mobile',isolated:true,profileSha256:profile,expectedChecks:coldChecks,outputRoot:path.join(root,coldEntry),predecessorReceipt:path.join(dir,'native-mobile-receipt.json')};
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

test('Japanese cold reopen accepts only its source-qualified eight-check sibling and expects two new-process checks', () => {
  const f=fixture('japanese_comic_reopen2'), previous=verifyMobilePredecessor(f.input,profile);
  assert.equal(previous.entry,'japanese_comic8');
  assert.equal(previous.coldEntry,'japanese_comic_reopen2');
  assert.equal(previous.coldChecks,2);
  const begin={testEntry:'japanese_comic_reopen2',sourceSha:source,platform:'android',profileSha:profile,expectedChecks:2,nativePid:4321};
  assert.equal(verifyColdNativeRestart(previous,begin,{platform:'android',observedAndroidPid:4321}).differentNativeProcessObserved,true);
  assert.throws(()=>verifyColdNativeRestart(previous,{...begin,nativePid:1234},{platform:'android',observedAndroidPid:1234}),/reused/);
  assert.throws(()=>verifyColdNativeRestart(previous,{...begin,testEntry:'skill_reopen1'}));
  assert.throws(()=>verifyColdNativeRestart(previous,{...begin,expectedChecks:1}));
});

test('Japanese cold preservation rejects old source, wrong warm counts, forged qualification and unrelated predecessor', () => {
  for(const change of [p=>p.sourceSha='c'.repeat(40),p=>p.entry='text15',p=>p.expectedChecks=15,p=>p.checks.pop(),p=>p.nativeCompletion.checks=7,p=>p.nativeBegin.nativePid=null]) {
    const f=fixture('japanese_comic_reopen2');change(f.previous);f.save();assert.throws(()=>verifyMobilePredecessor(f.input,profile));
  }
  const unqualified=fixture('japanese_comic_reopen2');unqualified.qualified.sourceQualified=false;unqualified.save();assert.throws(()=>verifyMobilePredecessor(unqualified.input,profile));
  const missing=fixture('japanese_comic_reopen2');assert.throws(()=>verifyMobilePredecessor({...missing.input,predecessorReceipt:undefined},profile));
  assert.throws(()=>verifyMobilePredecessor({...missing.input,predecessorReceipt:path.join(path.dirname(missing.input.predecessorReceipt),'..','text15','native-mobile-receipt.json')},profile),/same run output sibling/);
});
