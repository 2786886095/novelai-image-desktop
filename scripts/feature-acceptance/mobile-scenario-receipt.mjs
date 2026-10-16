import {mobileNativeEntries,isMobileScenarioEntry} from './mobile-entry-specs.mjs';
import assert from 'node:assert/strict';
import {fullFeatureProfiles,profileSha256} from './full-feature-profiles.mjs';
import {mobileScenarioInventories} from './mobile-scenario-inventory.mjs';

// Adapt only explicit scenario proofs from the new mixed seven-CHECK entry.
// Its three reverse components remain in the original native receipt, never
// promoted merely because the native app emitted seven successful CHECKs.
export function buildMobileScenarioReceipt({nativeReceipt,sourceQualified,nativeRuntime}) {
  const r=nativeReceipt;
  const entry=mobileNativeEntries[r.entry],policy=entry&&entry.scenarioChecks>0?{expectedChecks:entry.expectedChecks,scenarios:entry.scenarioChecks,components:entry.expectedChecks-entry.scenarioChecks}:null;
  assert.ok(policy,'Unknown independently counted mobile scenario entry');
  assert.ok(!entry.platforms||entry.platforms.includes(r.platform),'Native entry cannot certify an unsupported target platform');
  assert.equal(r.expectedChecks,policy.expectedChecks);
  assert.equal(r.exitStatus,0);
  assert.equal(r.isolated,true);
  assert.equal(r.checks.length,policy.expectedChecks);
  assert.equal(r.nativeCompletion?.checks,policy.expectedChecks);
  assert.equal(r.nativeCompletion?.exitStatus,0);
  assert.equal(r.nativeCompletion?.profileSha,profileSha256);
  assert.equal(r.nativeCompletion?.sourceSha,r.sourceSha);
  assert.equal(r.nativeCompletion?.platform,r.platform);
  assert.ok(nativeRuntime?.type==='flutter'&&typeof nativeRuntime.version==='string'&&nativeRuntime.version);
  const selected=[];const seen=new Set();
  for(const c of r.checks){
    assert.equal(c.sourceSha,r.sourceSha);assert.equal(c.platform,r.platform);
    assert.equal(c.profileSha,profileSha256);assert.equal(c.exitStatus,0);
    assert.equal(c.mockOnly,false);assert.equal(c.paidCalls,0);
    if(c.acceptanceLevel!=='scenario')continue;
    assert.ok(fullFeatureProfiles[c.feature]?.scenarios.includes(c.scenario),'Unknown native scenario');
    const key=c.feature+'/'+c.scenario;assert.ok(!seen.has(key),'Duplicate native scenario');seen.add(key);
    assert.ok(c.observed&&Object.keys(c.observed).length);
    selected.push({...c,skipped:false});
  }
  assert.equal(selected.length,policy.scenarios,'Entry must prove its independent scenario count');
  const expected=mobileScenarioInventories[r.entry];
  assert.ok(expected,'Scenario entry requires an independent exact inventory');
  assert.equal(expected.length,policy.scenarios,'Host scenario count differs from fixed inventory');
  assert.deepEqual(selected.map(c=>c.feature+'/'+c.scenario).sort(),[...expected].sort(),'Native scenario inventory differs');
  return {schema:'client-feature-scenarios/v1',sourceSha:r.sourceSha,platform:r.platform,
    profileSha256,mockedModules:false,isolated:true,sourceQualified:sourceQualified===true,
    nativeRuntime,exitStatus:0,checks:selected,componentChecksNotPromoted:policy.components,
    full195Certified:false,boundary:'Only explicitly registered scenario CHECKs are adapted; bounded components are retained in the native receipt. Source qualification remains strict and is not inferred from app success.'};
}
