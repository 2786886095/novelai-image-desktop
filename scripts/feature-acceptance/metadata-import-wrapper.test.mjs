import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {profileSha256} from './full-feature-profiles.mjs';
import {
  METADATA_IMPORT_ENTRY,METADATA_IMPORT_TEST_FILE,METADATA_IMPORT_SCENARIOS,
  METADATA_IMPORT_ASSET_IDS,METADATA_IMPORT_FIXTURES,
  validateMetadataImportInput,parseMetadataImportAssets,verifyMetadataImportAsset,
  metadataImportTransportHandler,validateMetadataImportReceipt,
} from './run-metadata-import-native.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const wrapper=fileURLToPath(new URL('./run-metadata-import-native.mjs',import.meta.url));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const legacySha='3a0e0c7ffeb86b618735ce2522eda930442e21cc5dff3c254f8e96872f5be254';
const input=()=>({entry:METADATA_IMPORT_ENTRY,testFile:METADATA_IMPORT_TEST_FILE,expectedChecks:3,
  profileSha256,isolated:true,platform:'android',device:'emulator-5554',sourceSha:'a'.repeat(40),
  appId:'com.codex.novelai.novelai_mobile',sourceRoot:'/synthetic/must-not-read',projectRoot:'/synthetic/must-not-read/mobile'});

test('the old sixteen-check runner remains byte-identical and the new entry has fixed independent identities',()=>{
  assert.equal(digest(fs.readFileSync(new URL('./run-metadata-favorites-native.mjs',import.meta.url))),legacySha);
  assert.equal(METADATA_IMPORT_ENTRY,'metadata_import3');
  assert.equal(METADATA_IMPORT_TEST_FILE,'integration_test/native_metadata_import_scenarios.dart');
  assert.deepEqual(METADATA_IMPORT_SCENARIOS,['default-online-local-bytes','offline-and-selected-apply','formats-error-cancel-no-upload']);
  const value=input(),before=structuredClone(value);
  assert.equal(validateMetadataImportInput(value,{ciMode:true,hostPlatform:'linux'}),undefined);
  assert.deepEqual(value,before);
});

test('pure admission refuses wrong entry, test file, count, profile, isolation, physical devices and unsafe local targets',()=>{
  for(const patch of [{entry:'metadata_favorites16'},{testFile:'integration_test/native_metadata_favorites.dart'},
    {expectedChecks:16},{expectedChecks:'3'},{profileSha256:'0'.repeat(64)},
    {isolated:false},{isolated:'true'},{platform:'linux'},{device:'PHYSICAL_DEVICE_SERIAL'},
    {sourceSha:'uncommitted'}]){
    assert.throws(()=>validateMetadataImportInput({...input(),...patch},{ciMode:true,hostPlatform:'linux'}));
  }
  assert.throws(()=>validateMetadataImportInput({...input(),platform:'ios'},{ciMode:true,hostPlatform:'linux'}),/macOS/);
  assert.throws(()=>validateMetadataImportInput({...input(),sourceSha:'uncommitted',sourceSnapshotSha256:'b'.repeat(64)},{ciMode:false}),/emulator-5586/);
  assert.throws(()=>validateMetadataImportInput({...input(),device:'emulator-5586',sourceSha:'uncommitted'},{ciMode:false}),/snapshot hash/);
  assert.equal(validateMetadataImportInput({...input(),device:'emulator-5586',sourceSha:'uncommitted',sourceSnapshotSha256:'b'.repeat(64)},{ciMode:false}),undefined);
});

test('real CLI rejects invalid admission before any Git, device, assets or native launch command',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'metadata-import-policy-'));
  try{
    for(const [index,patch] of [{entry:'core19'},{testFile:'wrong.dart'},{expectedChecks:16},{profileSha256:'0'.repeat(64)},{isolated:false},{device:'PHYSICAL_SERIAL'}].entries()){
      const outputRoot=path.join(temporary,String(index));
      const value={...input(),...patch,sourceRoot:path.join(temporary,'MISSING_SOURCE'),projectRoot:path.join(temporary,'MISSING_PROJECT'),officialAssetsRoot:path.join(temporary,'MISSING_ASSETS'),outputRoot,
        adb:path.join(temporary,'FORBIDDEN_NATIVE_EXECUTABLE'),flutter:path.join(temporary,'FORBIDDEN_FLUTTER_EXECUTABLE')};
      const inputPath=path.join(temporary,`input-${index}.json`);fs.writeFileSync(inputPath,JSON.stringify(value));
      const child=spawnSync(process.execPath,[wrapper,inputPath],{env:{...process.env,GITHUB_ACTIONS:'true'},encoding:'utf8',timeout:10000,windowsHide:true});
      assert.equal(child.error,undefined);assert.equal(child.status,1,child.stderr);
      const receipt=JSON.parse(fs.readFileSync(path.join(outputRoot,'metadata-import-transport.json'),'utf8'));
      assert.equal(receipt.exit,1);assert.deepEqual(receipt.commands,[]);assert.deepEqual(receipt.requests,[]);
      assert.equal(receipt.imagesUploaded,0);assert.equal(receipt.paidCalls,0);assert.equal(receipt.full195Certified,false);assert.equal(receipt.completeFeatureRowsCertified,0);
      assert.equal(fs.existsSync(path.join(outputRoot,'native-execution-input.json')),false);
      assert.equal(fs.existsSync(path.join(outputRoot,'native-mobile-receipt.json')),false);
    }
  }finally{assert.equal(path.dirname(temporary),os.tmpdir());fs.rmSync(temporary,{recursive:true,force:true});}
});

