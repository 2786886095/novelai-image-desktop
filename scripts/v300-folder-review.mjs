import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {zstdDecompressSync} from 'node:zlib';
import {assertScenarioReceipt} from './feature-acceptance/full-feature-profiles.mjs';

const sources = new Map([['c6b0890fe71c1bd9c75476e57f39b429cadc1610',{run:'44964443841',job:'137030194306'}],['826e5e54105520f32d4aa880caf5a9d7bc5ebe93',{run:'44923792104',job:'136905339862'}],['bd7378e8f7a7106158a6cb3e875202510c0afb58',{run:'44899258107',job:'136831505933'}],['0b5e4b8268ba03a57706a74c7309bfbe3f928556',{run:'44890842540',job:'136806082172'}],['c02d3186fc1b014d3e3611e07b7698cd5c448713',{run:'44707958871',job:'136192164695'}],['a3cd315029c2bc4314d5a112d3e132806392c693',{run:'44746230248',job:'136322152169'}]]);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
// Only the authenticated producer's XCTest failure attachment is eligible.
// This is evidence for a failed-waived timeout, never a passing XCTest.
export function focusedFailureTree(dir,pid) {
  if (!Number.isSafeInteger(pid) || pid<=0 || !fs.existsSync(dir)) return null;
  const idPattern=/^data\.0~[\w-]{86}==$/;
  const refs=new Map();
  function unpack(file) {
    if(fs.statSync(file).size>2*1024*1024)return null;
    const bytes=fs.readFileSync(file);
    if(bytes.length<4||bytes.readUInt32LE(0)!==0xfd2fb528)return null;
    return zstdDecompressSync(bytes,{maxOutputLength:8*1024*1024});
  }
  for(const name of fs.readdirSync(dir).filter(x=>idPattern.test(x))){
    const b=unpack(path.join(dir,name));if(!b)continue;
    const expressions=/K4:name\[S6:StringK2:_vV44:final-picker-state-actual-accessibility-tree\]K10:payloadRef\[S9:ReferenceK2:id\[S6:StringK2:_vV90:(0~[\w-]{86}==)\]\]K11:payloadSize\[S3:IntK2:_vV\d+:(\d+)\]/g;
    for(const m of b.toString('latin1').matchAll(expressions))refs.set(m[1],Number(m[2]));
  }
  if(refs.size!==1)return null;
  const [[ref,size]]=refs;const file=path.join(dir,'data.'+ref);
  if(!fs.existsSync(file))return null;
  const data=unpack(file);if(!data||data.length!==size)return null;
  const lines=data.toString('utf8').split(/\r?\n/);
  if(!new RegExp("^Attributes: Application, 0x[a-f0-9]+, pid: "+pid+", label: 'Langbai Studio'$").test(lines[0]))return null;
  const editors=lines.filter(line=>line.includes("identifier: 'DOC.inlineRenameField'"));
  if(editors.length!==1)return null;
  const match=/^\s*TextView, 0x[a-f0-9]+, \{\{[-\d.]+, [-\d.]+\}, \{([\d.]+), ([\d.]+)\}\}, identifier: 'DOC\.inlineRenameField', value: .+, Keyboard Focused$/.exec(editors[0]);
  return match&&Number(match[1])>0&&Number(match[2])>0?{kind:'post-timeout-focused-editor',sha256:digest(data)}:null;
}
export function checkFolderReview(dir,sha,observedJob,releaseRun) {
  if (releaseRun !== undefined) {
    assert.match(sha, /^[a-f0-9]{40}$/);
    assert.match(String(releaseRun), /^\d+$/);
    assert.match(String(observedJob), /^\d+$/);
  } else {
    assert.ok(sources.has(sha));
  }
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
  let treeEvidence;
  if (releaseRun !== undefined) {
    const failures = cmd.stdout.split(/\r?\n/).filter(line => / : (failed:|XCTAssert)/.test(line));
    assert.equal(failures.length, 1, 'Expected only one XCTest assertion');
    assert.match(failures[0], /Usable naming editor witness arrived after original5s appearance deadline/);
    const sampled=w.editorFound === true || w.probeTimes.some(probe => probe.literalMatches === 1);
    if(!sampled)treeEvidence=focusedFailureTree(path.join(dir,'ios_folder1/ios-picker-host/selection.xcresult/Data'), w.nativePid);
    assert.ok(sampled || treeEvidence,
      'The naming control must have been observed');
  }
  const identity = releaseRun === undefined ? {...sources.get(sha)} : {run:String(releaseRun)};
  if (observedJob !== undefined) {
    assert.match(String(observedJob), /^\d+$/);
    identity.job = String(observedJob);
  }
  return {...identity,...(treeEvidence?{treeEvidence}:{}),sourceSha:sha,entry:'ios_folder1',status:'failed-waived',
    observedSeconds:w.elapsedSeconds,deadlineSeconds:5,otherGroupEntries:names.slice(0,2),
    groupReceiptSha256:digest(fs.readFileSync(path.join(dir,'CI_COMPONENT_COMMANDS.json')))};
}
export function assertOtherOutputReceipts(dir,sha){
  assert.match(sha,/^[a-f0-9]{40}$/);const found=new Map();
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
