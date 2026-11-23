import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertScenarioReceipt} from './feature-acceptance/full-feature-profiles.mjs';

const sources = new Map([['cd62458b39452912f3983c385fd99e9abf967ee7',{run:'45094706613',job:'137431835756'}],['826e5e54105520f32d4aa880caf5a9d7bc5ebe93',{run:'44923792104',job:'136905339862'}],['bd7378e8f7a7106158a6cb3e875202510c0afb58',{run:'44899258107',job:'136831505933'}],['0b5e4b8268ba03a57706a74c7309bfbe3f928556',{run:'44890842540',job:'136806082172'}],['c02d3186fc1b014d3e3611e07b7698cd5c448713',{run:'44707958871',job:'136192164695'}],['a3cd315029c2bc4314d5a112d3e132806392c693',{run:'44746230248',job:'136322152169'}]]);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
export function checkFolderReview(dir,sha,observedJob) {
  assert.ok(sources.has(sha));
  const group = read(dir,'CI_COMPONENT_COMMANDS.json');
  assert.equal(group.sourceSha,sha); assert.equal(group.platform,'ios'); assert.equal(group.entryGroup,'os');
  assert.equal(group.exitStatus,1);
  const names = ['os6','ios_update2','ios_folder1'];
  assert.deepEqual(group.selectedEntries,names); assert.deepEqual(group.entries.map(e=>e.entry),names);
  for(const [i,row] of group.entries.entries()){
    const failed = row.entry==='ios_folder1';
    assert.equal(row.sourceQualified,true);assert.equal(row.expectedChecks,[6,2,1][i]);
    assert.equal(row.status,failed?'failed':'passed');assert.equal(row.nativeExitStatus,Number(failed));assert.equal(row.exitStatus,Number(failed));
    if(!failed){
      const receipt = read(dir,row.entry+'/native-mobile-scenarios-receipt.json');
      assertScenarioReceipt(receipt,{sourceSha:sha,platform:'ios'});
      assert.equal(receipt.checks.length,row.expectedChecks);
    }
  }
  const failure=read(dir,'ios_folder1/native-mobile-receipt.json');
  assert.equal(failure.entry,'ios_folder1');assert.equal(failure.sourceSha,sha);assert.equal(failure.exitStatus,1);
  const cmd=read(dir,'ios_folder1/ios-picker-host/UI_COMMAND.json');
  const line=cmd.stdout.split(/\r?\n/).find(s=>s.startsWith('IOS_FOLDER_NAMING_EDITOR_WITNESS:'));
  assert.ok(line);const w=JSON.parse(line.slice(line.indexOf(':')+1));
  assert.equal(w.sourceSha,sha);assert.equal(w.appearanceDeadlineSeconds,5);
  assert.equal(w.withinAppearanceDeadline,false);assert.ok(w.elapsedSeconds>=5 && Number.isFinite(w.elapsedSeconds));
  const identity={...sources.get(sha)};if(observedJob!==undefined){assert.match(String(observedJob),/^\d+$/);identity.job=String(observedJob);}
  return {...identity,sourceSha:sha,entry:'ios_folder1',status:'failed-waived',
    observedSeconds:w.elapsedSeconds,deadlineSeconds:5,otherGroupEntries:names.slice(0,2),
    groupReceiptSha256:digest(fs.readFileSync(path.join(dir,'CI_COMPONENT_COMMANDS.json')))};
}
export function assertOtherOutputReceipts(dir,sha){
  assert.ok(sources.has(sha));const found=new Map();
  for(const file of fs.readdirSync(dir)){
    if(!/^[a-f0-9]{64}\.json$/.test(file))continue;
    const r=read(dir,file);if(r.schema!=='client-feature-scenarios/v1'||r.platform!=='ios'||!r.checks?.some(c=>c.feature==='output-management'))continue;
    assert.equal(digest(fs.readFileSync(path.join(dir,file)))+'.json',file);
    assertScenarioReceipt(r,{sourceSha:sha,platform:'ios'});
    for(const c of r.checks.filter(c=>c.feature==='output-management'))found.set(c.scenario,file);
  }
  assert.deepEqual([...found.keys()].sort(),['invalid-outside-paths-no-delete','managed-write-no-clobber']);
  return Object.fromEntries(found);
}