test('the actual public inventory still contains exactly the ten pinned IDs; only the original three image samples are served',()=>{
  const inventory=fs.readFileSync(path.join(root,'mobile/lib/images/official_metadata_assets.dart'),'utf8');
  const assets=parseMetadataImportAssets(inventory);
  assert.equal(assets.length,10);assert.deepEqual(assets.map(a=>a.id),METADATA_IMPORT_ASSET_IDS);
  for(const asset of assets){assert.ok(asset.bytes>0);assert.match(asset.sha256,/^[a-f0-9]{64}$/);assert.equal(new URL(asset.url).origin,'https://novelai.net');}
  assert.deepEqual(METADATA_IMPORT_FIXTURES,['rgba-8-plain.png','webp-lossless-alpha.webp','png-text-plus-stealth.png']);
  const samples=path.join(root,'shared/official-image-metadata-fixtures');
  const manifest=JSON.parse(fs.readFileSync(path.join(samples,'manifest.json'),'utf8'));
  for(const name of METADATA_IMPORT_FIXTURES){
    const item=manifest.find(row=>row.name===name);assert.ok(item);
    const bytes=fs.readFileSync(path.join(samples,name));assert.equal(bytes.length,item.bytes);assert.equal(digest(bytes),item.sha256);
  }
  assert.throws(()=>parseMetadataImportAssets(inventory.replace('https://novelai.net/','https://novelai.net.evil/')),/Non-fixed/);
  assert.throws(()=>parseMetadataImportAssets(inventory.replace("'png-text'","'unknown-asset'")),/Non-fixed/);
  assert.throws(()=>parseMetadataImportAssets(inventory.replace("'exif'","'png-text'")),/Non-fixed/);
  assert.throws(()=>parseMetadataImportAssets(inventory.replace('33637,','0,')),/Non-fixed/);
  assert.throws(()=>parseMetadataImportAssets(inventory.split('\n').filter(line=>!line.includes("OfficialMetadataAsset('png-text'")).join('\n')),/ten pinned/);
});

test('asset byte verification fails closed on both size and SHA; synthetic unit bytes are not official/native proof',()=>{
  const bytes=Buffer.from('PURE_UNIT_POLICY_INPUT_NOT_AN_OFFICIAL_ASSET');
  const pin={id:'unit-only',bytes:bytes.length,sha256:digest(bytes)};
  assert.equal(verifyMetadataImportAsset(bytes,pin),bytes);
  assert.throws(()=>verifyMetadataImportAsset(bytes,{...pin,bytes:bytes.length+1}),/Pinned asset mismatch/);
  assert.throws(()=>verifyMetadataImportAsset(Buffer.from(bytes).fill(0),pin),/Pinned asset mismatch/);
});

