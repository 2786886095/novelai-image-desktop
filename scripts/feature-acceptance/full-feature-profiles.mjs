import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {releaseFeatures,releasePlatforms} from '../release-platform-contract.mjs';

// Client acceptance: real production functions/state/editor, native files/plugins,
// and real HTTP/process integration may use disposable local services. This does
// not certify a remote model's image quality, actual billing, or a paid account.
const definitions = {
  generation:['submit-result-history','invalid-params-no-submit','cancel-and-upstream-error'],
  'image-to-image':['input-strength-and-params','decode-and-save','invalid-image-no-mutation'],
  enhance:['scale-output-valid','boundary-invalid','error-cancel-preserves-source'],
  inpaint:['mask-source-pixel-preservation','focused4k-work-pasteback','restore-before-image-mask-roi','invalid-roi-no-submit'],
  postprocess:['all-supported-tools','parameters-results-history','invalid-cancel-errors'],
  reverse:['mode-and-scope-system-import','valid-json-and-visible-result','refusal-truncated-invalid-preserve'],
  convert:['three-modes-and-import','structured-variants-preserve-escapes','errors-preserve-results'],
  'metadata-import':['default-online-local-bytes','offline-and-selected-apply','formats-error-cancel-no-upload'],
  tools:['all-user-exposed-tools','arguments-output-files','errors-privacy-cancel'],
  'reference-presets':['import-export-bytes','groups-edit-reopen','apply-and-invalid'],
  'online-gallery':['browse-search-pagination','inspect-download-presets','network-error-cancel'],
  'image-agent':['proposal-approve-execute','history-context-reopen','deny-cancel-tool-safety'],
  'ai-records':['record-request-response-status','refresh-expand-clear-memory-history-boundary','sensitive-fields-redacted'],
  works:['filter-group-and-reopen','rename-collision-bytes','delete-safety-and-errors'],
  styles:['crud-reopen','apply-selected-fields','preview-batch-import-invalid'],
  favorites:['copy-rename-remove-original','saved-generated-sort-unknown','reopen-stale-revision'],
  accounts:['secure-crud-switch','binding-after-switch','invalid-credential-errors-no-leak'],
  settings:['persist-and-reopen','independent-service-proxy','invalid-change-no-destruction'],
  typography:['all-font-controls','localized-samples-reopen','bounds-layout'],
  translation:['languages-source-detect','preserve-tags-weights','failure-cancel-no-overwrite'],
  'negative-prompts':['crud-and-reopen','selected-apply-and-character-uc','invalid-no-destruction'],
  characters:['multi-caption-centers','positive-negative-json','model-cap-and-errors'],
  'vibe-transfer':['file-encoding-model','multi-vibe-request','clear-invalid-cap'],
  'precise-reference':['types-model-and-count','multi-ref-cost-payload','clear-invalid-failure'],
  effort:['high-medium-and-restore','model-steps-wire','unknown-price-policy'],
  batch:['queue-order-owner-lifecycle','cancel-errors-retry','history-output'],
  comic:['project-panels-persist','context-convert-generate','cancel-selective-export'],
  'artist-iteration':['model-runtime-lifecycle','search-score-selected-generation','install-resume-error'],
  'random-artists':['filters-sampling','saved-library-groups','invalid-offline'],
  'openai-inpaint':['engine-size-mask-request','preview-compose-original','cancel-error-restore'],
  'external-mcp-server':['tool-discovery-native-bridge','actual-local-tool-request','auth-errors-budget-safety'],
  backup:['archive-export-inspect','selective-restore-dedupe','corrupt-no-mutation-safety-rescue'],
  clipboard:['native-unicode-text','png-metadata-copy-paste','invalid-input-no-file-leak'],
  navigation:['all-platform-routes','return-edit-no-lost-state','ordering-persist-narrow-window'],
  'output-management':['managed-write-no-clobber','folder-choice-history-link','invalid-outside-paths-no-delete'],
  'agent-components':['install-verify-activate','stop-restore-recovery','missing-config-actual-process'],
  updates:['version-check-platform-links','download-verify-failure','profile-preserved-update-boundary'],
  'works-batch-edit':['move-multiple-dedupe','delete-selected-shared-files','invalid-stale-partial-error'],
  'missing-file-reconciliation':['delete-confirmed-missing','move-rebind-content','offline-root-keeps-record'],
};
assert.deepEqual(Object.keys(definitions).sort(),[...releaseFeatures].sort());
export const fullFeatureProfiles=Object.freeze(Object.fromEntries(releaseFeatures.map(feature=>[feature,Object.freeze({
  feature,scenarios:Object.freeze(definitions[feature]),
  acceptance:'real client native/integration/device execution; no source-only, compile-only, mock-only, or component-count substitution',
})])));
export const profileSha256=crypto.createHash('sha256').update(JSON.stringify(fullFeatureProfiles)).digest('hex');
export {releaseFeatures,releasePlatforms};

export function assertScenarioReceipt(receipt,{sourceSha,platform}={}){
  assert.equal(receipt?.schema,'client-feature-scenarios/v1');
  assert.ok(/^[a-f0-9]{40}$/i.test(receipt.sourceSha),'Scenario receipt needs committed source identity');
  if(sourceSha)assert.equal(receipt.sourceSha,sourceSha,'Scenario source differs');
  assert.ok(releasePlatforms.includes(receipt.platform));
  if(platform)assert.equal(receipt.platform,platform,'Scenario platform differs');
  assert.equal(receipt.profileSha256,profileSha256,'Scenario acceptance definitions differ');
  assert.equal(receipt.mockedModules,false,'Mock modules cannot certify a native scenario');
  assert.equal(receipt.isolated,true,'Disposable profile/device required');
  assert.equal(receipt.sourceQualified,true,'Native source must be qualified, not dirty or uncommitted');
  assert.equal(receipt.exitStatus,0,'Failed process receipt cannot certify scenarios');
  assert.ok(receipt.nativeRuntime&&['electron','flutter'].includes(receipt.nativeRuntime.type)&&typeof receipt.nativeRuntime.version==='string'&&receipt.nativeRuntime.version,'Actual target native runtime required');
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
