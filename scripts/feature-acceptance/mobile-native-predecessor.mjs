import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Exactly one independently registered cold entry can retain this disposable
// app's data. A generic preserve/reset flag must never bypass normal clearing.
export function verifyMobilePredecessor(input, profileSha256) {
  if (input.entry !== 'skill_reopen1') {
    assert.equal(input.predecessorReceipt, undefined, 'Predecessor proof is only accepted by skill_reopen1');
    return null;
  }
  assert.equal(input.isolated, true);
  assert.match(input.sourceSha || '', /^[a-f0-9]{40}$/i);
  assert.equal(input.profileSha256, profileSha256);
  assert.equal(input.expectedChecks, 1);
  assert.equal(typeof input.predecessorReceipt, 'string', 'Cold entry requires the preceding native receipt');
  const file = path.resolve(input.predecessorReceipt);
  assert.equal(file, path.resolve(input.outputRoot, '../text15/native-mobile-receipt.json'),
    'Cold predecessor must be the same run output sibling, not historical evidence');
  const bytes = fs.readFileSync(file), previous = JSON.parse(bytes);
  assert.equal(path.basename(path.dirname(file)), 'text15', 'Only the fixed text15 predecessor is accepted');
  assert.equal(previous.entry, 'text15');
  for (const field of ['sourceSha', 'platform', 'device', 'appId', 'isolated']) assert.equal(previous[field], input[field], `Predecessor ${field} mismatch`);
  assert.equal(previous.expectedChecks, 15);
  assert.equal(previous.exitStatus, 0);
  assert.equal(previous.failure, null);
  assert.equal(previous.checks.length, 15);
  assert.equal(previous.nativeCompletion?.checks, 15);
  assert.equal(previous.nativeCompletion?.exitStatus, 0);
  assert.equal(previous.nativeCompletion?.sourceSha, input.sourceSha);
  assert.equal(previous.nativeCompletion?.platform, input.platform);
  assert.equal(previous.nativeCompletion?.profileSha, profileSha256);
  assert.equal(previous.nativeBegin?.testEntry, 'text15');
  assert.equal(previous.nativeBegin?.sourceSha, input.sourceSha);
  assert.equal(previous.nativeBegin?.profileSha, profileSha256);
  assert.equal(previous.nativeBegin?.expectedChecks, 15);
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
  assert.equal(qualified.checks.length, 15);
  assert.deepEqual(qualified.checks.map(check => [check.feature,check.scenario]).sort(),
    previous.checks.map(check => [check.feature,check.scenario]).sort());
  return {entry: 'text15', nativeReceipt: file, nativeReceiptSha256: sha(bytes),
    qualifiedReceipt: qualifiedFile, qualifiedReceiptSha256: sha(qualifiedBytes),
    nativePid: previous.nativeBegin.nativePid, sourceSha: input.sourceSha, profileSha256, platform: input.platform,
    device: input.device, sourceQualified: true};
}

export function verifyColdNativeRestart(predecessor, begin, {platform, observedAndroidPid} = {}) {
  if (!predecessor) return null;
  assert.equal(begin?.testEntry, 'skill_reopen1');
  assert.equal(begin?.sourceSha, predecessor.sourceSha);
  assert.equal(begin?.platform, predecessor.platform);
  assert.equal(begin?.profileSha, predecessor.profileSha256);
  assert.equal(begin?.expectedChecks, 1);
  assert.ok(Number.isSafeInteger(begin?.nativePid) && begin.nativePid > 0, 'Cold entry native app PID is missing');
  assert.notEqual(begin.nativePid, predecessor.nativePid, 'Cold reopen reused the previous native process');
  if (platform === 'android') assert.equal(begin.nativePid, observedAndroidPid, 'Native BEGIN PID differs from actual adb pidof');
  return {previousNativePid: predecessor.nativePid, reopenedNativePid: begin.nativePid,
    differentNativeProcessObserved: true, androidPidofMatched: platform === 'android' ? true : null};
}
