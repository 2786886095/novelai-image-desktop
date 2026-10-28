import assert from 'node:assert/strict';
import {fullFeatureProfiles,profileSha256} from './full-feature-profile-definitions.mjs';
import {windowsArtistRuntimeType,windowsArtistScenarioReceipt} from './windows-artist-contract.mjs';
import {releaseFeatures,releasePlatforms,supportedPlatforms} from '../release-platform-contract.mjs';

// Client acceptance: real production functions/state/editor, native files/plugins,
// and real HTTP/process integration may use disposable local services. This does
// not certify a remote model's image quality, actual billing, or a paid account.
assert.deepEqual(Object.keys(fullFeatureProfiles).sort(),[...releaseFeatures].sort());
export {fullFeatureProfiles,profileSha256};
export {releaseFeatures,releasePlatforms,supportedPlatforms};

export function assertScenarioReceipt(receipt,{sourceSha,platform,windowsArtistProof}={}){
  assert.equal(receipt?.schema,'client-feature-scenarios/v1');
  assert.ok(/^[a-f0-9]{40}$/i.test(receipt.sourceSha),'Scenario receipt needs committed source identity');
  if(sourceSha)assert.equal(receipt.sourceSha,sourceSha,'Scenario source differs');
  assert.ok(supportedPlatforms.includes(receipt.platform));
  if(platform)assert.equal(receipt.platform,platform,'Scenario platform differs');
  assert.equal(receipt.profileSha256,profileSha256,'Scenario acceptance definitions differ');
  assert.equal(receipt.mockedModules,false,'Mock modules cannot certify a native scenario');
  assert.equal(receipt.isolated,true,'Disposable profile/device required');
  assert.equal(receipt.sourceQualified,true,'Native source must be qualified, not dirty or uncommitted');
  assert.equal(receipt.exitStatus,0,'Failed process receipt cannot certify scenarios');
  if(receipt.platform==='windows'&&Array.isArray(receipt.checks)&&receipt.checks.some(check=>check.feature==='artist-iteration')){
    assert.equal(receipt.nativeRuntime?.type,windowsArtistRuntimeType,'Windows Artist scenarios require the dedicated actual GPU controller proof, not a generic native receipt');
  }
  if(receipt.nativeRuntime?.type===windowsArtistRuntimeType){
    assert.equal(receipt.platform,'windows','Dedicated Windows Artist proof cannot certify other platforms');
    assert.ok(windowsArtistProof,'Actual sibling Windows Artist controller proof is required');
    assert.deepEqual(receipt,windowsArtistScenarioReceipt(windowsArtistProof,{sourceSha:receipt.sourceSha,profileSha256}),'Windows Artist receipt must equal independently revalidated exact three-scenario GPU proof');
  }else assert.ok(receipt.nativeRuntime&&receipt.nativeRuntime.type==='electron'&&typeof receipt.nativeRuntime.version==='string'&&receipt.nativeRuntime.version,'Actual target native runtime required');
  assert.ok(Array.isArray(receipt.checks)&&receipt.checks.length>0);
  const seen=new Set();
  for(const check of receipt.checks){
    assert.ok(fullFeatureProfiles[check.feature]);
    assert.ok(fullFeatureProfiles[check.feature].scenarios.includes(check.scenario),'Unknown client scenario');
    const key=check.feature+'/'+check.scenario;assert.ok(!seen.has(key),'Duplicate scenario');seen.add(key);
    assert.equal(check.sourceSha,receipt.sourceSha);assert.equal(check.platform,receipt.platform);
    assert.equal(check.acceptanceLevel,'scenario');
    assert.ok(['native-runtime','integration','device'].includes(check.kind));
    assert.equal(check.exitStatus,0);assert.equal(check.skipped,false);
    assert.ok(Array.isArray(check.command)&&check.command.length>0);
    assert.equal(typeof check.stdout,'string');assert.equal(typeof check.stderr,'string');
    assert.ok(check.observed&&typeof check.observed==='object'&&Object.keys(check.observed).length>0);
  }
  return receipt;
}
