// Synthetic schema regression only. No native execution, formal import or release
// certification is performed; the hypothetical unit fixture has a fixed fake
// source identity. Explicit UNIT markers are denied at every production entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createWindowsArtistUnitProof} from './windows-artist-contract-fixture.mjs';
import {windowsArtistScenarioReceipt} from './windows-artist-contract.mjs';
import {assertScenarioReceipt, profileSha256, releaseFeatures, releasePlatforms, fullFeatureProfiles} from './full-feature-profiles.mjs';
import {buildFullFeatureMatrix, collectReceiptFiles} from './build-full-feature-matrix.mjs';
import {assertReleasePlatformContract, assertReleaseEvidenceFiles, releaseFeatureApplicability} from '../release-platform-contract.mjs';
import {assertWindowsArtistProductionProof} from './import-windows-artist-evidence.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sourceSha = 'a'.repeat(40), version = '2.6.4';
function unit() {
  const fixture = createWindowsArtistUnitProof({profileSha256});
  const receipt = windowsArtistScenarioReceipt(fixture.proof, fixture.bindings);
  return {...fixture, receipt, artifact: 'windows-artist-receipt.json', sha256: hash(encode(receipt)),
    windowsArtistProof: fixture.proof, windowsArtistProofArtifact: 'controller-proof.json', windowsArtistProofFileSha256: hash(encode(fixture.proof))};
}
function matrix(receipts) {return buildFullFeatureMatrix({version, sourceSha, receipts});}
function cell(report) {return report.features.find(feature => feature.id === 'artist-iteration').platforms.windows;}
function temporary(t) {const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-artist-matrix-unit-')); t.after(() => {assert(path.basename(root).startsWith('windows-artist-matrix-unit-')); assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, {recursive: true, force: true});}); return root;}
function writeUnit(root, item = unit()) {fs.mkdirSync(root, {recursive: true}); fs.writeFileSync(path.join(root, item.artifact), encode(item.receipt)); fs.writeFileSync(path.join(root, 'controller-proof.json'), encode(item.proof)); return item;}

test('shared hypothetical unit structure walks factory and current-profile validator, never native execution', () => {
  const item = unit(); assert.equal(item.unitOnly, true); assert.equal(item.sourceSha, undefined);
  assert.equal(item.proof.sourceSha, sourceSha); assert.equal(item.proof.profileSha256, profileSha256);
  assert.deepEqual(assertScenarioReceipt(item.receipt, {sourceSha, platform: 'windows', windowsArtistProof: item.proof}), item.receipt);
  const marked = structuredClone(item.proof); marked.diagnostics = {label: 'UNIT_ONLY_STRUCTURAL_TEST'};
  assert.throws(() => assertWindowsArtistProductionProof(marked), /Unit fixture/);
});
test('dedicated GPU receipt without companion proof cannot enter matrix acceptance', () => {
  const item = unit(); assert.throws(() => assertScenarioReceipt(item.receipt, {sourceSha}), /controller proof/);
  delete item.windowsArtistProof; const report = matrix([item]); assert.equal(report.summary.verifiedSlots, 0); assert.equal(cell(report).status, 'partial'); assert.deepEqual(cell(report).completedScenarios, []); assert.deepEqual(cell(report).evidence, []);
  assert(report.diagnostics.some(row => row.classification === 'not-release-qualified'));
});
test('generic Electron or Flutter runtime cannot bypass mandatory Windows Artist GPU proof', () => {
  for (const type of ['electron', 'flutter']) {
    const item = unit(); item.receipt.nativeRuntime = {type, version: 'UNIT_ONLY_NOT_EXECUTED'};
    assert.throws(() => assertScenarioReceipt(item.receipt, {sourceSha}), /Artist|artist|GPU/);
    assert.equal(matrix([item]).summary.verifiedSlots, 0);
  }
});
test('changing proof/controller/native observation/receipt hash or removing a scenario rejects exact GPU route', () => {
  const changes = [i => {i.proof.nativeCommand.stdout += 'WINDOWS_ARTIST_CHECK broken\n';}, i => {i.proof.controllerSources[0].sha256 = 'e'.repeat(64);}, i => {i.proof.sourceAfter.clean = false;}, i => {i.receipt.windowsArtistProofSha256 = 'e'.repeat(64);}, i => {i.receipt.checks.pop();}, i => {i.receipt.checks[0].observed.stopExitObserved = false;}];
  for (const change of changes) {const item = unit(); change(item); assert.throws(() => assertScenarioReceipt(item.receipt, {sourceSha, windowsArtistProof: item.proof})); assert.equal(matrix([item]).summary.verifiedSlots, 0);}
});
test('one complete UNIT schema route covers only Windows Artist, not other features or release readiness', () => {
  const item = unit(), report = matrix([item]); assert.equal(report.summary.verifiedSlots, 1); assert.equal(report.summary.pendingSlots, 70); assert.equal(report.summary.notSupportedSlots, 1);
  assert.equal(cell(report).status, 'verified'); assert.deepEqual(cell(report).completedScenarios, fullFeatureProfiles['artist-iteration'].scenarios);
  assert.equal(report.features.find(row => row.id === 'artist-iteration').platforms.macos.status, 'not-supported');
  assert.equal(report.releaseScopeCertified, false); assert.equal(report.releaseReady, false); assert.equal(report.full195Certified, false);
});
test('collector copies fixed sibling raw proof and binds exact companion SHA in matrix evidence', t => {
  const root = temporary(t), input = path.join(root, 'input'), output = path.join(root, 'output'), item = writeUnit(input);
  const rows = collectReceiptFiles(input, output); assert.equal(rows.length, 1); const row = rows[0];
  assert.deepEqual(row.windowsArtistProof, item.proof); assert.equal(row.windowsArtistProofFileSha256, hash(encode(item.proof)));
  assert.equal(hash(fs.readFileSync(path.join(output, row.windowsArtistProofArtifact))), row.windowsArtistProofFileSha256);
  const evidence = cell(matrix(rows)).evidence[0]; assert.equal(evidence.companionProofArtifact, row.windowsArtistProofArtifact); assert.equal(evidence.companionProofSha256, row.windowsArtistProofFileSha256);
  assert.equal(hash(fs.readFileSync(path.join(input, 'controller-proof.json'))), item.windowsArtistProofFileSha256);
});
test('missing sibling stays an unqualified partial observation, never synthesized as proof', t => {
  const root = temporary(t), input = path.join(root, 'input'), output = path.join(root, 'output'), item = writeUnit(input); fs.unlinkSync(path.join(input, 'controller-proof.json'));
  const rows = collectReceiptFiles(input, output); assert.equal(rows.length, 1); assert.equal(rows[0].windowsArtistProof, undefined);
  assert.equal(cell(matrix(rows)).status, 'partial'); assert.deepEqual(cell(matrix(rows)).evidence, []); assert.equal(item.unitOnly, true);
});
test('sibling proof with wrong bytes or a non-file cannot be promoted by collector route', t => {
  for (const kind of ['tampered', 'directory']) {
    const root = temporary(t), input = path.join(root, 'input'), output = path.join(root, 'output'); writeUnit(input);
    const file = path.join(input, 'controller-proof.json');
    if (kind === 'directory') {fs.unlinkSync(file); fs.mkdirSync(file); assert.throws(() => collectReceiptFiles(input, output), /regular file/);}
    else {const proof = JSON.parse(fs.readFileSync(file)); proof.sourceQualified = false; fs.writeFileSync(file, encode(proof)); const rows = collectReceiptFiles(input, output); assert.equal(cell(matrix(rows)).status, 'partial'); assert.equal(matrix(rows).summary.verifiedSlots, 0);}
  }
});
function allRequired(root) {
  const artist = writeUnit(root), items = [artist];
  for (const platform of releasePlatforms) {
    const receipt = {schema: 'client-feature-scenarios/v1', sourceSha, platform, profileSha256, mockedModules: false, isolated: true, sourceQualified: true, exitStatus: 0, nativeRuntime: {type: 'electron', version: 'UNIT_ONLY_SCHEMA_NOT_EXECUTED'}, checks: releaseFeatures.filter(feature => releaseFeatureApplicability(feature, platform) === 'required' && !(platform === 'windows' && feature === 'artist-iteration')).flatMap(feature => fullFeatureProfiles[feature].scenarios.map(scenario => ({feature, scenario, sourceSha, platform, kind: 'native-runtime', acceptanceLevel: 'scenario', exitStatus: 0, skipped: false, command: ['synthetic-unit-only'], stdout: 'UNIT_ONLY not actual acceptance', stderr: '', observed: {syntheticUnitOnly: true}})))};
    const artifact = platform + '-receipt.json'; fs.writeFileSync(path.join(root, artifact), encode(receipt)); items.push({receipt, artifact, sha256: hash(encode(receipt))});
  }
  return {items, artist};
}
test('final file verifier must bind companion proof raw bytes, not just receipt JSON', t => {
  const root = temporary(t), {items} = allRequired(root), report = matrix(items);
  assert.equal(report.summary.verifiedSlots, 71); assert.doesNotThrow(() => assertReleaseEvidenceFiles(report, root));
  fs.appendFileSync(path.join(root, 'controller-proof.json'), ' ');
  assert.throws(() => assertReleaseEvidenceFiles(report, root), /proof|Proof|companion|Companion|bytes changed/);
});
test('final file verifier rejects absent companion hash/path even if receipt itself is unchanged', t => {
  for (const key of ['companionProofArtifact', 'companionProofSha256']) {
    const root = temporary(t), {items} = allRequired(root), report = matrix(items); delete cell(report).evidence[0][key];
    assert.throws(() => assertReleaseEvidenceFiles(report, root), /proof|Proof|companion|Companion/);
  }
});
test('final companion proof cannot escape evidence root or be a directory', t => {
  for (const kind of ['outside', 'absolute', 'directory']) {
    const outer = temporary(t), root = path.join(outer, 'evidence'); fs.mkdirSync(root); const {items, artist} = allRequired(root), report = matrix(items), evidence = cell(report).evidence[0];
    if (kind === 'directory') {fs.unlinkSync(path.join(root, 'controller-proof.json')); fs.mkdirSync(path.join(root, 'controller-proof.json'));}
    else {const outside = path.join(outer, 'outside-proof.json'); fs.writeFileSync(outside, encode(artist.proof)); evidence.companionProofArtifact = kind === 'absolute' ? outside : '../outside-proof.json';}
    assert.throws(() => assertReleaseEvidenceFiles(report, root));
  }
});
test('coherent companion rehash does not hide altered native proof semantics or report profile', t => {
  for (const kind of ['proof', 'profile']) {
    const root = temporary(t), {items, artist} = allRequired(root), report = matrix(items);
    if (kind === 'profile') report.profileSha256 = 'f'.repeat(64);
    else {artist.proof.sourceAfter.clean = false; const bytes = encode(artist.proof); fs.writeFileSync(path.join(root, 'controller-proof.json'), bytes); cell(report).evidence[0].companionProofSha256 = hash(bytes);}
    assert.throws(() => assertReleaseEvidenceFiles(report, root));
  }
});
test('explicit deep UNIT markers are rejected by receipt, matrix and final file-verifier production entries', t => {
  for (const marker of ['UNIT_ONLY_STRUCTURAL_TEST', 'UNIT_FIXTURE_NOT_EXECUTED']) {
    const item = unit(); item.proof.diagnostics = {nested: [{label: marker}]};
    assert.throws(() => assertScenarioReceipt(item.receipt, {sourceSha, windowsArtistProof: item.proof}), /unit|fixture|marker/i);
    const diagnostic = matrix([item]); assert.equal(diagnostic.summary.verifiedSlots, 0); assert.deepEqual(cell(diagnostic).evidence, []);
    assert(diagnostic.diagnostics.some(row => row.classification === 'not-release-qualified' && /unit|fixture|marker/i.test(row.reason)));
    const root = temporary(t), {items, artist} = allRequired(root), report = matrix(items);
    artist.proof.diagnostics = {nested: [{label: marker}]}; const bytes = encode(artist.proof); fs.writeFileSync(path.join(root, 'controller-proof.json'), bytes); cell(report).evidence[0].companionProofSha256 = hash(bytes);
    assert.throws(() => assertReleaseEvidenceFiles(report, root), /unit|fixture|marker/i);
  }
});
test('coherently rehashed forged profile cannot choose its own expected definitions in any admission route', t => {
  const forgedProfile = 'e'.repeat(64), fixture = createWindowsArtistUnitProof({profileSha256: forgedProfile});
  const receipt = windowsArtistScenarioReceipt(fixture.proof, fixture.bindings);
  const item = {...unit(), receipt, proof: fixture.proof, windowsArtistProof: fixture.proof, sha256: hash(encode(receipt)), windowsArtistProofFileSha256: hash(encode(fixture.proof))};
  assert.throws(() => assertScenarioReceipt(receipt, {sourceSha, windowsArtistProof: fixture.proof}), /profile|definitions/i);
  assert.equal(matrix([item]).summary.verifiedSlots, 0);
  const root = temporary(t), {items, artist} = allRequired(root), report = matrix(items);
  fs.writeFileSync(path.join(root, artist.artifact), encode(receipt)); fs.writeFileSync(path.join(root, 'controller-proof.json'), encode(fixture.proof));
  Object.assign(cell(report).evidence[0], {sha256: hash(encode(receipt)), companionProofSha256: hash(encode(fixture.proof))});
  report.profileSha256 = forgedProfile;
  assert.throws(() => assertReleasePlatformContract(report, {sourceSha, version}), /profile|definitions/i);
  assert.throws(() => assertReleaseEvidenceFiles(report, root), /profile|definitions/i);
});
