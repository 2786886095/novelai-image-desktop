import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {assertV299CloudNativeRun} from './release-platform-contract.mjs';
const sha='860cc73ad90db1a3e50765a27c40f053ea7c9c89';
const old='0770b270b2b9e7ee948637b77b290d4784284531';
const tag='v2.9.9';
const repo='2786886095/novelai-image-desktop';
const inputs=[
 ['build.yml','44463863496'],
 ['build-mobile.yml','44463868130'],
 ['feature-acceptance.yml','44463850901'],
 ['image-metadata.yml','44463857167'],
 ['ios-folder-native-diagnostic.yml','44463872815'],
];
const run=(command,...args)=>execFileSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024}).trim();
// Only retry read-only API/network errors. Never retry publishing or a failed assertion.
const gh=(...args)=>{
 for(let i=0;;i++){
  try{return run('gh',...args);}catch(error){
   const detail=String(error.stderr??error.message);
   if(i>=3 || !/unexpected end of JSON input|unexpected EOF|TLS handshake timeout|connection reset|HTTP 50[234]/i.test(detail))throw error;
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2000*(i+1));
  }
 }
};
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
 assert.equal(latest.body.replaceAll('\r\n','\n').trim(),fs.readFileSync('docs/RELEASE_NOTES.md','utf8').replaceAll('\r\n','\n').trim());
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
   const tmp=fs.mkdtempSync(process.env.RUNNER_TEMP+'/v299-digest-');
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
assert.equal(peek('refs/heads/codex/release-v2.9.9-tag-search'),sha,'Candidate branch no longer points to pinned source');
assert.equal(peek('refs/tags/'+tag),'','Tag already exists');
assert.equal(readLatest().tag_name,'v2.9.8');
for(let i=0;i<200;i++){
 let pending=0;
 for(const [workflow,id] of inputs){
  const evidence=JSON.parse(gh('api','repos/'+repo+'/actions/runs/'+id));
  assert.equal(evidence.head_sha,sha);
  assert.equal(evidence.path,'.github/workflows/'+workflow);
  assert.equal(evidence.head_branch,'codex/release-v2.9.9-tag-search');
  console.log('RELEASE_CHECK',workflow,id,evidence.status,evidence.conclusion??'');
  if(evidence.status!=='completed'){pending++; continue;}
  if(workflow==='feature-acceptance.yml'){
   const native=JSON.parse(gh('run','view',id,'--repo',repo,'--json','headSha,status,conclusion,jobs'));
   // This strict aggregate may fail only for the deliberately missing hardware proof.
   // The original matrix and every source-bound receipt are revalidated by the publisher.
   assertV299CloudNativeRun(native,{sourceSha:sha});
  }else assert.equal(evidence.conclusion,'success',workflow+' must pass before publication');
 }
 if(!pending){
  assert.equal(peek('refs/heads/main'),old,'Main changed during release checks');
  assert.equal(peek('refs/heads/codex/release-v2.9.9-tag-search'),sha);
  assert.equal(readLatest().tag_name,'v2.9.8');
  assert.equal(peek('refs/tags/'+tag),'');
  console.log('ALL_SOURCE_BOUND_GATE_RUNS_ADMITTED');
  process.exit(0);
 }
 await sleep(45000);
}
throw Error('Timed out waiting for pinned source checks; no publication performed');
