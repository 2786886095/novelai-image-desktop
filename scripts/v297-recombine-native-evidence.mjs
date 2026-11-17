import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {assertReleasePlatformContract,assertReleaseEvidenceFiles} from './release-platform-contract.mjs';
const sha='c7e3c194e90e9a8d4494d04604518ec5c5d86de5';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha);
assert.equal(process.env.GH_REPO,'2786886095/novelai-image-desktop');
const run=JSON.parse(execFileSync('gh',['run','view','44124653287','--repo',process.env.GH_REPO,'--json','headSha,status,conclusion,jobs'],{encoding:'utf8'}));
const parts=['core','text','library','os','metadata','gallery','japanese','generation','ui','workflows'];
const required=['windows-latest','macos-15','ubuntu-24.04'].map(p=>'desktop-components ('+p+')').concat(['android','ios'].flatMap(p=>parts.map(x=>p+'-components ('+x+')'))).concat('windows-artist-local-proof','full-client-feature-matrix');
assert.deepEqual(run.jobs.map(j=>j.name).sort(),required.sort());assert.equal(run.headSha,sha);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');
for(const j of run.jobs){
 assert.equal(j.status,'completed');
 if(j.name==='windows-artist-local-proof'){assert.equal(j.conclusion,'skipped');}
 else if(j.name==='ios-components (ui)'){
  assert.equal(j.conclusion,'cancelled');assert.equal(j.steps.length,0);
  const annotations=JSON.parse(execFileSync('gh',['api','repos/'+process.env.GH_REPO+'/check-runs/'+j.databaseId+'/annotations'],{encoding:'utf8'}));
  assert(annotations.some(a=>a.message==='The job was not acquired by Runner of type hosted even after multiple attempts'));
 }else if(j.name==='full-client-feature-matrix'){
  assert.equal(j.conclusion,'failure');
  assert.deepEqual(j.steps.filter(s=>s.conclusion==='failure').map(s=>s.name),['Verify all required cloud cells and preserve the exact matrix']);
 }else assert.equal(j.conclusion,'success',j.name);
}
const root=path.join(process.env.RUNNER_TEMP,'all-native-evidence'),out=path.join(process.env.RUNNER_TEMP,'v297-recombined-feature-evidence');
const dirs=fs.readdirSync(root).sort();
assert.equal(dirs.length,23,'All 23 component artifact directories required');
assert(dirs.includes('native-components-ios-ui-'+sha));
const {writeFullFeatureMatrix}=await import(pathToFileURL(path.resolve('scripts/feature-acceptance/build-full-feature-matrix.mjs')));
const {report,exitStatus}=writeFullFeatureMatrix({evidenceRoot:root,outputRoot:out,sourceSha:sha,version:'2.9.7'});
assert.equal(exitStatus,0);
assertReleasePlatformContract(report,{version:'2.9.7',sourceSha:sha,waiveWindowsArtistGpuV297:true});
assertReleaseEvidenceFiles(report,out,{waiveWindowsArtistGpuV297:true});
fs.writeFileSync(path.join(out,'SUPPLEMENT_PROVENANCE.json'),JSON.stringify({sourceSha:sha,originalNativeRun:'44124653287',originalRunAttempt:4,uiSupplementRun:process.env.GITHUB_RUN_ID,uiSupplementPolicySha:process.env.GITHUB_SHA,runnerPolicy:'macos-26 ARM; unchanged same-source UI/native scenario entries',summary:report.summary,onlyOmission:'Windows artist-iteration GPU not tested'},null,2)+'\n');
console.log('RECOMBINED_ALL_186_OTHER_CELLS_VERIFIED',JSON.stringify(report.summary));
