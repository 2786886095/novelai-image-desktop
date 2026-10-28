import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {linuxReleaseBaseline,parseOsRelease,assertLinuxReleaseBaseline} from './linux-release-baseline.mjs';
import {releaseScopeCounts,releasePlatforms,releaseFeatureApplicability} from '../release-platform-contract.mjs';
import {fullFeatureProfiles} from './full-feature-profile-definitions.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const yaml=createRequire(import.meta.url)('js-yaml');
const sourceSha='a'.repeat(40);
function fixture(){return {schema:'linux-release-baseline/v1',sourceSha,phase:'desktop-build',functionalCertificationGranted:false,platform:'linux',arch:'x64',osReleaseRaw:'NAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n',commands:[['uname',['-a'],'Linux fixture 6.8.0 x86_64 GNU/Linux\n'],['uname',['-m'],'x86_64\n'],['getconf',['GNU_LIBC_VERSION'],'glibc 2.39\n'],['git',['rev-parse','HEAD'],sourceSha+'\n']].map(([file,args,stdout])=>({file,args,stdout,stderr:'',exitStatus:0,signal:null,error:null}))};}
test('synthetic matching host is identity only, never functional certification',()=>{assert.deepEqual(linuxReleaseBaseline,{id:'ubuntu',versionId:'24.04',arch:'x64',machine:'x86_64'});assert.deepEqual(assertLinuxReleaseBaseline(fixture()),{id:'ubuntu',versionId:'24.04',arch:'x64',sourceSha,functionalCertificationGranted:false});});
test('actual distribution, architecture, machine and source must all match',()=>{for(const edit of[r=>r.platform='win32',r=>r.arch='arm64',r=>r.osReleaseRaw='ID=ubuntu\nVERSION_ID="26.04"\n',r=>r.osReleaseRaw='ID=debian\nVERSION_ID="24.04"\n',r=>r.commands[1].stdout='aarch64\n',r=>r.commands[3].stdout='b'.repeat(40)+'\n',r=>r.sourceSha='main',r=>r.phase='android',r=>r.functionalCertificationGranted=true]){const r=fixture();edit(r);assert.throws(()=>assertLinuxReleaseBaseline(r));}});
test('literal os-release parsing never executes shell expansion or accepts duplicate facts',()=>{assert.equal(parseOsRelease('ID=ubuntu\nVERSION_ID=24.04\nPRETTY_NAME="Ubuntu 24.04 LTS"\n').ID,'ubuntu');for(const raw of['ID=ubuntu\nID=ubuntu\nVERSION_ID=24.04','ID=ubuntu\nVERSION_ID="24.04','ID=ubuntu\nVERSION_ID=24.04;echo x','\0',''])assert.throws(()=>parseOsRelease(raw));assert.throws(()=>assertLinuxReleaseBaseline({...fixture(),osReleaseRaw:'ID=ubuntu\nVERSION_ID="$(printf 24.04)"\n'}));});
test('failed, timed-out, truncated or substituted commands cannot grant a baseline pass',()=>{for(const edit of[r=>r.commands.pop(),r=>r.commands[0].exitStatus=1,r=>r.commands[0].signal='SIGTERM',r=>r.commands[0].error='ETIMEDOUT',r=>r.commands[0].stdout='',r=>r.commands[0].stderr=null,r=>r.commands[0].args=['-m'],r=>r.commands[2].stdout='unknown libc\n']){const r=fixture();edit(r);assert.throws(()=>assertLinuxReleaseBaseline(r));}});
test('only the two desktop Linux runner selections change; source native and packaging gates remain required',()=>{
 const build=yaml.load(read('.github/workflows/build.yml')),feature=yaml.load(read('.github/workflows/feature-acceptance.yml'));
 assert.equal(build.jobs.build.strategy.matrix.include.find(x=>x.name==='linux').os,'ubuntu-24.04');
 assert.deepEqual(feature.jobs['desktop-components'].strategy.matrix.os,['windows-latest','macos-14','ubuntu-24.04']);
 assert.equal(build.jobs['publish-verified']['runs-on'],'ubuntu-latest');assert.equal(feature.jobs['android-components']['runs-on'],'ubuntu-latest');
 for(const[job,phase]of[[build.jobs.build,'desktop-build'],[feature.jobs['desktop-components'],'desktop-native']]) {
  const collect=job.steps.findIndex(s=>s.name==='Record and require actual Ubuntu 24.04 x64 desktop host');assert(collect>=0);const step=job.steps[collect];assert.equal(step.if,"runner.os == 'Linux'");assert.equal(step['continue-on-error'],undefined);assert.match(step.run,new RegExp('linux-release-baseline\\.mjs --source-sha "\\$\\{\\{ github.sha \\}\\}" --phase '+phase));
  assert(collect<job.steps.findIndex(s=>s.run==='npm ci'||s.run==='npm ci --no-audit --no-fund'));
  const upload=job.steps.find(s=>s.name==='Upload Linux baseline identity and raw host commands');assert(upload);assert.equal(upload.if,"always() && runner.os == 'Linux'");assert.equal(upload.with['if-no-files-found'],'error');assert.match(upload.with.path,/linux-baseline\/.*\.json/);
 }
 assert(build.jobs.build.steps.some(s=>s.run==='npm run typecheck && npm test'));assert(build.jobs.build.steps.some(s=>s.run==='node scripts/verify-packaged-runtime.mjs'));
 assert(build.jobs.build.steps.some(s=>s.run==='node --test scripts/feature-acceptance/linux-release-baseline.test.mjs'));
 assert(feature.jobs['full-client-feature-matrix'].steps.some(s=>s.name==='Check matrix rejection rules'&&s.run.includes('scripts/feature-acceptance/linux-release-baseline.test.mjs')));
 assert(feature.jobs['desktop-components'].steps.some(s=>typeof s.run==='string'&&s.run.includes('desktop-japanese-comic-native:desktop-japanese-comic-acceptance')));
});
test('all five README download rows disclose the target baseline and current Ubuntu 26 limitation',()=>{for(const f of['README.md','README.en.md','README.ja.md','README.ko.md','README.zh-TW.md']){const row=read(f).split(/\r?\n/).find(l=>/^\| Linux /.test(l));assert(row,f);assert.match(row,/Ubuntu 24\.04 LTS/);assert.match(row,/Ubuntu 26\.04/);assert.match(row,/x86_64/);assert.doesNotMatch(row,/validated baseline|已通过|已通過|検証済み|검증 완료/i);}for(const f of['docs/RELEASE_NOTES.md','docs/history/RELEASE_NOTES-2.6.8.md']){const text=read(f);assert.match(text,/Ubuntu 24\.04 LTS/);assert.match(text,/Ubuntu 26\.04/);assert.match(text,/卡住/);assert.match(text,/同源/);assert.match(text,/187/);}});
test('distribution qualification never changes the 195/187/8 scope or original 132 scenario inventory',()=>{assert.deepEqual(releaseScopeCounts,{declaredSlots:195,requiredSlots:187,notSupportedSlots:8});assert.deepEqual(releasePlatforms,['windows','macos','linux','android','ios']);assert.equal(Object.values(fullFeatureProfiles).reduce((n,p)=>n+p.scenarios.length,0),132);for(const f of['agent-components','artist-iteration'])for(const p of releasePlatforms)assert.equal(releaseFeatureApplicability(f,p),p==='windows'?'required':'not-supported');});
test('CLI refuses a previous output and has no environment or architecture override inputs',()=>{const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'linux-baseline-policy-'));try{const out=path.join(tmp,'receipt.json');fs.writeFileSync(out,'prior evidence\n');const helper=path.join(root,'scripts/feature-acceptance/linux-release-baseline.mjs');for(const args of[['--source-sha',sourceSha,'--phase','desktop-build','--output',out],['--source-sha',sourceSha,'--phase','desktop-build','--output',path.join(tmp,'fresh.json'),'--arch','x64']]){const r=spawnSync(process.execPath,[helper,...args],{encoding:'utf8',timeout:10000});assert.equal(r.status,1,r.stderr);}assert.equal(fs.readFileSync(out,'utf8'),'prior evidence\n');assert.equal(fs.existsSync(path.join(tmp,'fresh.json')),false);}finally{fs.rmSync(tmp,{recursive:true,force:true});}});
