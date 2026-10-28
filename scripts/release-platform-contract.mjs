import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {profileSha256 as expectedProfileSha256} from './feature-acceptance/full-feature-profile-definitions.mjs';
import {windowsArtistRuntimeType,windowsArtistScenarioReceipt} from './feature-acceptance/windows-artist-contract.mjs';

// Product scope, not a build-success checklist. A synchronized version number
// or a packaged installer is not evidence that a feature was ported.
// Desktop-only product: Windows and macOS are the only supported and released platforms.
export const supportedPlatforms = Object.freeze(['windows','macos']);
export const releasePlatforms = Object.freeze(['windows','macos']);
export const releaseExcludedPlatforms = Object.freeze([]);
export const releaseFeatures = Object.freeze([
  'generation','image-to-image','enhance','inpaint','postprocess','reverse','convert',
  'metadata-import','tools','reference-presets','online-gallery',
  'ai-records','works','styles','favorites','accounts','settings','typography',
  'translation','negative-prompts','characters','vibe-transfer','precise-reference',
  'effort','batch','comic','artist-iteration','random-artists','openai-inpaint',
  'external-mcp-server','backup','clipboard','navigation','output-management',
  'works-batch-edit','missing-file-reconciliation',
]);

// The user approved Windows-only local Artist iteration.
// All other features remain required on every current release target.
export const releaseScopeId = 'desktop-windows-local-capabilities/v5';
export const artistIterationScenarios = Object.freeze(['model-runtime-lifecycle','search-score-selected-generation','install-resume-error']);
export function releaseFeatureApplicability(feature, platform) {
  assert.ok(releaseFeatures.includes(feature),'Unrecognized feature: '+feature);
  assert.ok(releasePlatforms.includes(platform),'Unrecognized platform: '+platform);
  return feature==='artist-iteration' && platform!=='windows' ? 'not-supported' : 'required';
}
const releaseScope = Object.freeze({
  id:releaseScopeId,
  excludedPlatforms:releaseExcludedPlatforms,
  applicability:Object.freeze(releaseFeatures.map(feature=>Object.freeze({feature,platforms:Object.freeze(Object.fromEntries(releasePlatforms.map(platform=>[platform,releaseFeatureApplicability(feature,platform)])))}))),
});
export const releaseScopeSha256 = crypto.createHash('sha256').update(JSON.stringify(releaseScope)).digest('hex');
export const releaseScopeCounts = Object.freeze({declaredSlots:72,requiredSlots:71,notSupportedSlots:1});

export function assertReleasePlatformContract(report, {version, sourceSha}) {
  assert.ok(/^\d+\.\d+\.\d+$/.test(version),'Invalid release version');
  assert.ok(/^[a-f0-9]{40}$/i.test(sourceSha),'Invalid immutable source SHA');
  assert.equal(report?.schema,2,'Explicit scoped desktop feature evidence is required');
  assert.equal(report.profileSha256,expectedProfileSha256,'Scenario acceptance profile differs from current source definitions');
  assert.equal(report.releaseScopeId,releaseScopeId,'Release scope identity differs');
  assert.equal(report.releaseScopeSha256,releaseScopeSha256,'Release applicability policy differs');
  assert.equal(report.full195Certified,false,'Legacy five-platform full195 certification must stay false');
  assert.equal(report.full156Certified,false,'Legacy four-platform full156 certification must stay false');
  assert.equal(report.releaseReady,false,'Feature scope alone cannot certify publication readiness');
  assert.equal(report.releaseScopeCertified,true,'All required scoped cells must be certified');
  assert.equal(report.version,version,'Feature evidence version differs');
  assert.equal(report.sourceSha,sourceSha,'Feature evidence belongs to another source');
  assert.deepEqual([...report.platforms].sort(),[...releasePlatforms].sort(),
    'Release scope must include both desktop platforms exactly once');
  assert.deepEqual(report.supportedPlatforms,[...supportedPlatforms],'Product/native support inventory differs');
  assert.deepEqual(report.excludedPlatforms,[...releaseExcludedPlatforms],'Explicit release exclusions differ');
  assert.ok(Array.isArray(report.features),'Feature matrix is required');
  const seen=new Set();
  for(const feature of report.features) {
    assert.ok(releaseFeatures.includes(feature.id),'Unrecognized feature: '+feature.id);
    assert.ok(!seen.has(feature.id),'Duplicate feature: '+feature.id);seen.add(feature.id);
    assert.deepEqual(Object.keys(feature.platforms??{}).sort(),[...releasePlatforms].sort(),
      'Feature platform keys must match this release exactly');
    for(const platform of releasePlatforms) {
      const result=feature.platforms?.[platform];
      const applicability=releaseFeatureApplicability(feature.id,platform);
      assert.equal(result?.applicability,applicability,`${feature.id}/${platform} applicability differs`);
      if(applicability==='not-supported') {
        assert.equal(result.status,'not-supported','Not-supported is not a verified execution');
        const fields=new Set(['applicability','status','reasonCode','declaredScenarios','requiredScenarios','completedScenarios','missingScenarios','excludedObservedScenarios','unqualifiedObservedScenarios','componentObservations','evidence']);
        assert.ok(Object.keys(result).every(field=>fields.has(field)),'Not-supported cells cannot carry pass/execution claims');
        assert.equal(result.reasonCode,releaseScopeId,'Not-supported reason differs');
        assert.deepEqual(result.declaredScenarios,[...artistIterationScenarios],'Excluded scenario declarations differ');
        for(const field of ['requiredScenarios','completedScenarios','missingScenarios','evidence'])
          assert.deepEqual(result[field],[],`Not-supported ${field} must be explicitly empty`);
        continue;
      }
      assert.equal(result?.status,'verified',`${feature.id}/${platform} is not accepted`);
      assert.ok(Array.isArray(result.evidence) && result.evidence.length>0,
        `${feature.id}/${platform} has no execution evidence`);
      for(const proof of result.evidence) {
        assert.equal(proof.sourceSha,sourceSha,'Evidence source differs');
        assert.equal(proof.feature,feature.id,'Evidence feature differs');
        assert.equal(proof.platform,platform,'Evidence platform differs');
        assert.equal(proof.exitStatus,0,'Failed execution cannot satisfy acceptance');
        assert.equal(proof.skipped,false,'Skipped checks cannot satisfy acceptance');
        assert.ok(['native-runtime','integration','device'].includes(proof.kind),
          'Source search, compile-only, mock-only or version sync cannot certify parity');
        assert.ok(typeof proof.artifact==='string' && proof.artifact.trim(),
          'Execution evidence artifact is required');
        assert.ok(/^[a-f0-9]{64}$/i.test(proof.sha256),'Evidence artifact SHA-256 is required');
      }
    }
  }
  assert.deepEqual([...seen].sort(),[...releaseFeatures].sort(),'Incomplete feature inventory');
  for(const [field,value] of Object.entries(releaseScopeCounts))
    assert.equal(report.summary?.[field],value,'Scoped summary differs: '+field);
  assert.equal(report.summary.verifiedSlots,releaseScopeCounts.requiredSlots,'Required scoped feature coverage is incomplete');
  assert.equal(report.summary.partialSlots,0);assert.equal(report.summary.pendingSlots,0);
  return {platforms:releasePlatforms.length,features:releaseFeatures.length};
}

