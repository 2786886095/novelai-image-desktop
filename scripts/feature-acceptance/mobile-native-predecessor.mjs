import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Only independently registered cold entries can retain this disposable
// app's data. A generic preserve/reset flag must never bypass normal clearing.
const coldPolicies=Object.freeze({skill_reopen1:Object.freeze({predecessor:'text15',warmChecks:15,coldChecks:1}),japanese_comic_reopen2:Object.freeze({predecessor:'japanese_comic8',warmChecks:8,coldChecks:2})});
export function verifyMobilePredecessor(input, profileSha256) {
  const policy=coldPolicies[input.entry];
  if (!policy) {
    assert.equal(input.predecessorReceipt, undefined, 'Predecessor proof is only accepted by registered cold entries');
    return null;
  }
  assert.equal(input.isolated, true);
  assert.match(input.sourceSha || '', /^[a-f0-9]{40}$/i);
  assert.equal(input.profileSha256, profileSha256);
  assert.equal(input.expectedChecks, policy.coldChecks);
  assert.equal(typeof input.predecessorReceipt, 'string', 'Cold entry requires the preceding native receipt');
  const file = path.resolve(input.predecessorReceipt);
  assert.equal(file, path.resolve(input.outputRoot, '../'+policy.predecessor+'/native-mobile-receipt.json'),
    'Cold predecessor must be the same run output sibling, not historical evidence');
  const bytes = fs.readFileSync(file), previous = JSON.parse(bytes);
  assert.equal(path.basename(path.dirname(file)), policy.predecessor, 'Only the fixed registered predecessor is accepted');
  assert.equal(previous.entry, policy.predecessor);
  for (const field of ['sourceSha', 'platform', 'device', 'appId', 'isolated']) assert.equal(previous[field], input[field], `Predecessor ${field} mismatch`);
  assert.equal(previous.expectedChecks, policy.warmChecks);
  assert.equal(previous.exitStatus, 0);
  assert.equal(previous.failure, null);
  assert.equal(previous.checks.length, policy.warmChecks);
  assert.equal(previous.nativeCompletion?.checks, policy.warmChecks);
  assert.equal(previous.nativeCompletion?.exitStatus, 0);
  assert.equal(previous.nativeCompletion?.sourceSha, input.sourceSha);
  assert.equal(previous.nativeCompletion?.platform, input.platform);
  assert.equal(previous.nativeCompletion?.profileSha, profileSha256);
  assert.equal(previous.nativeBegin?.testEntry, policy.predecessor);
  assert.equal(previous.nativeBegin?.sourceSha, input.sourceSha);
  assert.equal(previous.nativeBegin?.profileSha, profileSha256);
  assert.equal(previous.nativeBegin?.expectedChecks, policy.warmChecks);
  assert.ok(Number.isSafeInteger(previous.nativeBegin?.nativePid) && previous.nativeBegin.nativePid > 0,
    'Predecessor must report its actual native app PID, not the Flutter controller PID');
  for (const check of previous.checks) {
    assert.equal(check.sourceSha, input.sourceSha); assert.equal(check.platform, input.platform);
    assert.equal(check.profileSha, profileSha256); assert.equal(check.exitStatus, 0);
    assert.equal(check.mockOnly, false); assert.equal(check.skipped, false); assert.equal(check.paidCalls, 0);
  }
  // The native runner cannot self-assert post-build source qualification. Read
  // the sidecar produced only after the outer runner's exact Git/raw recheck.
  const qualifiedFile = path.join(path.dirname(file), 'native-mobile-scenarios-receipt.json');
  const qualifiedBytes = fs.readFileSync(qualifiedFile), qualified = JSON.parse(qualifiedBytes);
  assert.equal(qualified.schema, 'client-feature-scenarios/v1');
  assert.equal(qualified.sourceQualified, true);
  assert.equal(qualified.sourceSha, input.sourceSha); assert.equal(qualified.platform, input.platform);
  assert.equal(qualified.profileSha256, profileSha256); assert.equal(qualified.exitStatus, 0);
  assert.equal(qualified.isolated, true); assert.equal(qualified.mockedModules, false);
  assert.equal(qualified.checks.length, policy.warmChecks);
  assert.deepEqual(qualified.checks.map(check => [check.feature,check.scenario]).sort(),
    previous.checks.map(check => [check.feature,check.scenario]).sort());
  return {entry: policy.predecessor, coldEntry:input.entry, coldChecks:policy.coldChecks, nativeReceipt: file, nativeReceiptSha256: sha(bytes),
    qualifiedReceipt: qualifiedFile, qualifiedReceiptSha256: sha(qualifiedBytes),
    nativePid: previous.nativeBegin.nativePid, sourceSha: input.sourceSha, profileSha256, platform: input.platform,
    device: input.device, sourceQualified: true};
}

export function verifyColdNativeRestart(predecessor, begin, {platform, observedAndroidPid} = {}) {
  if (!predecessor) return null;
  assert.equal(begin?.testEntry, predecessor.coldEntry);
  assert.equal(begin?.sourceSha, predecessor.sourceSha);
  assert.equal(begin?.platform, predecessor.platform);
  assert.equal(begin?.profileSha, predecessor.profileSha256);
  assert.equal(begin?.expectedChecks, predecessor.coldChecks);
  assert.ok(Number.isSafeInteger(begin?.nativePid) && begin.nativePid > 0, 'Cold entry native app PID is missing');
  assert.notEqual(begin.nativePid, predecessor.nativePid, 'Cold reopen reused the previous native process');
  if (platform === 'android') assert.equal(begin.nativePid, observedAndroidPid, 'Native BEGIN PID differs from actual adb pidof');
  return {previousNativePid: predecessor.nativePid, reopenedNativePid: begin.nativePid,
    differentNativeProcessObserved: true, androidPidofMatched: platform === 'android' ? true : null};
}
