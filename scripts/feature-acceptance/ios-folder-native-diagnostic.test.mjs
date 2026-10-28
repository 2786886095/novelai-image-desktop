// Static workflow/policy guards only. Passing is not actual macOS/Simulator acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {load} from 'js-yaml';
const file=new URL('../../.github/workflows/ios-folder-native-diagnostic.yml',import.meta.url);
const text=fs.readFileSync(file,'utf8'),workflow=load(text);
const expectedPaths=[
 '.github/workflows/ios-folder-native-diagnostic.yml',
 'scripts/feature-acceptance/ios-folder-native-diagnostic.test.mjs',
 'scripts/feature-acceptance/ios-folder-picker-driver.mjs',
 'scripts/feature-acceptance/ios-folder-picker-driver.test.mjs',
 'scripts/feature-acceptance/ios-folder-picker-observer.test.mjs',
 'scripts/feature-acceptance/native-resident-pending.test.mjs',
 'scripts/feature-acceptance/native-proof-stream.mjs',
 'scripts/feature-acceptance/fixtures/ios-process-identity.c',
 'scripts/feature-acceptance/fixtures/ios-folder-picker-ui.swift'];
function policy(w){
 assert.equal(w.name,'iOS folder native diagnostic only');
 assert.deepEqual(Object.keys(w.on).sort(),['push','workflow_dispatch']);
 assert.deepEqual(w.on.push.branches,['codex/release-2.6.8-comic-parity-ba4304ed']);
 assert.deepEqual(w.on.push.paths,expectedPaths);
 assert.equal(w.on.workflow_dispatch,null);
 assert.deepEqual(w.permissions,{contents:'read',actions:'read'});
 assert.deepEqual(Object.keys(w.jobs),['ios-folder1-diagnostic-only']);
 const j=w.jobs['ios-folder1-diagnostic-only'];assert.equal(j['runs-on'],'macos-14');
 assert.equal(j['timeout-minutes'],75);assert.equal(j.strategy,undefined);
 assert(j.steps.every(s=>s['continue-on-error']===undefined));
 return j.steps;
}
const steps=policy(workflow),named=name=>steps.find(s=>s.name===name);
test('push reaches only the current candidate branch and narrow explicit paths, with read-only token',()=>{
 policy(workflow);assert(!text.includes('secrets.'));assert(!text.includes('workflow_run:'));
 assert(!text.includes('pull_request_target'));assert(!text.includes('contents: write'));
});
test('policy rejects branch broadening, write access, new arbitrary inputs and extra jobs',()=>{
 for(const mutate of [w=>w.on.push.branches.push('main'),w=>w.on.push.paths.push('**'),
   w=>w.permissions.contents='write',w=>w.on.workflow_dispatch={inputs:{ref:{type:'string'}}},
   w=>w.jobs.extra={...w.jobs['ios-folder1-diagnostic-only']},
   w=>w.jobs['ios-folder1-diagnostic-only'].steps[0]['continue-on-error']=true]){
  const copy=structuredClone(workflow);mutate(copy);assert.throws(()=>policy(copy));
 }
});
test('toolchain and pinned metadata check match real formal iOS setup, not an alternate fake runner',()=>{
 assert.equal(steps.find(s=>s.uses==='actions/checkout@v5').with,undefined);
 assert.equal(steps.find(s=>s.uses==='actions/setup-node@v4').with['node-version'],'24.14.0');
 assert.equal(steps.find(s=>s.uses==='subosito/flutter-action@v2').with['flutter-version'],'3.24.0');
 assert(steps.some(s=>s.run==='npm ci --ignore-scripts --no-audit --no-fund'));
 assert(steps.some(s=>s.run==='node scripts/build-mobile-metadata-runtime.mjs --check'));
 assert(steps.some(s=>s.run==='flutter pub get'&&s['working-directory']==='mobile'));
});
test('raw checkout guard and nonce binding run before dependencies and enforce actual immutable Git blobs',()=>{
 const raw=named('Verify exact checkout bytes against index and commit').run;
 for(const literal of ['GITHUB_SHA','head !== process.env.GITHUB_SHA','ls-files','--stage',
  'crypto.createHash(\'sha1\')','actual !== oid','Raw checkout byte mismatch'])assert(raw.includes(literal));
 const bind=named('Bind a fresh diagnostic nonce to immutable raw source').run;
 for(const literal of ['crypto.randomUUID()','captureSourceState','requirePristine:true',
  'diagnosticOnly:true','eligibleForPublication:false','formalFeatureRun:false'])assert(bind.includes(literal));
 assert(steps.indexOf(named('Verify exact checkout bytes against index and commit'))<steps.findIndex(s=>s.run?.startsWith('npm ci')));
});
test('single entry reuses actual source workspace/input/runner and independently requires one qualified scenario',()=>{
 const body=named('Execute only the unchanged real ios_folder1 native entry').run;
 for(const literal of ["const entry='ios_folder1'",'spec.expectedChecks!==1','spec.scenarioChecks!==1',
  'createEntryWorkspace','captureSourceState',"'ci','--ignore-scripts','--no-audit','--no-fund'",
  'write-ci-input.mjs',"'ios',device,entry", "'1'],120000)",'run-mobile-native.mjs',
  'buildMobileScenarioReceipt','receipt.checks?.length!==1','scenario.checks.length!==1',
  'sourceAfter.clean','sourceAfter.rawMatchesHead','reopened.sourceQualified!==true',
  'timeout=2100000','if(row.exitStatus!==0||row.error||row.signal)throw Error'])assert(body.includes(literal),literal);
 assert(!body.includes('run-ci-mobile-entries'));assert(!body.includes('journeyTimeoutMs:'));
 assert(!body.includes('setTimeout'));assert(!body.includes('mockOnly:true'));
});
test('real disposable Simulator creation/strict cleanup are retained and cleanup outcome precedes final pass',()=>{
 const create=named('Create and boot a new disposable iOS Simulator');
 const stop=named('Stop only the newly created test simulator');
 const finish=named('Record diagnostic outcome including strict own-Simulator cleanup');
 assert.equal(create.run,'node scripts/feature-acceptance/create-disposable-ios-simulator.mjs');
 assert.equal(stop.run,'node scripts/feature-acceptance/stop-disposable-ios-simulator.mjs');
 assert.equal(stop.if,"always() && env.FEATURE_SIMULATOR != ''");
 assert(steps.indexOf(stop)<steps.indexOf(finish));assert(finish.if.startsWith('always()'));
 for(const literal of ['cleanup.exitStatus!==0','cleanup.failure!==null',
  "cleanup.result?.finalState!=='Shutdown'",'cleanup.device!==creation.device',
  'entry.diagnosticPassed!==true','requirePristine:true','diagnosticPassed:failure===null'])assert(finish.run.includes(literal));
});
test('diagnostic artifacts cannot be named as formal feature evidence or grant publication',()=>{
 const upload=steps.find(s=>s.uses==='actions/upload-artifact@v4');
 assert.equal(upload.if,'always()');assert.equal(upload.with['if-no-files-found'],'error');
 assert.equal(upload.with.name,'ios-folder1-diagnostic-only-${{ github.sha }}-${{ github.run_attempt }}');
 const finish=named('Record diagnostic outcome including strict own-Simulator cleanup').run;
 for(const literal of ['eligibleForPublication:false','formalFeatureRun:false','full195Certified:false',
  'nativeAcceptanceClaimed:false','cannot replace Native Client Feature Acceptance or its 187 scoped release cells'])assert(finish.includes(literal));
 assert(!/gh (?:release|workflow|api)|git (?:push|tag)|build-full-feature-matrix|publish-release/.test(text));
});
test('artifact whitelist includes raw/own-device/XCTest evidence but no dependency/profile/whole-Simulator tree',()=>{
 const p=steps.find(s=>s.uses==='actions/upload-artifact@v4').with.path;
 const lines=p.trim().split('\n');assert.equal(lines.length,18);
 for(const line of lines){assert(line.startsWith('${{ runner.temp }}/'));
  assert(!/node_modules|Pods|DerivedData|\.app\/|Keychain|\/data\/|feature-mobile-workspace|native-components/.test(line));
  assert(!line.endsWith('/feature-native-ios/'));assert(!line.endsWith('/ios-picker-host/**'));
 }
 for(const literal of ['SIMULATOR_CREATION.json','SIMULATOR_CLEANUP.json','native-app.stdout.txt',
   'native-app.stderr.txt','native-mobile-receipt.json','native-mobile-scenarios-receipt.json',
   'selection.xcresult/**'])assert(p.includes(literal));
});
test('every inline Node module parses without execution; this does not claim actual Xcode or native success',()=>{
 const scripts=[...text.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/g)];
 assert.equal(scripts.length,3);
 for(const [,script]of scripts){const r=spawnSync(process.execPath,['--input-type=module','--check'],
  {input:script,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(r.error,undefined);}
});