export function assertReleaseEvidenceFiles(report, evidenceRoot) {
  // Validate the exact policy before an empty not-supported evidence array can be skipped.
  assertReleasePlatformContract(report,{version:report?.version,sourceSha:report?.sourceSha});
  const root=fs.realpathSync(evidenceRoot);
  for(const feature of report.features) for(const platform of releasePlatforms)
    for(const proof of feature.platforms[platform].evidence) {
      assert.ok(!path.isAbsolute(proof.artifact),'Evidence must be relative to its root');
      const file=fs.realpathSync(path.resolve(root,proof.artifact));
      const relative=path.relative(root,file);
      assert.ok(relative && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative),
        'Evidence must stay in the evidence directory, including symlink resolution');
      const bytes=fs.readFileSync(file);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),proof.sha256,
        'Execution evidence bytes changed');
      const evidence=JSON.parse(bytes.toString('utf8'));
      const artist=feature.id==='artist-iteration'&&platform==='windows';
      if(artist)assert.equal(evidence.nativeRuntime?.type,windowsArtistRuntimeType,'Windows Artist evidence requires the dedicated GPU controller');
      if(artist||proof.companionProofArtifact!==undefined||proof.companionProofSha256!==undefined){
        assert.ok(typeof proof.companionProofArtifact==='string'&&!path.isAbsolute(proof.companionProofArtifact),'Companion proof must be a relative file');
        assert.match(proof.companionProofSha256??'',/^[a-f0-9]{64}$/,'Companion proof SHA-256 is required');
        const candidate=path.resolve(root,proof.companionProofArtifact),stat=fs.lstatSync(candidate);
        assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=64*1024*1024,'Companion proof must be a bounded regular file');
        const companion=fs.realpathSync(candidate),rel=path.relative(root,companion);
        assert.ok(rel&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel),'Companion proof must stay in the evidence directory');
        const companionBytes=fs.readFileSync(companion);
        assert.equal(crypto.createHash('sha256').update(companionBytes).digest('hex'),proof.companionProofSha256,'Companion proof bytes changed');
        if(artist){
          assert.match(report.profileSha256??'',/^[a-f0-9]{64}$/,'Scenario profile identity required');
          assert.deepEqual(evidence,windowsArtistScenarioReceipt(JSON.parse(companionBytes.toString('utf8')),{sourceSha:report.sourceSha,profileSha256:expectedProfileSha256}),'Artist execution receipt differs from the current source-bound GPU proof');
        }
      }
      assert.ok(evidence.checks?.some(check=>
        check.feature===feature.id && check.platform===platform && check.sourceSha===report.sourceSha &&
        check.kind===proof.kind && check.exitStatus===0 && check.skipped===false &&
        Array.isArray(check.command) && check.command.length>0 &&
        typeof check.stdout==='string' && typeof check.stderr==='string'),
        'Evidence does not contain the claimed executed feature/platform check');
    }
}
