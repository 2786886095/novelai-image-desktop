import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Product scope, not a build-success checklist. A synchronized version number
// or an APK/IPA artifact is not evidence that a feature was ported.
export const releasePlatforms = Object.freeze(['windows','macos','linux','android','ios']);
export const releaseFeatures = Object.freeze([
  'generation','image-to-image','enhance','inpaint','postprocess','reverse','convert',
  'metadata-import','tools','reference-presets','online-gallery','image-agent',
  'ai-records','works','styles','favorites','accounts','settings','typography',
  'translation','negative-prompts','characters','vibe-transfer','precise-reference',
  'effort','batch','comic','artist-iteration','random-artists','openai-inpaint',
  'external-mcp-server','backup','clipboard','navigation','output-management',
  'agent-components','updates','works-batch-edit','missing-file-reconciliation',
]);

// The user narrowed only local Artist retrieval/scoring/iteration to Windows.
// This does not waive any other feature, platform package, or release gate.
export const releaseScopeId = 'artist-iteration-windows-only/v1';
export const artistIterationScenarios = Object.freeze(['model-runtime-lifecycle','search-score-selected-generation','install-resume-error']);
export function releaseFeatureApplicability(feature, platform) {
  assert.ok(releaseFeatures.includes(feature),'Unrecognized feature: '+feature);
  assert.ok(releasePlatforms.includes(platform),'Unrecognized platform: '+platform);
  return feature==='artist-iteration' && platform!=='windows' ? 'not-supported' : 'required';
}
const releaseScope = Object.freeze({
  id:releaseScopeId,
  applicability:Object.freeze(releaseFeatures.map(feature=>Object.freeze({feature,platforms:Object.freeze(Object.fromEntries(releasePlatforms.map(platform=>[platform,releaseFeatureApplicability(feature,platform)])))}))),
});
export const releaseScopeSha256 = crypto.createHash('sha256').update(JSON.stringify(releaseScope)).digest('hex');
export const releaseScopeCounts = Object.freeze({declaredSlots:195,requiredSlots:191,notSupportedSlots:4});

export function assertReleasePlatformContract(report, {version, sourceSha}) {
  assert.ok(/^\d+\.\d+\.\d+$/.test(version),'Invalid release version');
  assert.ok(/^[a-f0-9]{40}$/i.test(sourceSha),'Invalid immutable source SHA');
  assert.equal(report?.schema,2,'Explicit scoped five-platform feature evidence is required');
  assert.equal(report.releaseScopeId,releaseScopeId,'Release scope identity differs');
  assert.equal(report.releaseScopeSha256,releaseScopeSha256,'Release applicability policy differs');
  assert.equal(report.full195Certified,false,'Four not-supported cells must never certify full195');
  assert.equal(report.releaseReady,false,'Feature scope alone cannot certify publication readiness');
  assert.equal(report.releaseScopeCertified,true,'All required scoped cells must be certified');
  assert.equal(report.version,version,'Feature evidence version differs');
  assert.equal(report.sourceSha,sourceSha,'Feature evidence belongs to another source');
  assert.deepEqual([...report.platforms].sort(),[...releasePlatforms].sort(),
    'Release scope must include all five platforms exactly once');
  assert.ok(Array.isArray(report.features),'Feature matrix is required');
  const seen=new Set();
  for(const feature of report.features) {
    assert.ok(releaseFeatures.includes(feature.id),'Unrecognized feature: '+feature.id);
    assert.ok(!seen.has(feature.id),'Duplicate feature: '+feature.id);seen.add(feature.id);
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
  assert.equal(report.summary.verifiedSlots,191,'Required scoped feature coverage is incomplete');
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
      assert.ok(evidence.checks?.some(check=>
        check.feature===feature.id && check.platform===platform && check.sourceSha===report.sourceSha &&
        check.kind===proof.kind && check.exitStatus===0 && check.skipped===false &&
        Array.isArray(check.command) && check.command.length>0 &&
        typeof check.stdout==='string' && typeof check.stderr==='string'),
        'Evidence does not contain the claimed executed feature/platform check');
    }
}
