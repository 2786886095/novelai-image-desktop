// UNIT fixtures only. No Android process was executed by this test.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {androidAgentUnitFixture} from './android-agent-contract-fixture.mjs';
import {androidAgentScenarioReceipt} from './android-agent-contract.mjs';
import {assertScenarioReceipt,profileSha256} from './full-feature-profiles.mjs';
import {buildFullFeatureMatrix,collectReceiptFiles} from './build-full-feature-matrix.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){const proof=JSON.parse(JSON.stringify(androidAgentUnitFixture()).replaceAll('b'.repeat(64),profileSha256));proof.nativeReportSha256=hash(proof.nativeReportText);return {proof,receipt:androidAgentScenarioReceipt(proof,{sourceSha:proof.sourceSha,profileSha256})};}
test('dedicated runtime requires independent companion proof, not a relaxed enum',()=>{
 const {proof,receipt}=fixture();assert.throws(()=>assertScenarioReceipt(receipt,{sourceSha:proof.sourceSha}),/controller proof/);
 assert.equal(assertScenarioReceipt(receipt,{sourceSha:proof.sourceSha,androidAgentProof:proof}),receipt);
 for(const platform of ['ios','linux','macos','windows'])assert.throws(()=>assertScenarioReceipt({...receipt,platform},{sourceSha:proof.sourceSha,androidAgentProof:proof}));
 const tamper=structuredClone(receipt);tamper.checks[0].observed.preparedBeforeConfirmation=false;assert.throws(()=>assertScenarioReceipt(tamper,{androidAgentProof:proof}));
});
test('same-source Android Agent proof remains diagnostic-only outside current Windows-local scope',()=>{
 const {proof,receipt}=fixture(),item={artifact:'UNIT-ONLY-not-device.json',sha256:'f'.repeat(64),receipt,androidAgentProof:proof};
 const run=items=>buildFullFeatureMatrix({version:'2.6.0',sourceSha:proof.sourceSha,receipts:items});
 assert.equal(run([{...item,androidAgentProof:undefined}]).summary.verifiedSlots,0);
 const m=run([item]);assert.equal(m.summary.verifiedSlots,0);assert.equal(m.full195Certified,false);
 const cell=m.features.find(x=>x.id==='agent-components').platforms.android;assert.equal(cell.status,'not-supported');assert.deepEqual(cell.declaredScenarios,receipt.checks.map(c=>c.scenario));assert.deepEqual(cell.completedScenarios,[]);assert.deepEqual(cell.evidence,[]);assert.equal(cell.excludedObservedScenarios.length,3);assert.equal(m.features.find(x=>x.id==='agent-components').platforms.windows.status,'pending');assert(m.diagnostics.some(d=>d.classification==='outside-explicit-release-scope'&&d.feature==='agent-components'&&d.platform==='android'));
 const ios=m.features.find(x=>x.id==='agent-components').platforms.ios;assert.equal(ios.status,'not-supported');assert.deepEqual(ios.completedScenarios,[]);assert.deepEqual(ios.evidence,[]);assert.deepEqual(m.excludedPlatforms,[]);
 assert.equal(m.summary.requiredSlots,187);assert.equal(m.summary.declaredSlots,195);assert.equal(m.summary.notSupportedSlots,8);assert.equal(m.profileSha256,profileSha256);
});
test('collector reopens fixed sibling proof and copies raw SHA, never follows arbitrary path',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'android-admission-unit-')),input=path.join(root,'in'),output=path.join(root,'out');fs.mkdirSync(input);fs.mkdirSync(output);
 try{
  const {proof,receipt}=fixture();fs.writeFileSync(path.join(input,'android-agent-scenarios-receipt.json'),JSON.stringify(receipt));
  let rows=collectReceiptFiles(input,output);assert.equal(rows[0].androidAgentProof,undefined);
  const raw=JSON.stringify(proof,null,2)+'\n';fs.writeFileSync(path.join(input,'controller-proof.json'),raw);
  rows=collectReceiptFiles(input,output);assert.deepEqual(rows[0].androidAgentProof,proof);assert.equal(rows[0].androidAgentProofFileSha256,hash(raw));
  assert.equal(fs.readFileSync(path.join(output,rows[0].androidAgentProofArtifact),'utf8'),raw);
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('android-admission-unit-'));fs.rmSync(root,{recursive:true,force:true});}
});
