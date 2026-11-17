import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {assertV297CloudNativeRun} from './release-platform-contract.mjs';
const sha='c7e3c194e90e9a8d4494d04604518ec5c5d86de5';
const old='b431e2f0706d76b7f29cce99459fcdf71d9e5ebd';
const tag='v2.9.7';
const repo='2786886095/novelai-image-desktop';
const inputs=[
 ['build.yml','44124636191'],
 ['build-mobile.yml','44124643712'],
 ['feature-acceptance.yml','44124653287'],
 ['image-metadata.yml','44124668172'],
];
const run=(command,...args)=>execFileSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024}).trim();
const gh=(...args)=>run('gh',...args);
const git=(...args)=>run('git',...args);
const peek=(ref)=>git('ls-remote','origin',ref).split('\t')[0];
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
assert.equal('v'+version,tag);
assert.equal(git('rev-parse','HEAD'),sha);
assert.equal(process.env.GH_REPO,repo);
const readLatest=()=>JSON.parse(gh('api','repos/'+repo+'/releases/latest'));
if (process.argv[2]==='--sync-main') {
 const latest=readLatest();
 assert.equal(latest.tag_name,tag);
 assert.equal(latest.target_commitish,sha);
 assert.equal(latest.draft,false);
 assert.equal(latest.prerelease,false);
 assert.match(latest.body,/Windows 画风迭代的 GPU 实测本版未执行/);
 assert.equal(peek('refs/tags/'+tag),sha);
 const receipt=JSON.parse(fs.readFileSync('release-assets/verification.json','utf8'));
 assert.equal(receipt.sha,sha);
 assert.equal(receipt.fullScopeCertified,false);
 assert.equal(receipt.waived.length,1);
 assert.equal(receipt.waived[0].status,'not-tested');
 assert.equal(receipt.waived[0].feature,'artist-iteration');
 assert.equal(receipt.waived[0].platform,'windows');
 assert.equal(receipt.releaseScopeSummary.verifiedSlots,186);
 assert.equal(receipt.releaseScopeSummary.pendingSlots,1);
 for(const a of receipt.assets){
  const published=latest.assets.find(b=>b.name===a.name);
  assert.equal(published?.size,a.size,a.name+' asset size');
  if(published.digest){assert.equal(published.digest,'sha256:'+a.sha256,a.name+' digest');}
  else{
   const tmp=fs.mkdtempSync(process.env.RUNNER_TEMP+'/v297-digest-');
   gh('release','download',tag,'--repo',repo,'--pattern',a.name,'--dir',tmp);
   assert.equal(createHash('sha256').update(fs.readFileSync(tmp+'/'+a.name)).digest('hex'),a.sha256,a.name+' downloaded digest');
  }
 }
 assert.equal(peek('refs/heads/main'),old,'Main advanced: never force overwrite');
 git('merge-base','--is-ancestor',old,sha);
 git('push','origin',sha+':refs/heads/main');
 assert.equal(peek('refs/heads/main'),sha);
 const current=JSON.parse(gh('api','repos/'+repo));
 assert.equal(current.default_branch,'main');
 assert.equal(current.homepage,'https://github.com/'+repo+'/releases/latest');
 for(const file of ['README.md','README.en.md','README.ja.md','README.ko.md','README.zh-TW.md','docs/RELEASE_NOTES.md']){
  const remote=JSON.parse(gh('api','repos/'+repo+'/contents/'+file+'?ref=main'));
  assert.deepEqual(Buffer.from(remote.content,'base64'),fs.readFileSync(file));
 }
 console.log('RELEASE_LATEST_AND_MAIN_VERIFIED',latest.html_url,sha);
 process.exit(0);
}
assert.equal(process.argv.length,2,'Unknown release argument');
assert.equal(peek('refs/heads/main'),old,'Main changed before publication');
assert.equal(peek('refs/heads/codex/release-v2.9.7-classic-cost'),sha,'Candidate branch no longer points to pinned source');
assert.equal(peek('refs/tags/'+tag),'','Tag already exists');
assert.equal(readLatest().tag_name,'v2.9.6');
for(let i=0;i<110;i++){
 let pending=0;
 for(const [workflow,id] of inputs){
  const evidence=JSON.parse(gh('api','repos/'+repo+'/actions/runs/'+id));
  assert.equal(evidence.head_sha,sha);
  assert.equal(evidence.path,'.github/workflows/'+workflow);
  assert.equal(evidence.head_branch,'codex/release-v2.9.7-classic-cost');
  console.log('RELEASE_CHECK',workflow,id,evidence.status,evidence.conclusion??'');
  if(evidence.status!=='completed'){pending++; continue;}
  if(workflow==='feature-acceptance.yml'){
   const native=JSON.parse(gh('run','view',id,'--repo',repo,'--json','headSha,status,conclusion,jobs'));
   // This strict aggregate may fail only for the deliberately missing hardware proof.
   // The original matrix and every source-bound receipt are revalidated by the publisher.
   assertV297CloudNativeRun(native,{sourceSha:sha});
  }else assert.equal(evidence.conclusion,'success',workflow+' must pass before publication');
 }
 if(!pending){
  assert.equal(peek('refs/heads/main'),old,'Main changed during release checks');
  assert.equal(peek('refs/heads/codex/release-v2.9.7-classic-cost'),sha);
  assert.equal(readLatest().tag_name,'v2.9.6');
  assert.equal(peek('refs/tags/'+tag),'');
  console.log('ALL_SOURCE_BOUND_GATE_RUNS_ADMITTED');
  process.exit(0);
 }
 await sleep(45000);
}
throw Error('Timed out waiting for pinned source checks; no publication performed');