function request(port,method,url,body){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,method,path:url,agent:false},response=>{
      const chunks=[];response.on('data',b=>chunks.push(b));response.on('end',()=>resolve({status:response.statusCode,bytes:Buffer.concat(chunks)}));response.on('error',reject);
    });req.on('error',reject);req.end(body);
  });
}
test('actual loopback transport returns exact allowed bytes and rejects POST/unknown paths without accepting a body',async()=>{
  const bytes=fs.readFileSync(path.join(root,'shared/official-image-metadata-fixtures',METADATA_IMPORT_FIXTURES[0]));
  const route='/fixtures/'+METADATA_IMPORT_FIXTURES[0],records=[];
  const server=http.createServer(metadataImportTransportHandler(new Map([[route,bytes]]),records));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const port=server.address().port;
    const get=await request(port,'GET',route);assert.equal(get.status,200);assert.deepEqual(get.bytes,bytes);
    const post=await request(port,'POST',route,'SYNTHETIC_REJECTED_UNIT_BODY');assert.equal(post.status,405);assert.equal(post.bytes.length,0);
    const unknown=await request(port,'GET','/fixtures/not-allowed.png');assert.equal(unknown.status,404);
    assert.deepEqual(records.map(r=>r.authorized),[true,false,false]);
    assert.ok(records.every(r=>r.requestBodyAccepted===false));assert.equal(records[0].responseSha256,digest(bytes));
    assert.equal(records[1].bytesSent,0);assert.equal(records[2].bytesSent,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

// These in-memory objects exercise refusal policy only. They are never emitted
// as CHECK/DONE lines, written as native receipts, or counted as device passes.
function policyReceiptOnly(){
  const value=input();
  return {...value,exitStatus:0,completeFeatureRowsCertified:0,full195Certified:false,
    nativeRuntime:{type:'flutter',version:'PURE_UNIT_POLICY_NOT_NATIVE'},
    nativeBegin:{sourceSha:value.sourceSha,profileSha:profileSha256,platform:value.platform,testEntry:METADATA_IMPORT_ENTRY,expectedChecks:3,kind:'device',nativeOnly:true,mockOnly:false,paidCalls:0,nativePid:12345},
    nativeCompletion:{sourceSha:value.sourceSha,profileSha:profileSha256,platform:value.platform,checks:3,exitStatus:0,paidCalls:0},
    checks:METADATA_IMPORT_SCENARIOS.map(scenario=>({feature:'metadata-import',scenario,sourceSha:value.sourceSha,platform:value.platform,profileSha:profileSha256,kind:'device',status:'passed',mockOnly:false,paidCalls:0,exitStatus:0,skipped:false,acceptanceLevel:'scenario',observed:{unitPolicyOnly:true}}))};
}
test('receipt admission requires exactly the registered three scenario/source/profile/native identities without certifying195',()=>{
  assert.equal(validateMetadataImportReceipt(policyReceiptOnly(),input()),undefined);
  for(const mutate of [r=>r.entry='metadata_favorites16',r=>r.expectedChecks=16,r=>r.full195Certified=true,
    r=>r.completeFeatureRowsCertified=1,r=>r.isolated=false,r=>r.exitStatus=1,r=>r.checks.pop(),
    r=>r.nativeCompletion.profileSha='0'.repeat(64),r=>r.nativeCompletion.checks=16,
    r=>r.nativeBegin=null,r=>r.nativeBegin.nativePid=0,r=>r.nativeBegin.testEntry='core19',
    r=>r.nativeRuntime.type='node',r=>r.checks[0].scenario=r.checks[1].scenario,
    r=>r.checks[0].sourceSha='b'.repeat(40),r=>r.checks[0].profileSha='0'.repeat(64),
    r=>r.checks[0].mockOnly=true,r=>r.checks[0].observed='not-an-object',
    r=>r.checks[0].acceptanceLevel='component',r=>r.checks[0].skipped=true]){
    const receipt=policyReceiptOnly();mutate(receipt);assert.throws(()=>validateMetadataImportReceipt(receipt,input()));
  }
});

test('the copied raw-source/device/stream safety boundaries still delegate to the original core runner',()=>{
  const old=fs.readFileSync(new URL('./run-metadata-favorites-native.mjs',import.meta.url),'utf8');
  const current=fs.readFileSync(wrapper,'utf8');
  const start="  if (ciMode) {";
  const oldGuard=old.slice(old.indexOf(start),old.indexOf("  const inventory =",old.indexOf(start)));
  const newGuard=current.slice(current.indexOf(start),current.indexOf("  const assets = loadMetadataImportSamples",current.indexOf(start)));
  assert.equal(newGuard,oldGuard,'The complete original raw Git/dirty evidence guard must remain unchanged');
  for(const literal of ["server.listen(18786, '127.0.0.1'", "'scripts/feature-acceptance/run-mobile-native.mjs'",
    "['-s', input.device, 'shell', 'getprop', 'ro.kernel.qemu']", "['runner.stdout.txt', 'runner.stderr.txt']",
    'await Promise.all([finished(stdout), finished(stderr)])', "'reverse', '--remove', 'tcp:18786'",
    "requests.some(r => r.method !== 'GET' || !r.authorized)"])assert.ok(current.includes(literal),literal);
  assert.ok(current.indexOf('validateMetadataImportInput(input);')<current.indexOf('  if (ciMode) {'));
});
